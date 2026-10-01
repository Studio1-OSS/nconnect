import type { Tutorial } from "../types";
import { Code, CopyBox, H2, P } from "../ui";
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
  harness: "Hermes Agent",
  harnessId: "hermes",
  alias: "nhermes",
  binary: "hermes",
  install: "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash",
  modelId: "moonshotai/Kimi-K3",
};

export const kimiK3Hermes: Tutorial = {
  slug: "kimi-k3-hermes-agent",
  title: "How to run Kimi K3 with Hermes Agent",
  navLabel: "Kimi K3 + Hermes Agent",
  description:
    "Run Nous Research's Hermes Agent on Moonshot AI's Kimi K3 with a 1M-token context, served by Nebius Token Factory through NConnect. Setup takes about five minutes.",
  harness: setup.harness,
  model: "Kimi K3",
  totalTime: "PT5M",
  updated: "2026-10-01",
  steps: setupHowTo(setup, "Kimi K3"),
  Content() {
    return (
      <>
        <P>
          Hermes Agent from Nous Research is a terminal agent with persistent skills and memory.
          Kimi K3 is Moonshot AI&apos;s frontier open-weights model for coding and agentic tool use,
          with a 1,048,576-token context window. NConnect connects the two through Nebius Token
          Factory without touching your Hermes configuration.
        </P>

        <Prerequisites />
        <SetupSteps
          setup={setup}
          modelName="Kimi K3"
          launchNote={
            <P>
              Hermes opens with a provider named <Code>nconnect</Code> and Kimi K3 selected.
            </P>
          }
        />
        <FlagOrder setup={setup} />

        <H2 id="what-happens">What NConnect does on launch</H2>
        <P>
          Hermes prefers its own saved credentials over environment variables, so NConnect gives
          each launch an isolated <Code>HERMES_HOME</Code> overlay:
        </P>
        <ul>
          <li>
            Sessions, skills, memories and preferences are linked back to your real Hermes home, so
            they stay native and resumable.
          </li>
          <li>
            Credentials, config and a temporary <Code>nconnect</Code> provider exist only inside the
            overlay. Your real Hermes home is never modified.
          </li>
          <li>
            Every Nebius model is registered with the provider, with Kimi K3 first so it becomes the
            default. You can switch models inside Hermes.
          </li>
        </ul>

        <H2 id="desktop">Use the Hermes desktop app</H2>
        <P>The same launch works for the desktop app:</P>
        <CopyBox text={launchCommand(setup, "desktop")} />

        <MeteringSection setup={setup} modelName="Kimi K3" />
      </>
    );
  },
};
