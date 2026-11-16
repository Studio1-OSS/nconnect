import type { Tutorial } from "../types";
import { Callout, Code, CodeBlock, H2, P } from "../ui";
import {
  FlagOrder,
  MeteringSection,
  Prerequisites,
  SetupSteps,
  setupHowTo,
  type Setup,
} from "./shared";

const setup: Setup = {
  harness: "DeepSeek Harness",
  harnessId: "deepseek",
  alias: "ndeepseek",
  binary: "dsh",
  install: "npm install -g @deepseek-ai/dsh",
  modelId: "deepseek-ai/DeepSeek-V4-Pro-0813",
};

export const deepseekV4ProHarness: Tutorial = {
  slug: "deepseek-v4-pro-deepseek-harness",
  title: "How to run DeepSeek V4 Pro 0813 with DeepSeek Harness",
  navLabel: "DeepSeek V4 Pro 0813 + DeepSeek Harness",
  description:
    "Run DeepSeek Harness (dsh) and its local web UI on DeepSeek V4 Pro 0813, a 1M-context reasoning model, served by Nebius Token Factory through NConnect.",
  harness: setup.harness,
  model: "DeepSeek V4 Pro 0813",
  totalTime: "PT5M",
  updated: "2026-11-16",
  steps: setupHowTo(setup, "DeepSeek V4 Pro 0813"),
  Content() {
    return (
      <>
        <P>
          DeepSeek Harness (<Code>dsh</Code>) is DeepSeek&apos;s open-source agent harness with a
          local web UI. NConnect layers Nebius in as a provider, so you can run DeepSeek V4 Pro
          0813, built for advanced reasoning, coding and long-horizon agent work, with a 1M-token
          context window.
        </P>
        <Callout tone="warning" title="Alpha">
          DeepSeek Harness support is marked alpha in NConnect. Expect rough edges and report issues
          on GitHub.
        </Callout>

        <Prerequisites />
        <SetupSteps
          setup={setup}
          modelName="DeepSeek V4 Pro 0813"
          launchNote={
            <>
              <CodeBlock label="You should see">
                {
                  "NConnect ▸ Launching DeepSeek Harness with Nebius Token Factory (DeepSeek V4 Pro 0813). Alpha."
                }
              </CodeBlock>
              <P>
                dsh boots its <Code>web</Code> profile by default, which serves the local web UI.
                Pass <Code>--profile headless</Code> to answer a single task and exit instead.
              </P>
            </>
          }
        />
        <FlagOrder setup={setup} />

        <H2 id="what-happens">What NConnect does on launch</H2>
        <ul>
          <li>
            Writes a config patch that adds Nebius as a provider and pins the model. The patch holds
            no credentials; the key is passed by environment variable.
          </li>
          <li>
            Runs dsh against a throwaway home. dsh remembers the last model picked in its web UI,
            and that setting would otherwise override <Code>--model</Code>. Your real{" "}
            <Code>~/.dsh</Code> is untouched.
          </li>
        </ul>

        <MeteringSection setup={setup} modelName="DeepSeek V4 Pro 0813" />
      </>
    );
  },
};
