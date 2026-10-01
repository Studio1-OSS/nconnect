import type { Tutorial } from "../types";
import { Code, CodeBlock, CopyBox, H2, P } from "../ui";
import {
  FlagOrder,
  MeteringSection,
  Prerequisites,
  SetupSteps,
  launchCommand,
  setupHowTo,
  type Setup,
} from "./shared";

const setup: Setup = {
  harness: "Grok Build",
  harnessId: "grok",
  alias: "ngrok",
  binary: "grok",
  install: "curl -fsSL https://x.ai/cli/install.sh | bash",
  modelId: "moonshotai/Kimi-K3",
};

export const kimiK3GrokBuild: Tutorial = {
  slug: "kimi-k3-grok-build",
  title: "How to run Kimi K3 with Grok Build",
  navLabel: "Kimi K3 + Grok Build",
  description:
    "Use xAI's Grok Build terminal harness with Moonshot AI's Kimi K3 on Nebius Token Factory. No xAI API key needed, and your Nebius key never reaches api.x.ai.",
  harness: setup.harness,
  model: "Kimi K3",
  totalTime: "PT5M",
  updated: "2026-10-01",
  steps: setupHowTo(setup, "Kimi K3"),
  Content() {
    return (
      <>
        <P>
          Grok Build is xAI&apos;s terminal coding harness. Nebius does not serve Grok models, so
          NConnect runs the <em>harness</em> on Nebius models instead: you get Grok Build&apos;s
          interface driving Kimi K3, Moonshot AI&apos;s frontier open-weights model with a
          1,048,576-token context window.
        </P>

        <Prerequisites>
          <li>No xAI account or API key.</li>
        </Prerequisites>
        <SetupSteps
          setup={setup}
          modelName="Kimi K3"
          launchNote={
            <CodeBlock label="You should see">
              {"NConnect ▸ Launching Grok Build with Nebius Token Factory (Kimi K3). Not xAI."}
            </CodeBlock>
          }
        />
        <FlagOrder setup={setup} />

        <H2 id="what-happens">What NConnect does on launch</H2>
        <ul>
          <li>
            Serves the Nebius model catalog to Grok Build from a temporary localhost endpoint, so
            every Nebius model appears in Grok&apos;s model picker as <Code>Nebius · Kimi K3</Code>{" "}
            and so on.
          </li>
          <li>
            Uses an isolated, empty auth file. Your normal Grok login is ignored for the session and
            left untouched.
          </li>
          <li>
            Points every xAI-native endpoint at the localhost server and turns off image generation,
            image editing and voice, which call api.x.ai directly. Your Nebius key can never be sent
            to xAI.
          </li>
          <li>
            Adds a system rule so the model identifies itself as Kimi K3 on Nebius rather than
            claiming to be Grok.
          </li>
        </ul>

        <H2 id="custom-rules">Add your own rules</H2>
        <P>
          <Code>--rules</Code> and <Code>--append-system-prompt</Code> still work. NConnect merges
          them with its identity rule:
        </P>
        <CopyBox text={launchCommand(setup, '--rules "Prefer small, reviewable diffs."')} />

        <MeteringSection setup={setup} modelName="Kimi K3" />
      </>
    );
  },
};
