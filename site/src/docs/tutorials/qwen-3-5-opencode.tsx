import type { Tutorial } from "../types";
import { Code, CopyBox, H2, P } from "../ui";
import {
  FlagOrder,
  Prerequisites,
  SetupSteps,
  launchCommand,
  setupHowTo,
  type Setup,
} from "./shared";

const setup: Setup = {
  harness: "OpenCode",
  harnessId: "opencode",
  alias: "nopencode",
  binary: "opencode",
  install: "npm install -g opencode-ai@latest",
  modelId: "Qwen/Qwen3.5-397B-A17B",
};

export const qwen35OpenCode: Tutorial = {
  slug: "qwen-3-5-opencode",
  title: "How to run Qwen 3.5 with OpenCode",
  navLabel: "Qwen 3.5 + OpenCode",
  description:
    "Run the OpenCode terminal agent on Alibaba's Qwen 3.5 397B, served by Nebius Token Factory through NConnect, without editing your OpenCode config.",
  harness: setup.harness,
  model: "Qwen 3.5 397B",
  totalTime: "PT5M",
  updated: "2026-10-01",
  steps: setupHowTo(setup, "Qwen 3.5"),
  Content() {
    return (
      <>
        <P>
          OpenCode already speaks the OpenAI-compatible format Nebius serves, so NConnect needs no
          proxy here: it launches OpenCode with Nebius configured as a provider for that one run.
          Qwen 3.5 397B is Alibaba&apos;s mixture-of-experts flagship for general and coding work,
          with a 262K-token context window.
        </P>

        <Prerequisites />
        <SetupSteps
          setup={setup}
          modelName="Qwen 3.5"
          launchNote={
            <>
              <P>
                Arguments after <Code>opencode</Code> go to OpenCode, so <Code>run</Code> works for
                one-off tasks:
              </P>
              <CopyBox text={launchCommand(setup, 'run "summarize the open TODOs"')} />
            </>
          }
        />
        <FlagOrder setup={setup} />

        <H2 id="what-happens">What NConnect does on launch</H2>
        <ul>
          <li>
            Passes a generated config with a <Code>nebius</Code> provider through the environment,
            and selects <Code>nebius/Qwen/Qwen3.5-397B-A17B</Code> on the command line so it wins
            over the default model in your own <Code>~/.config/opencode</Code>.
          </li>
          <li>
            Limits <Code>/models</Code> to the NConnect catalog, with real context limits and
            per-token prices, instead of hundreds of unrelated models.
          </li>
          <li>
            Replaces the build agent&apos;s &quot;You are OpenCode&quot; framing with a neutral
            prompt, so the model doesn&apos;t misreport what it is.
          </li>
          <li>
            Registers a <Code>@vision</Code> subagent pinned to a vision-capable model.
          </li>
        </ul>

        <H2 id="switching">Switch models in the session</H2>
        <P>
          Use <Code>/models</Code> inside OpenCode to move between Nebius models without restarting.
          Pick a vision model such as Kimi K2.6 before pasting images.
        </P>
      </>
    );
  },
};
