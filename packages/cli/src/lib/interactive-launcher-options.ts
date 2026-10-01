import { ALL_HARNESSES, HARNESS, HARNESS_LABEL, type HarnessId } from "./harness.js";
import { detectInstalledHarness } from "./detect.js";

/**
 * Options for the interactive `nconnect` picker.
 *
 * Lives here rather than in the bin entry so it can be tested without running
 * the CLI - the list silently drifting out of date is exactly the failure this
 * module exists to prevent.
 */

export type InteractiveLauncherOption = {
  value: string;
  label: string;
  hint: string;
};

/**
 * Familiar tools first; everything else keeps its registry order below them.
 * Presentation only - a harness missing from here still appears in the menu.
 */
const LAUNCHER_PRIORITY: readonly HarnessId[] = [
  HARNESS.CODEX,
  HARNESS.CLAUDE,
  HARNESS.PI,
  HARNESS.OPENCODE,
];

/** The wrapper command installed for a harness (`npi`, `nhermes`, …). */
export function harnessWrapperName(harness: HarnessId): string {
  return `n${harness}`;
}

function priorityRank(harness: HarnessId): number {
  const index = LAUNCHER_PRIORITY.indexOf(harness);
  return index === -1 ? LAUNCHER_PRIORITY.length : index;
}

/**
 * Every shipped harness, installed ones first, then ChatGPT Desktop and
 * Configure.
 *
 * Built from ALL_HARNESSES rather than a second hand-written list. The previous
 * version enumerated five harnesses by hand, so when Hermes, DeepSeek and Grok
 * were added - with wrappers installed and README entries written - they never
 * appeared here, and `nconnect` offered 5 of the 8 tools it ships.
 */
export function interactiveLauncherOptions(
  isInstalled: (harness: HarnessId) => boolean = (harness) =>
    detectInstalledHarness(harness).installed,
): InteractiveLauncherOption[] {
  const ordered = [...ALL_HARNESSES].sort((a, b) => priorityRank(a) - priorityRank(b));
  const installed: InteractiveLauncherOption[] = [];
  const missing: InteractiveLauncherOption[] = [];
  for (const harness of ordered) {
    const option: InteractiveLauncherOption = {
      value: harness,
      label: HARNESS_LABEL[harness],
      hint: harnessWrapperName(harness),
    };
    if (isInstalled(harness)) {
      installed.push(option);
    } else {
      // Still offered - the launch path prints the tool's official install
      // command - but marked so the picker never looks broken.
      missing.push({ ...option, hint: `${option.hint} (not installed)` });
    }
  }
  return [
    ...installed,
    ...missing,
    { value: "chatgpt", label: "ChatGPT Desktop", hint: "chatgpt" },
    { value: "configure", label: "Configure", hint: "API keys and detected tools" },
  ];
}
