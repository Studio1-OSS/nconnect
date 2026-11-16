import type { Tutorial } from "../types";
import { Code, CopyBox, H2, Link, P } from "../ui";
import {
  FlagOrder,
  Prerequisites,
  SetupSteps,
  launchCommand,
  setupHowTo,
  type Setup,
} from "./shared";

const setup: Setup = {
  harness: "Unreal Agent",
  harnessId: "unreal",
  alias: "nunreal",
  binary: "unreal-agent-runner",
  install: "go install github.com/unreallabsai/unreal-agent/cmd/unreal-agent-runner@latest",
  modelId: "moonshotai/Kimi-K3.1-Pro",
};

export const kimiK31ProUnreal: Tutorial = {
  slug: "kimi-k3-1-pro-unreal-agent",
  title: "How to run Kimi K3.1 Pro with Unreal Agent",
  navLabel: "Kimi K3.1 Pro + Unreal Agent",
  description:
    "Run Unreal Labs' async-first Unreal Agent runner on Moonshot AI's Kimi K3.1 Pro, served by Nebius Token Factory through NConnect's Responses API proxy.",
  harness: setup.harness,
  model: "Kimi K3.1 Pro",
  totalTime: "PT10M",
  updated: "2026-11-16",
  steps: setupHowTo(setup, "Kimi K3.1 Pro"),
  Content() {
    return (
      <>
        <P>
          Unreal Agent&apos;s runner only speaks the OpenAI Responses API, which Nebius does not
          serve, so NConnect proxies it the same way it proxies Codex. Kimi K3.1 Pro is Moonshot
          AI&apos;s open-weight model for reasoning, coding and agentic tool use, with image input
          and a 1M-token context window.
        </P>

        <Prerequisites>
          <li>
            Go 1.27 or newer to build the runner, or a prebuilt binary from its{" "}
            <Link href="https://github.com/unreallabsai/unreal-agent/releases">releases page</Link>.
          </li>
        </Prerequisites>
        <SetupSteps
          setup={setup}
          modelName="Kimi K3.1 Pro"
          launchNote={
            <>
              <P>
                Everything after <Code>unreal</Code> goes to the runner, so <Code>-p</Code>,{" "}
                <Code>-workspace</Code> and JSON requests work as usual:
              </P>
              <CopyBox text={launchCommand(setup, '-p "fix the failing test" -workspace .')} />
            </>
          }
        />
        <FlagOrder setup={setup} />

        <H2 id="what-happens">What NConnect does on launch</H2>
        <ul>
          <li>
            Registers an Unreal session with the local daemon and points the runner&apos;s{" "}
            <Code>openai</Code> provider at it, entirely through environment variables. There is no
            config file to write or restore.
          </li>
          <li>
            Gives the runner a per-session daemon token. The Nebius key stays inside the daemon and
            is removed from the runner&apos;s environment.
          </li>
          <li>Translates Responses API traffic to Nebius and meters every turn.</li>
        </ul>
      </>
    );
  },
};
