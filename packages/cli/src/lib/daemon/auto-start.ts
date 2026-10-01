import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { mkdir, unlink, writeFile, access } from "node:fs/promises";
import { nconnectHome } from "../paths.js";

/**
 * Daemon auto-start at login: launchd on macOS, systemd --user on Linux.
 *
 * Without this the daemon only exists while something launched it, so it dies
 * with the terminal and every new session pays a cold start - and a daemon left
 * running from an older release keeps serving stale code until someone notices.
 * A supervised service starts it at login and restarts it if it exits.
 *
 * Only the INSTALLED bundle can be supervised: a dev/source checkout has no
 * stable path to point a service file at.
 */

const LAUNCHD_LABEL = "com.nconnect.daemon";
const SYSTEMD_UNIT = "nconnect-daemon.service";

export type AutoStartPlatform = "launchd" | "systemd";

export type AutoStartStatus = {
  supported: boolean;
  platform?: AutoStartPlatform;
  installed: boolean;
  running: boolean;
  servicePath?: string;
  detail: string;
};

export function autoStartPlatform(): AutoStartPlatform | undefined {
  if (process.platform === "darwin") {
    return "launchd";
  }
  if (process.platform === "linux") {
    return "systemd";
  }
  return undefined;
}

function bundlePath(): string {
  return path.join(nconnectHome(), "bin", "nconnect.js");
}

async function bundleInstalled(): Promise<boolean> {
  try {
    await access(bundlePath());
    return true;
  } catch {
    return false;
  }
}

function plistPath(): string {
  return path.join(os.homedir(), "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
}

function systemdUnitPath(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), ".config");
  return path.join(base, "systemd", "user", SYSTEMD_UNIT);
}

export function autoStartServicePath(): string | undefined {
  const platform = autoStartPlatform();
  if (platform === "launchd") {
    return plistPath();
  }
  if (platform === "systemd") {
    return systemdUnitPath();
  }
  return undefined;
}

function run(file: string, args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 15_000 }, (err, stdout) => {
      const code =
        err && typeof (err as { code?: unknown }).code === "number"
          ? ((err as { code: number }).code ?? 1)
          : err
            ? 1
            : 0;
      resolve({ code, stdout: String(stdout ?? "") });
    });
  });
}

/**
 * A PATH the service can rely on to find `bun`. The caller's PATH is not
 * inherited by a login service, and may itself contain transient directories,
 * so use the common install locations explicitly.
 */
function servicePath(): string {
  return [
    path.join(os.homedir(), ".bun", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ].join(":");
}

function plistBody(): string {
  const home = nconnectHome();
  const logDir = path.join(home, "logs");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    `  <string>${LAUNCHD_LABEL}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    "    <string>/bin/sh</string>",
    "    <string>-lc</string>",
    `    <string>exec bun "${bundlePath()}" daemon serve</string>`,
    "  </array>",
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "  <key>KeepAlive</key>",
    "  <true/>",
    "  <key>ThrottleInterval</key>",
    "  <integer>10</integer>",
    "  <key>StandardOutPath</key>",
    `  <string>${path.join(logDir, "daemon.out.log")}</string>`,
    "  <key>StandardErrorPath</key>",
    `  <string>${path.join(logDir, "daemon.err.log")}</string>`,
    "  <key>EnvironmentVariables</key>",
    "  <dict>",
    "    <key>NCONNECT_HOME</key>",
    `    <string>${home}</string>`,
    "    <key>NCONNECT_SUPERVISED</key>",
    "    <string>1</string>",
    "    <key>PATH</key>",
    `    <string>${servicePath()}</string>`,
    "  </dict>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

function systemdUnitBody(): string {
  const home = nconnectHome();
  return [
    "[Unit]",
    "Description=NConnect daemon",
    "After=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    `ExecStart=/bin/sh -lc 'exec bun "${bundlePath()}" daemon serve'`,
    `Environment=NCONNECT_HOME=${home}`,
    "Environment=NCONNECT_SUPERVISED=1",
    `Environment=PATH=${servicePath()}`,
    "Restart=always",
    "RestartSec=10",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}

export async function installAutoStart(): Promise<string> {
  const platform = autoStartPlatform();
  if (!platform) {
    throw new Error(
      `Daemon auto-start is only supported on macOS (launchd) and Linux (systemd). Detected: ${process.platform}.`,
    );
  }
  if (!(await bundleInstalled())) {
    throw new Error(
      "Auto-start needs the installed bundle (this looks like a dev/source run).\n" +
        "Install first: curl -fsSL https://nconnect.sh/install.sh | sh",
    );
  }
  await mkdir(path.join(nconnectHome(), "logs"), { recursive: true });
  // Hand the fixed proxy port over from any daemon started the old way (a
  // detached process from a plain launch). Without this the supervised service
  // starts, finds the port taken, and exits - repeatedly - so auto-start would
  // silently never work.
  await stopUnsupervisedDaemon();

  if (platform === "launchd") {
    const target = plistPath();
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, plistBody(), { encoding: "utf8", mode: 0o644 });
    const domain = `gui/${process.getuid?.() ?? os.userInfo().uid}`;
    // bootout first so a re-install replaces a previous definition cleanly.
    await run("launchctl", ["bootout", `${domain}/${LAUNCHD_LABEL}`]);
    const boot = await run("launchctl", ["bootstrap", domain, target]);
    if (boot.code !== 0) {
      throw new Error(`launchctl bootstrap failed (exit ${boot.code}). Service file: ${target}`);
    }
    await run("launchctl", ["kickstart", "-k", `${domain}/${LAUNCHD_LABEL}`]);
    return `Auto-start installed (launchd). The daemon now starts at login.\n  Service: ${target}`;
  }

  const target = systemdUnitPath();
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, systemdUnitBody(), { encoding: "utf8", mode: 0o644 });
  await run("systemctl", ["--user", "daemon-reload"]);
  const enabled = await run("systemctl", ["--user", "enable", "--now", SYSTEMD_UNIT]);
  if (enabled.code !== 0) {
    throw new Error(
      `systemctl --user enable failed (exit ${enabled.code}). Service file: ${target}\n` +
        "If this is a headless box, you may need: loginctl enable-linger $USER",
    );
  }
  return `Auto-start installed (systemd --user). The daemon now starts at login.\n  Service: ${target}`;
}

export async function uninstallAutoStart(): Promise<string> {
  const platform = autoStartPlatform();
  if (!platform) {
    return `Nothing to uninstall: auto-start is not supported on ${process.platform}.`;
  }
  if (platform === "launchd") {
    const domain = `gui/${process.getuid?.() ?? os.userInfo().uid}`;
    await run("launchctl", ["bootout", `${domain}/${LAUNCHD_LABEL}`]);
    try {
      await unlink(plistPath());
    } catch {
      return "Auto-start was not installed (launchd).";
    }
    return "Auto-start removed (launchd). The daemon no longer starts at login.";
  }
  await run("systemctl", ["--user", "disable", "--now", SYSTEMD_UNIT]);
  try {
    await unlink(systemdUnitPath());
  } catch {
    return "Auto-start was not installed (systemd).";
  }
  await run("systemctl", ["--user", "daemon-reload"]);
  return "Auto-start removed (systemd). The daemon no longer starts at login.";
}

export async function autoStartStatus(): Promise<AutoStartStatus> {
  const platform = autoStartPlatform();
  if (!platform) {
    return {
      supported: false,
      installed: false,
      running: false,
      detail: `Auto-start is not supported on ${process.platform}.`,
    };
  }
  const service = autoStartServicePath();
  let installed = false;
  try {
    await access(service ?? "");
    installed = true;
  } catch {
    installed = false;
  }

  if (platform === "launchd") {
    const domain = `gui/${process.getuid?.() ?? os.userInfo().uid}`;
    const printed = await run("launchctl", ["print", `${domain}/${LAUNCHD_LABEL}`]);
    const running = printed.code === 0 && /state = running/i.test(printed.stdout);
    return {
      supported: true,
      platform,
      installed,
      running,
      ...(service ? { servicePath: service } : {}),
      detail: installed
        ? running
          ? "Auto-start is installed and the service is running (launchd)."
          : "Auto-start is installed but the service is not currently running (launchd)."
        : "Auto-start is not installed. Run `nconnect daemon install`.",
    };
  }

  const active = await run("systemctl", ["--user", "is-active", SYSTEMD_UNIT]);
  const running = active.stdout.trim() === "active";
  return {
    supported: true,
    platform,
    installed,
    running,
    ...(service ? { servicePath: service } : {}),
    detail: installed
      ? running
        ? "Auto-start is installed and the service is running (systemd)."
        : "Auto-start is installed but the service is not currently running (systemd)."
      : "Auto-start is not installed. Run `nconnect daemon install`.",
  };
}

/**
 * Stop a daemon that is holding the proxy port but is not the supervised
 * service, so launchd/systemd can take ownership. Best-effort and safe to call
 * when nothing is running: a missing pid file or dead process is a no-op.
 */
async function stopUnsupervisedDaemon(): Promise<void> {
  const { daemonPidPath, resolveDaemonPort, probeHealthz } = await import("./server.js");
  const { readFile, unlink } = await import("node:fs/promises");
  const port = resolveDaemonPort();
  if (!(await probeHealthz(port))) {
    return; // nothing listening - nothing to hand over
  }
  let pid: number | undefined;
  try {
    const raw = (await readFile(daemonPidPath(), "utf8")).trim();
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    pid = Number.isFinite(parsed) ? parsed : undefined;
  } catch {
    return; // healthy but unknown owner - leave it alone rather than guess
  }
  if (pid === undefined) {
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return; // already gone
  }
  // Give it a moment to release the port before the service tries to bind.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!(await probeHealthz(port))) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await unlink(daemonPidPath()).catch(() => undefined);
}
