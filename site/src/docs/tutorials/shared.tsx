import type { ReactNode } from "react";
import type { Tutorial } from "../types";
import { installCommand, nebiusApiKeysUrl } from "../data";
import { Callout, Code, CopyBox, H2, Link, P, Step, Steps } from "../ui";

/**
 * Building blocks every tutorial shares, so each one has the same shape:
 * prerequisites, four setup steps, the flag-order note, then harness-specific
 * sections. Keep facts here in sync with packages/cli/src/lib/harness.ts.
 */

export type Setup = {
  /** Harness name as people search for it, e.g. "Claude Code". */
  harness: string;
  /** `nconnect <harnessId>` subcommand, e.g. "claude". */
  harnessId: string;
  /** Short wrapper the installer adds, e.g. "nclaude". */
  alias: string;
  /** Binary NConnect looks for on PATH. */
  binary: string;
  /** Vendor install command (HARNESS_INSTALL in the CLI). */
  install: string;
  /** Nebius model id the tutorial uses. */
  modelId: string;
};

export function launchCommand(setup: Setup, args = ""): string {
  return `nconnect --model ${setup.modelId} ${setup.harnessId}${args ? ` ${args}` : ""}`;
}

/** Plain-text steps for HowTo structured data, matching <SetupSteps />. */
export function setupHowTo(setup: Setup, modelName: string): Tutorial["steps"] {
  return [
    { name: "Install NConnect", text: `Run ${installCommand} on macOS or Linux.` },
    {
      name: "Add your Nebius API key",
      text: "Run nconnect configure and paste a key from tokenfactory.nebius.com.",
    },
    { name: `Install ${setup.harness}`, text: `Run ${setup.install}.` },
    { name: `Launch ${setup.harness} on ${modelName}`, text: `Run ${launchCommand(setup)}.` },
  ];
}

export function Prerequisites({ children }: { children?: ReactNode }) {
  return (
    <>
      <H2 id="prerequisites">Prerequisites</H2>
      <ul>
        <li>macOS or Linux.</li>
        <li>
          A Nebius Token Factory API key from{" "}
          <Link href={nebiusApiKeysUrl}>tokenfactory.nebius.com</Link>.
        </li>
        {children}
      </ul>
    </>
  );
}

export function SetupSteps({
  setup,
  modelName,
  installNote,
  launchNote,
}: {
  setup: Setup;
  modelName: string;
  installNote?: ReactNode;
  launchNote?: ReactNode;
}) {
  return (
    <>
      <H2 id="steps">Steps</H2>
      <Steps>
        <Step title="Install NConnect">
          <P>
            This installs the CLI and the <Code>{setup.alias}</Code> alias, plus Bun if needed.
          </P>
          <CopyBox text={installCommand} />
        </Step>
        <Step title="Add your Nebius API key">
          <CopyBox text="nconnect configure" />
        </Step>
        <Step title={`Install ${setup.harness}`}>
          <P>
            Skip this if <Code>{setup.binary}</Code> is already on your PATH. In an interactive
            terminal, NConnect also offers to run this for you the first time you launch{" "}
            {setup.harness}.
          </P>
          <CopyBox text={setup.install} />
          {installNote}
        </Step>
        <Step title={`Launch ${setup.harness} on ${modelName}`}>
          <CopyBox text={launchCommand(setup)} />
          {launchNote}
        </Step>
      </Steps>
    </>
  );
}

/**
 * Only Codex and Unreal Agent read a `--model` placed after the harness name;
 * every other harness drops it so NConnect can pin the provider.
 */
export function FlagOrder({ setup }: { setup: Setup }) {
  const readsTrailingModel = setup.harnessId === "codex" || setup.harnessId === "unreal";
  if (readsTrailingModel) {
    return (
      <Callout title="Either flag position works">
        {setup.harness} also accepts the model after the alias, so{" "}
        <Code>
          {setup.alias} --model {setup.modelId}
        </Code>{" "}
        is equivalent. NConnect remembers the model you pick for the next launch.
      </Callout>
    );
  }
  return (
    <Callout tone="warning" title={`Put --model before ${setup.harnessId}`}>
      Arguments after <Code>{setup.harnessId}</Code> go to {setup.harness} itself, and NConnect
      drops a forwarded <Code>--model</Code> so it can pin the provider.{" "}
      <Code>{setup.alias} --model ...</Code> therefore launches the default model, not the one you
      asked for.
    </Callout>
  );
}

/** Daemon metering section for spawned harnesses that support NCONNECT_METER. */
export function MeteringSection({ setup, modelName }: { setup: Setup; modelName: string }) {
  return (
    <>
      <H2 id="metering">Track cost and add fallback</H2>
      <P>
        {setup.harness} is a spawned harness, so by default it calls Nebius directly and NConnect
        reports $0.00. Route it through the daemon to meter every turn and get automatic fallback if{" "}
        {modelName} is busy:
      </P>
      <CopyBox text={`NCONNECT_METER=1 ${launchCommand(setup)}`} />
      <P>
        Then check spend with <Code>nconnect usage --last 7d</Code>. See{" "}
        <a href="/docs/cost-metering">Cost metering</a>.
      </P>
    </>
  );
}
