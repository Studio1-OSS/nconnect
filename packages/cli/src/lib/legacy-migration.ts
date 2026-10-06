import { execFile } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { ALL_HARNESSES } from "./harness.js";
import { isProcessAlive, nconnectHome } from "./paths.js";

/**
 * Carry existing `nebiusrelay` installs over to NConnect.
 *
 * The rebrand changed the home directory (`~/.nebiusrelay` → `~/.nconnect`),
 * the env prefix (`NEBIUSRELAY_*` → `NCONNECT_*`), the bundle name
 * (`nebiusrelay.js` → `nconnect.js`) and the login-service label. An old
 * install self-updates by downloading the new bundle over its old
 * `~/.nebiusrelay/bin/nebiusrelay.js`, so the first run of new code happens
 * from the old location with none of the new state in place. Without this
 * step that run would find no API key, no preferences, no usage history, and
 * - because the updater only recognises `~/.nconnect/bin/nconnect.js` as the
 * installed bundle - would never update again.
 *
 * Two phases, both best-effort:
 * - **Once** (a marker file in the new home records it): copy the legacy
 *   state and stop the legacy daemon.
 * - **Every start, until done**: install the bundle at the new path, rewrite
 *   our generated legacy wrappers to run it, repoint stale PATH links, and
 *   remove the legacy login service. Each step is idempotent and cheap, and
 *   is repeated because an earlier run may not have been able to do it (a dev
 *   build ran first, a service command failed). Stale-link repair also runs
 *   with no `~/.nebiusrelay` at all, for installs that skipped that era.
 *
 * The legacy state is never modified, apart from its generated wrappers.
 */

const LEGACY_DIR = ".nebiusrelay";
const LEGACY_BUNDLE = "nebiusrelay.js";
const LEGACY_PREFIX = "NEBIUSRELAY_";
const NEW_PREFIX = "NCONNECT_";
const MARKER = "migrated-from-nebiusrelay";
/** When the legacy login-service cleanup was last attempted (ms since epoch). */
const SERVICE_ATTEMPT_FILE = "legacy-service-cleanup-attempt";
/** Retry a failed service cleanup at most this often, so it can never stall every start. */
const SERVICE_RETRY_INTERVAL_MS = 24 * 60 * 60 * 1000;
/**
 * Per launchctl/systemctl call. An attempt makes two calls on macOS (bootout,
 * print) and up to three on Linux (disable, is-active, daemon-reload), so one
 * attempt is bounded by ~10s and ~15s respectively - once a day at most.
 */
const SERVICE_COMMAND_TIMEOUT_MS = 5_000;
const LEGACY_LAUNCHD_LABEL = "com.nebiusrelay.daemon";
const LEGACY_SYSTEMD_UNIT = "nebiusrelay-daemon.service";
/** Bin dirs of every previous generation of this tool, as PATH links point at them. */
const LEGACY_BIN_DIRS = [".nebiusrelay/bin", ".nebiuslink/bin"];

/** State worth carrying over. `bin`, logs and the pid file are deliberately not. */
const STATE_FILES = [
  "config.json",
  "preferences.json",
  "install-id",
  "local-proxy-token",
  "model-catalog.json",
  "daemon.sqlite",
  "daemon.sqlite-wal",
  "daemon.sqlite-shm",
];
const STATE_DIRS = ["prime-agent", "deepseek-harness", "codex-app", "backup"];

/**
 * `NEBIUSRELAY_FOO=…` keeps working as `NCONNECT_FOO` when the new name is
 * unset. Mutates `env` so every later `process.env.NCONNECT_*` read sees it.
 */
export function applyLegacyEnv(env: NodeJS.ProcessEnv): string[] {
  const applied: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(LEGACY_PREFIX) || value === undefined) {
      continue;
    }
    const renamed = NEW_PREFIX + key.slice(LEGACY_PREFIX.length);
    if (env[renamed] === undefined) {
      env[renamed] = value;
      applied.push(renamed);
    }
  }
  return applied;
}

export type LegacyMigrationOptions = {
  home?: string;
  /** The script this process is running - `process.argv[1]`. */
  argv1?: string | undefined;
  env?: NodeJS.ProcessEnv;
  /** Injected for tests; the real one calls launchctl / systemctl. */
  stopLegacyService?: (platform: NodeJS.Platform, home: string) => Promise<boolean>;
  /** PATH to scan for stale links; defaults to the process PATH. */
  pathDirs?: string[];
  /** Clock for the service-retry throttle; tests inject it. */
  now?: number;
};

export type LegacyMigrationResult = {
  copied: string[];
  rewroteWrappers: string[];
  installedBundle: boolean;
  stoppedDaemon: boolean;
  removedService: boolean;
  /** PATH links that pointed into an older install and now point at ~/.nconnect/bin. */
  repointedLinks: string[];
};

/**
 * A wrapper we generated, byte for byte: what `wrapperBody(bundle, harness)`
 * writes for this exact legacy bundle path and this wrapper's own harness
 * (a trailing newline is optional). Anything else - another bundle path, a
 * different harness, extra env or setup - is the user's and is left alone.
 */
export function isGeneratedWrapper(content: string, bundle: string, harness?: string): boolean {
  const expected = wrapperBody(bundle, harness);
  return content === expected || content === expected.trimEnd();
}

function wrapperBody(bundle: string, harness?: string): string {
  return `#!/usr/bin/env sh\nexec bun "${bundle}"${harness ? ` ${harness}` : ""} "$@"\n`;
}

/**
 * Remove the legacy login service. Returns true only once it is actually gone:
 * the service file is deleted after the service manager confirms it is no
 * longer loaded, so a failed `launchctl`/`systemctl` leaves the file in place
 * and the next start tries again.
 */
async function stopLegacyServiceReal(platform: NodeJS.Platform, home: string): Promise<boolean> {
  // The exit code, or undefined when the command could not tell us anything:
  // it failed to start (e.g. ENOENT), timed out, or was killed by a signal.
  // Only a real exit code may be read as "not loaded" below.
  const run = (file: string, args: string[]) =>
    new Promise<number | undefined>((resolve) =>
      execFile(file, args, { timeout: SERVICE_COMMAND_TIMEOUT_MS }, (err) => {
        if (!err) return resolve(0);
        const e = err as { code?: unknown; killed?: boolean; signal?: unknown };
        if (e.killed || e.signal || typeof e.code !== "number") return resolve(undefined);
        resolve(e.code);
      }),
    );
  if (platform === "darwin") {
    const plist = path.join(home, "Library", "LaunchAgents", `${LEGACY_LAUNCHD_LABEL}.plist`);
    if (!existsSync(plist)) {
      return false;
    }
    const service = `gui/${process.getuid?.() ?? os.userInfo().uid}/${LEGACY_LAUNCHD_LABEL}`;
    await run("launchctl", ["bootout", service]);
    // `print` exits 0 while the service is still loaded, nonzero once gone.
    const loaded = await run("launchctl", ["print", service]);
    if (loaded === undefined || loaded === 0) {
      return false; // still loaded, or we could not tell: keep it, retry later
    }
    try {
      await (await import("node:fs/promises")).unlink(plist);
    } catch {
      return false;
    }
    return true;
  }
  if (platform === "linux") {
    const base = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
    const unit = path.join(base, "systemd", "user", LEGACY_SYSTEMD_UNIT);
    if (!existsSync(unit)) {
      return false;
    }
    await run("systemctl", ["--user", "disable", "--now", LEGACY_SYSTEMD_UNIT]);
    // `is-active` exits 0 while the unit is running, nonzero once stopped.
    const active = await run("systemctl", ["--user", "is-active", "--quiet", LEGACY_SYSTEMD_UNIT]);
    if (active === undefined || active === 0) {
      return false; // still running, or we could not tell: keep it, retry later
    }
    try {
      await (await import("node:fs/promises")).unlink(unit);
    } catch {
      return false;
    }
    await run("systemctl", ["--user", "daemon-reload"]);
    return true;
  }
  return false;
}

/**
 * Run the migration (see the module comment for its two phases). Returns
 * undefined when this start changed nothing; otherwise what was done, for
 * the one-line notice.
 */
export async function migrateLegacyInstall(
  options: LegacyMigrationOptions = {},
): Promise<LegacyMigrationResult | undefined> {
  const home = options.home ?? os.homedir();
  const env = options.env ?? process.env;
  const legacyHome = env.NEBIUSRELAY_HOME || path.join(home, LEGACY_DIR);
  const newHome = env.NCONNECT_HOME || nconnectHome();
  const hasLegacyHome =
    existsSync(legacyHome) && path.resolve(legacyHome) !== path.resolve(newHome);
  const marker = path.join(newHome, MARKER);
  const firstRun = hasLegacyHome && !existsSync(marker);
  if (hasLegacyHome) {
    mkdirSync(newHome, { recursive: true });
  }

  const result: LegacyMigrationResult = {
    copied: [],
    rewroteWrappers: [],
    installedBundle: false,
    stoppedDaemon: false,
    removedService: false,
    repointedLinks: [],
  };

  // 1. State: copy only what the new home does not already have. Once.
  if (firstRun) {
    for (const name of STATE_FILES) {
      const from = path.join(legacyHome, name);
      const to = path.join(newHome, name);
      if (existsSync(from) && !existsSync(to)) {
        cpSync(from, to);
        result.copied.push(name);
      }
    }
    for (const name of STATE_DIRS) {
      const from = path.join(legacyHome, name);
      const to = path.join(newHome, name);
      if (existsSync(from) && !existsSync(to)) {
        cpSync(from, to, { recursive: true });
        result.copied.push(`${name}/`);
      }
    }
  }

  // 2. The legacy daemon: it serves old code from the old home. Stop it so the
  //    next launch starts a daemon from the migrated install. Once.
  const pidFile = path.join(legacyHome, "daemon.pid");
  if (firstRun && existsSync(pidFile)) {
    const pid = Number.parseInt(readFileSync(pidFile, "utf8").trim(), 10);
    if (Number.isFinite(pid) && isProcessAlive(pid)) {
      try {
        process.kill(pid, "SIGTERM");
        result.stoppedDaemon = true;
      } catch {
        // not ours, or already gone
      }
    }
  }

  // 3. The install. Checked on EVERY start, not just the first: the marker may
  //    have been written by a run that was not the legacy bundle (a dev build,
  //    a fresh nconnect install alongside), in which case this step could not
  //    run then. Until the old wrappers exec the new bundle, a legacy install
  //    runs new code from the old path, which the updater does not recognise,
  //    so it would never update again. Cheap: a few stats and tiny file reads.
  const legacyBin = path.join(legacyHome, "bin");
  const newBin = path.join(newHome, "bin");
  const newBundle = path.join(newBin, "nconnect.js");
  const argv1 = options.argv1 ?? process.argv[1];
  const runningLegacyBundle =
    typeof argv1 === "string" && path.resolve(argv1) === path.join(legacyBin, LEGACY_BUNDLE);
  if (hasLegacyHome && runningLegacyBundle && !existsSync(newBundle)) {
    mkdirSync(newBin, { recursive: true });
    cpSync(argv1, newBundle);
    result.installedBundle = true;
  }
  if (hasLegacyHome && existsSync(newBundle)) {
    const wrappers: Array<[string, string | undefined]> = [
      ["nconnect", undefined],
      ...ALL_HARNESSES.map((h): [string, string] => [`n${h}`, h]),
    ];
    for (const [name, harness] of wrappers) {
      const target = path.join(newBin, name);
      if (!existsSync(target)) {
        writeFileSync(target, wrapperBody(newBundle, harness), { encoding: "utf8", mode: 0o755 });
      }
    }
    // Old wrappers (`nebiusrelay`, `nclaude`, …) are rewritten only if they are
    // ours and still point at the legacy bundle - a customized script, or one
    // already rewritten, is left alone.
    const legacyWrappers: Array<[string, string | undefined]> = [
      ["nebiusrelay", undefined],
      ...wrappers.slice(1),
    ];
    for (const [name, harness] of legacyWrappers) {
      const legacyWrapper = path.join(legacyBin, name);
      if (!existsSync(legacyWrapper)) {
        continue;
      }
      let current = "";
      try {
        current = readFileSync(legacyWrapper, "utf8");
      } catch {
        continue;
      }
      if (!isGeneratedWrapper(current, path.join(legacyBin, LEGACY_BUNDLE), harness)) {
        continue; // customized, or already rewritten
      }
      writeFileSync(legacyWrapper, wrapperBody(newBundle, harness), {
        encoding: "utf8",
        mode: 0o755,
      });
      result.rewroteWrappers.push(name);
    }
  }

  // 3b. PATH links. The installer links our commands into the first writable
  //     PATH dir, and earlier generations did the same, so a machine can carry
  //     `nclaude -> ~/.nebiuslink/bin/nclaude` ahead of everything else on
  //     PATH. Auto-update users never re-run the installer, so repoint those
  //     here. Only links into one of our old bin dirs are touched. Every start.
  if (existsSync(newBundle)) {
    const names = ["nconnect", "nebiusrelay", "nebiuslink", ...ALL_HARNESSES.map((h) => `n${h}`)];
    const legacyBins = LEGACY_BIN_DIRS.map((d) => path.join(home, d));
    const pathDirs = options.pathDirs ?? (env.PATH ?? "").split(path.delimiter).filter(Boolean);
    for (const dir of new Set(pathDirs)) {
      if (path.resolve(dir) === path.resolve(newBin)) {
        continue;
      }
      for (const name of names) {
        const link = path.join(dir, name);
        let current: string;
        try {
          current = readlinkSync(link);
        } catch {
          continue; // not a symlink, or absent
        }
        const resolved = path.resolve(dir, current);
        if (!legacyBins.some((bin) => resolved.startsWith(bin + path.sep))) {
          continue;
        }
        // `nebiusrelay`/`nebiuslink` links become `nconnect`.
        const replacement = path.join(
          newBin,
          name.startsWith("n") && !existsSync(path.join(newBin, name)) ? "nconnect" : name,
        );
        if (!existsSync(replacement)) {
          continue;
        }
        try {
          unlinkSync(link);
          symlinkSync(replacement, link);
          result.repointedLinks.push(link);
        } catch {
          // read-only dir: leave it
        }
      }
    }
  }

  // 4. The old login service would keep starting the old daemon. Retried
  //    until it is confirmed gone (the real stopper is a no-op once its
  //    service file has been removed) - but at most once a day. The attempt
  //    is recorded before it runs, so a hung service manager can cost one
  //    launch a few seconds, never every launch.
  if (hasLegacyHome) {
    const now = options.now ?? Date.now();
    const attemptFile = path.join(newHome, SERVICE_ATTEMPT_FILE);
    let lastAttempt = 0;
    try {
      lastAttempt = Number.parseInt(readFileSync(attemptFile, "utf8").trim(), 10) || 0;
    } catch {
      // never attempted
    }
    if (now - lastAttempt >= SERVICE_RETRY_INTERVAL_MS) {
      try {
        writeFileSync(attemptFile, `${now}\n`, "utf8");
      } catch {
        // unwritable home: still attempt, just without the throttle
      }
      const stopService = options.stopLegacyService ?? stopLegacyServiceReal;
      try {
        result.removedService = await stopService(process.platform, home);
      } catch {
        // best-effort
      }
    }
  }

  if (firstRun) {
    writeFileSync(marker, `${new Date().toISOString()}\n`, "utf8");
    return result;
  }
  // A later run only reports when it actually changed something.
  return result.installedBundle ||
    result.rewroteWrappers.length > 0 ||
    result.repointedLinks.length > 0 ||
    result.removedService
    ? result
    : undefined;
}

/** One stderr notice so the user knows what just happened and what to type now. */
export function legacyMigrationNotice(result: LegacyMigrationResult): string {
  const parts: string[] = ["NConnect ▸ nebiusrelay is now NConnect."];
  if (result.copied.length > 0) {
    parts.push(`Carried your settings and usage history over to ~/.nconnect.`);
  }
  if (result.rewroteWrappers.length > 0) {
    parts.push(`Your existing nebiusrelay/n* commands keep working; \`nconnect\` is the new name.`);
  }
  if (result.repointedLinks.length > 0) {
    parts.push(
      `Repointed ${result.repointedLinks.length} command link(s) on your PATH that still ran an older install.`,
    );
  }
  if (result.removedService) {
    parts.push(
      "Removed the old login service - run `nconnect daemon install` to re-enable auto-start.",
    );
  }
  return `${parts.join(" ")}\n`;
}
