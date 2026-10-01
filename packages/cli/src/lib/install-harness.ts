import { spawn } from "node:child_process";
import { HARNESS_BIN, HARNESS_INSTALL, HARNESS_LABEL, type HarnessId } from "./harness.js";
import { detectInstalledHarness, type HarnessDetection } from "./detect.js";

/**
 * Offer to install a missing agent CLI instead of only printing the command.
 *
 * We deliberately never install silently: these are third-party tools fetched
 * from vendor installers (some are `curl | bash`), so the user is asked first
 * and the exact command is shown. In a non-interactive run we do nothing and
 * let the caller surface the usual instructions.
 */

type InstallRunner = (command: string) => Promise<number | null>;

function defaultRunner(command: string): Promise<number | null> {
  return new Promise((resolve) => {
    // The vendor install commands are shell pipelines (`curl ... | bash`), so
    // they need a shell. The command comes from our own HARNESS_INSTALL table,
    // never from user input.
    const child = spawn(command, { shell: true, stdio: "inherit" });
    child.on("error", () => resolve(null));
    child.on("exit", (code) => resolve(code));
  });
}

export type InstallHarnessOptions = {
  detect?: (harness: HarnessId) => HarnessDetection;
  run?: InstallRunner;
  /** Skip the prompt (used by tests and non-TTY runs). */
  confirm?: (question: string) => Promise<boolean>;
};

/**
 * Returns true when the harness is installed and ready after this call - either
 * it already was, or the user accepted and the install succeeded.
 */
export async function ensureHarnessInstalled(
  harness: HarnessId,
  options: InstallHarnessOptions = {},
): Promise<boolean> {
  const detect = options.detect ?? detectInstalledHarness;
  if (detect(harness).installed) {
    return true;
  }

  const install = HARNESS_INSTALL[harness];
  const label = HARNESS_LABEL[harness];
  const confirm = options.confirm ?? defaultConfirm;
  const accepted = await confirm(
    `${label} is not installed ("${HARNESS_BIN[harness]}" not on PATH).\n` +
      `  Install command: ${install.command}\n` +
      `  Docs: ${install.url}\n` +
      `Run the install now?`,
  );
  if (!accepted) {
    return false;
  }

  const run = options.run ?? defaultRunner;
  const code = await run(install.command);
  if (code !== 0) {
    process.stderr.write(
      `\nInstall did not complete${code === null ? "" : ` (exit ${code})`}. ` +
        `Run it manually: ${install.command}\n`,
    );
    return false;
  }
  // Re-detect rather than trusting the exit code: some installers land the
  // binary somewhere that is not yet on this process's PATH.
  const installed = detect(harness).installed;
  if (!installed) {
    process.stderr.write(
      `\n${label} installed, but "${HARNESS_BIN[harness]}" is still not on PATH. ` +
        `Open a new shell and re-run: nconnect ${harness}\n`,
    );
  }
  return installed;
}

async function defaultConfirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }
  const clack = await import("@clack/prompts");
  const answer = await clack.confirm({ message: question, initialValue: false });
  return !clack.isCancel(answer) && answer === true;
}
