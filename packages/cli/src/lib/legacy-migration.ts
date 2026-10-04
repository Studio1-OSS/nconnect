import { execFile } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
 * Runs once (a marker file in the new home records it), is best-effort, and
 * never touches the legacy state except to rewrite its wrappers so existing
 * PATH links keep working.
 */

const LEGACY_DIR = ".nebiusrelay";
const LEGACY_BUNDLE = "nebiusrelay.js";
const LEGACY_PREFIX = "NEBIUSRELAY_";
const NEW_PREFIX = "NCONNECT_";
const MARKER = "migrated-from-nebiusrelay";
const LEGACY_LAUNCHD_LABEL = "com.nebiusrelay.daemon";
const LEGACY_SYSTEMD_UNIT = "nebiusrelay-daemon.service";

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
};

export type LegacyMigrationResult = {
  copied: string[];
  rewroteWrappers: string[];
  installedBundle: boolean;
  stoppedDaemon: boolean;
  removedService: boolean;
};

function wrapperBody(bundle: string, harness?: string): string {
  return `#!/usr/bin/env sh\nexec bun "${bundle}"${harness ? ` ${harness}` : ""} "$@"\n`;
}

async function stopLegacyServiceReal(platform: NodeJS.Platform, home: string): Promise<boolean> {
  const run = (file: string, args: string[]) =>
    new Promise<void>((resolve) => execFile(file, args, { timeout: 15_000 }, () => resolve()));
  if (platform === "darwin") {
    const plist = path.join(home, "Library", "LaunchAgents", `${LEGACY_LAUNCHD_LABEL}.plist`);
    if (!existsSync(plist)) {
      return false;
    }
    const domain = `gui/${process.getuid?.() ?? os.userInfo().uid}`;
    await run("launchctl", ["bootout", `${domain}/${LEGACY_LAUNCHD_LABEL}`]);
    try {
      (await import("node:fs/promises")).unlink(plist);
    } catch {
      // best-effort
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
    try {
      (await import("node:fs/promises")).unlink(unit);
    } catch {
      // best-effort
    }
    await run("systemctl", ["--user", "daemon-reload"]);
    return true;
  }
  return false;
}

/**
 * Migrate once. Returns undefined when there is nothing to do (no legacy
 * install, or already migrated); otherwise what was done, for the notice.
 */
export async function migrateLegacyInstall(
  options: LegacyMigrationOptions = {},
): Promise<LegacyMigrationResult | undefined> {
  const home = options.home ?? os.homedir();
  const env = options.env ?? process.env;
  const legacyHome = env.NEBIUSRELAY_HOME || path.join(home, LEGACY_DIR);
  const newHome = env.NCONNECT_HOME || nconnectHome();
  if (!existsSync(legacyHome) || path.resolve(legacyHome) === path.resolve(newHome)) {
    return undefined;
  }
  const marker = path.join(newHome, MARKER);
  if (existsSync(marker)) {
    return undefined;
  }
  mkdirSync(newHome, { recursive: true });

  const result: LegacyMigrationResult = {
    copied: [],
    rewroteWrappers: [],
    installedBundle: false,
    stoppedDaemon: false,
    removedService: false,
  };

  // 1. State: copy only what the new home does not already have.
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

  // 2. The legacy daemon: it serves old code from the old home. Stop it so the
  //    next launch starts a daemon from the migrated install.
  const pidFile = path.join(legacyHome, "daemon.pid");
  if (existsSync(pidFile)) {
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

  // 3. The install: when this process IS the old bundle (the updater wrote
  //    new code over `~/.nebiusrelay/bin/nebiusrelay.js`), lay down a proper
  //    `~/.nconnect/bin` install from it and point the old wrappers at it, so
  //    existing PATH links keep working and future updates land in one place.
  const legacyBin = path.join(legacyHome, "bin");
  const newBin = path.join(newHome, "bin");
  const newBundle = path.join(newBin, "nconnect.js");
  const argv1 = options.argv1 ?? process.argv[1];
  const runningLegacyBundle =
    typeof argv1 === "string" && path.resolve(argv1) === path.join(legacyBin, LEGACY_BUNDLE);
  if (runningLegacyBundle && !existsSync(newBundle)) {
    mkdirSync(newBin, { recursive: true });
    cpSync(argv1, newBundle);
    result.installedBundle = true;
  }
  if (existsSync(newBundle)) {
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
    // ours - a customized script is left alone.
    for (const [name, harness] of [
      ["nebiusrelay", undefined] as [string, undefined],
      ...wrappers.slice(1),
    ]) {
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
      if (!current.includes(LEGACY_BUNDLE) && !current.includes("nconnect.js")) {
        continue;
      }
      writeFileSync(legacyWrapper, wrapperBody(newBundle, harness), {
        encoding: "utf8",
        mode: 0o755,
      });
      result.rewroteWrappers.push(name);
    }
  }

  // 4. The old login service would keep starting the old daemon.
  const stopService = options.stopLegacyService ?? stopLegacyServiceReal;
  try {
    result.removedService = await stopService(process.platform, home);
  } catch {
    // best-effort
  }

  writeFileSync(marker, `${new Date().toISOString()}\n`, "utf8");
  return result;
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
  if (result.removedService) {
    parts.push(
      "Removed the old login service - run `nconnect daemon install` to re-enable auto-start.",
    );
  }
  return `${parts.join(" ")}\n`;
}
