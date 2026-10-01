import type { Tutorial } from "../types";
import { Code, CodeBlock, H2, P } from "../ui";
import {
  FlagOrder,
  MeteringSection,
  Prerequisites,
  SetupSteps,
  setupHowTo,
  type Setup,
} from "./shared";

const setup: Setup = {
  harness: "Prime Agent",
  harnessId: "prime",
  alias: "nprime",
  binary: "prime-agent",
  install: "curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh",
  modelId: "deepseek-ai/DeepSeek-V4-Flash",
};

export const deepseekV4FlashPrime: Tutorial = {
  slug: "deepseek-v4-flash-prime-agent",
  title: "How to run DeepSeek V4 Flash with Prime Agent",
  navLabel: "DeepSeek V4 Flash + Prime Agent",
  description:
    "Run PrimeIntellect's Prime Agent on DeepSeek V4 Flash, a fast 1M-context model for coding and agentic work, served by Nebius Token Factory through NConnect.",
  harness: setup.harness,
  model: "DeepSeek V4 Flash",
  totalTime: "PT5M",
  updated: "2026-10-01",
  steps: setupHowTo(setup, "DeepSeek V4 Flash"),
  Content() {
    return (
      <>
        <P>
          Prime Agent is PrimeIntellect&apos;s RLM-style coding agent. It already speaks the
          OpenAI-compatible format Nebius serves, so NConnect points it straight at Token Factory
          with no proxy. DeepSeek V4 Flash is the fast, cost-effective member of the DeepSeek V4
          family, with a 1M-token context window.
        </P>

        <Prerequisites />
        <SetupSteps
          setup={setup}
          modelName="DeepSeek V4 Flash"
          launchNote={
            <CodeBlock label="You should see">
              {"NConnect ▸ Launching Prime Agent with Nebius Token Factory (DeepSeek V4 Flash)."}
            </CodeBlock>
          }
        />
        <FlagOrder setup={setup} />

        <H2 id="what-happens">What NConnect does on launch</H2>
        <ul>
          <li>
            Declares Nebius as a custom provider in a config directory NConnect owns,{" "}
            <Code>~/.nconnect/prime-agent</Code>. Your own <Code>~/.prime/agent</Code> is never
            touched.
          </li>
          <li>
            Keeps that directory between launches, because Prime Agent bootstraps its runtime there.
            The first launch takes longer; later ones start straight away.
          </li>
          <li>Lists every Nebius model, so you can switch inside Prime Agent.</li>
        </ul>

        <MeteringSection setup={setup} modelName="DeepSeek V4 Flash" />
      </>
    );
  },
};
