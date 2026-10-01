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
  harness: "Pi Code",
  harnessId: "pi",
  alias: "npi",
  binary: "pi",
  install: "npm install -g --ignore-scripts @earendil-works/pi-coding-agent",
  modelId: "MiniMaxAI/MiniMax-M3",
};

export const minimaxM3Pi: Tutorial = {
  slug: "minimax-m3-pi",
  title: "How to run MiniMax M3 with Pi Code",
  navLabel: "MiniMax M3 + Pi Code",
  description:
    "Run the Pi coding agent on MiniMax M3, a fast and low-cost reasoning model, served by Nebius Token Factory through NConnect with a temporary provider config.",
  harness: setup.harness,
  model: "MiniMax M3",
  totalTime: "PT5M",
  updated: "2026-10-01",
  steps: setupHowTo(setup, "MiniMax M3"),
  Content() {
    return (
      <>
        <P>
          Pi is a minimal terminal coding agent. NConnect declares Nebius as a custom
          OpenAI-compatible provider for each launch, so no proxy is needed. MiniMax M3 is a fast,
          inexpensive mixture-of-experts reasoning model, a good fit for quick edits and scripted
          runs.
        </P>

        <Prerequisites />
        <SetupSteps
          setup={setup}
          modelName="MiniMax M3"
          launchNote={
            <>
              <P>For a one-shot answer, pass Pi&apos;s own print flag:</P>
              <CopyBox text={launchCommand(setup, '--print "list the scripts in package.json"')} />
            </>
          }
        />
        <FlagOrder setup={setup} />

        <H2 id="what-happens">What NConnect does on launch</H2>
        <ul>
          <li>
            Writes a <Code>models.json</Code> with a <Code>nebius</Code> provider into a temporary
            directory and deletes it when Pi exits.
          </li>
          <li>
            Keeps your sessions in the usual <Code>~/.pi/agent/sessions</Code>, so they stay
            resumable.
          </li>
          <li>
            Launches Pi with <Code>--no-approve</Code> and without your extensions, skills, prompt
            templates or themes, so the run is predictable.
          </li>
          <li>Lists every Nebius model, so you can switch inside Pi.</li>
        </ul>

        <MeteringSection setup={setup} modelName="MiniMax M3" />
      </>
    );
  },
};
