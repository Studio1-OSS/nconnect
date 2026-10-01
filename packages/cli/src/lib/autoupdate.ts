/**
 * Self-update. The installed CLI lives as a single Bun-target JS bundle at
 * `<home>/.nconnect/bin/nconnect.js`, launched by a tiny `nconnect`
 * shell wrapper that calls `bun run` on it. To update, we fetch a small
 * `latest.json` manifest from the project site, compare versions, and if newer
 * download the new bundle and atomically rename it over the installed file.
 *
 * The running process keeps the old inode, so the *next* invocation is the new
 * version - we never hot-swap mid-execution. Every failure path is swallowed:
 * an update problem must never block or crash the user's actual command.
 */

import { access, readFile, writeFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { VERSION } from "./version.js";

/** Single origin for the landing page, manifest, and downloadable bundle. */
const UPDATE_ORIGIN = "https://nebius-tf-relay.vercel.app";
/** Override for testing/local mirrors; normally unset. */
function resolveManifestUrl(): string {
  return process.env.NCONNECT_MANIFEST_URL ?? `${UPDATE_ORIGIN}/latest.json`;
}

const THROTTLE_MS = 60 * 60 * 1000; // re-check at most once per hour
const OVERALL_TIMEOUT_MS = 10_000;
const FETCH_TIMEOUT_MS = 5_000;

type Manifest = { version: string; url?: string };

/**
 * Where the install lives. `NCONNECT_HOME` (when set) is the `.nconnect`
 * directory itself - matching `scripts/install.sh`, which installs the bundle
 * at `$NCONNECT_HOME/bin/nconnect.js`. When unset, default to
 * `~/.nconnect`.
 */
function resolveInstallDir(): string {
  return process.env.NCONNECT_HOME || path.join(os.homedir(), ".nconnect");
}

/** Installed bundle path. `nconnect` wrapper runs `bun run` on this. */
function installedBundlePath(): string {
  return path.join(resolveInstallDir(), "bin", "nconnect.js");
}

/**
 * Is the currently-running script the installed bundle? We only self-update the
 * installed copy - a dev run from the repo (`tsc`/source) is left alone.
 */
function isInstalledBundle(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) {
    return false;
  }
  try {
    const resolved = path.resolve(argv1);
    const installed = installedBundlePath();
    // realpath handles macOS /tmp → /private/tmp symlinks, so the comparison
    // matches even when the install dir was reached through a symlinked prefix.
    return realpathSafe(resolved) === realpathSafe(installed);
  } catch {
    return false;
  }
}

function realpathSafe(p: string): string {
  try {
    return require("node:fs").realpathSync(p) as string;
  } catch {
    return p;
  }
}

function throttleFile(): string {
  return path.join(resolveInstallDir(), ".update-check");
}

async function throttled(): Promise<boolean> {
  try {
    const s = await stat(throttleFile());
    return Date.now() - s.mtimeMs < THROTTLE_MS;
  } catch {
    return false;
  }
}

async function touchThrottle(): Promise<void> {
  try {
    await writeFile(throttleFile(), "", { flag: "w" });
  } catch {
    // Non-fatal: worst case we re-check next run.
  }
}

function parseSemver(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  if (!m) {
    return null;
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function isNewer(latest: string, current: string): boolean {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  if (!a || !b) {
    return false;
  }
  for (let i = 0; i < 3; i += 1) {
    const av = a[i];
    const bv = b[i];
    if (av !== bv && av !== undefined && bv !== undefined) {
      return av > bv;
    }
  }
  return false;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  try {
    return await Promise.race([p, guard]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function fetchManifest(): Promise<Manifest> {
  const res = await withTimeout(
    fetch(resolveManifestUrl(), {
      headers: { "User-Agent": `nconnect/${VERSION}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }),
    FETCH_TIMEOUT_MS,
  );
  if (!res.ok) {
    throw new Error(`manifest ${res.status}`);
  }
  const data = (await res.json()) as Manifest;
  if (!data?.version) {
    throw new Error("manifest missing version");
  }
  return data;
}

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await withTimeout(
    fetch(url, {
      headers: { "User-Agent": `nconnect/${VERSION}` },
      signal: AbortSignal.timeout(OVERALL_TIMEOUT_MS),
    }),
    OVERALL_TIMEOUT_MS,
  );
  if (!res.ok || !res.body) {
    throw new Error(`download ${res.status}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength === 0) {
    throw new Error("empty download");
  }
  const tmp = `${dest}.new-${process.pid}`;
  await writeFile(tmp, buf, { mode: 0o644 });
  await rename(tmp, dest);
}

/**
 * Check for and apply a self-update. Safe to `await` at startup: throttled to
 * once/hour, bounded by a 10s overall timeout, and never throws. No-op unless
 * the running script is the installed bundle.
 */

/**
 * Wrapper commands the installer creates. Auto-update only replaces the bundle,
 * so a release that ADDS a wrapper (e.g. `nprime` for the Prime Agent harness)
 * would never reach existing installs - they'd have to re-run install.sh. Back
 * these in after an update so new harnesses become usable immediately.
 */
const WRAPPER_COMMANDS: ReadonlyArray<{ name: string; harness: string }> = [
  { name: "nclaude", harness: "claude" },
  { name: "ncodex", harness: "codex" },
  { name: "nopencode", harness: "opencode" },
  { name: "npi", harness: "pi" },
  { name: "nprime", harness: "prime" },
  { name: "nhermes", harness: "hermes" },
  { name: "ndeepseek", harness: "deepseek" },
  { name: "ngrok", harness: "grok" },
];

/**
 * Create any missing wrapper scripts next to the installed bundle. Never
 * overwrites an existing file - only fills gaps - so a user's customized
 * wrapper is left alone. Best-effort: failures are swallowed.
 */
export async function backfillWrapperCommands(): Promise<string[]> {
  const created: string[] = [];
  if (!isInstalledBundle()) {
    return created;
  }
  const binDir = path.dirname(installedBundlePath());
  const bundle = installedBundlePath();
  for (const { name, harness } of WRAPPER_COMMANDS) {
    const target = path.join(binDir, name);
    try {
      await access(target);
      continue; // already present
    } catch {
      // missing - create it below
    }
    try {
      await writeFile(target, `#!/usr/bin/env sh\nexec bun "${bundle}" ${harness} "$@"\n`, {
        encoding: "utf8",
        mode: 0o755,
      });
      created.push(name);
    } catch {
      // best-effort: a read-only bin dir must not break the update
    }
  }
  return created;
}

/** Force an update now, ignoring the throttle. Returns a human-readable result. */
export async function runUpdateCommand(): Promise<string> {
  if (!isInstalledBundle()) {
    return (
      "Not an installed bundle - this is a dev/source run, so there is nothing to update.\n" +
      "Install with: curl -fsSL https://nebius-tf-relay.vercel.app/install.sh | sh"
    );
  }
  const manifest = await withTimeout(fetchManifest(), OVERALL_TIMEOUT_MS);
  const created = await backfillWrapperCommands();
  const wrapperNote = created.length > 0 ? `\nAdded missing command(s): ${created.join(", ")}` : "";
  if (!isNewer(manifest.version, VERSION)) {
    return `Already up to date (v${VERSION}).${wrapperNote}`;
  }
  const dest = installedBundlePath();
  const url = manifest.url ?? `${UPDATE_ORIGIN}/nconnect.js`;
  await downloadTo(url, dest);
  await touchThrottle();
  return `Updated v${VERSION} -> v${manifest.version}. The next run uses it.${wrapperNote}`;
}

export async function maybeSelfUpdate(): Promise<void> {
  // Only the installed bundle self-updates, and only against the deployed
  // release site the bundle was installed from - so this is a safe default-on:
  // dev/source runs no-op, and every failure below is swallowed. Set
  // NCONNECT_DISABLE_AUTOUPDATE=1 to opt out.
  if (process.env.NCONNECT_DISABLE_AUTOUPDATE === "1") {
    return;
  }
  if (!isInstalledBundle()) {
    return; // dev/source run - don't touch it
  }
  if (await throttled()) {
    return;
  }
  await touchThrottle();

  try {
    const manifest = await withTimeout(fetchManifest(), OVERALL_TIMEOUT_MS);
    if (!isNewer(manifest.version, VERSION)) {
      return;
    }
    const dest = installedBundlePath();
    const url = manifest.url ?? `${UPDATE_ORIGIN}/nconnect.js`;
    await downloadTo(url, dest);
    // A new release may add wrapper commands; create any that are missing so
    // existing installs pick up new harnesses without reinstalling.
    const created = await backfillWrapperCommands();
    const suffix = created.length > 0 ? ` (+ ${created.join(", ")})` : "";
    process.stderr.write(`nconnect: updated to v${manifest.version}${suffix} (next run uses it)\n`);
  } catch {
    // Swallowed: update failure never breaks the user's command.
  }
}
