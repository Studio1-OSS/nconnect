import type { Tutorial } from "../types";
import { Code, CodeBlock, CopyBox, H2, P, Video } from "../ui";
import {
  FlagOrder,
  Prerequisites,
  SetupSteps,
  launchCommand,
  setupHowTo,
  type Setup,
} from "./shared";

const setup: Setup = {
  harness: "Claude Code",
  harnessId: "claude",
  alias: "nclaude",
  binary: "claude",
  install: "npm install -g @anthropic-ai/claude-code",
  modelId: "moonshotai/Kimi-K3",
};

const video = {
  youtubeId: "9_eZOLkGg-w",
  title: "Kimi K3 with Claude Code is the Best Combo!",
  uploadDate: "2026-08-07T00:34:00-07:00",
};

export const kimiK3ClaudeCode: Tutorial = {
  slug: "kimi-k3-claude-code",
  title: "How to run Kimi K3 with Claude Code",
  navLabel: "Kimi K3 + Claude Code",
  description:
    "Use Claude Code with Moonshot AI's Kimi K3 and its full 1M-token context, served by Nebius Token Factory through NConnect. No Anthropic account needed. Video included.",
  harness: setup.harness,
  model: "Kimi K3",
  totalTime: "PT5M",
  updated: "2026-10-01",
  steps: setupHowTo(setup, "Kimi K3"),
  video,
  Content() {
    return (
      <>
        <P>
          Claude Code speaks the Anthropic Messages API, which Nebius does not serve. NConnect runs
          a local proxy that translates every request to Nebius chat completions, so Claude Code
          works unchanged while Kimi K3 does the thinking. Kimi K3 is Moonshot AI&apos;s frontier
          open-weights model for coding and agentic tool use.
        </P>

        <H2 id="video">Watch the walkthrough</H2>
        <Video youtubeId={video.youtubeId} title={video.title} />

        <Prerequisites>
          <li>No Anthropic account or API key. Your existing Claude login is not used.</li>
        </Prerequisites>
        <SetupSteps
          setup={setup}
          modelName="Kimi K3"
          launchNote={
            <>
              <P>Pass a prompt straight through to Claude Code for a one-off run:</P>
              <CopyBox text={launchCommand(setup, '-p "explain this repo"')} />
            </>
          }
        />
        <FlagOrder setup={setup} />

        <H2 id="what-happens">What NConnect does on launch</H2>
        <ul>
          <li>
            Starts (or reuses) the local daemon and points Claude Code at it. Anthropic keys, login
            tokens and model variables are removed from the session&apos;s environment.
          </li>
          <li>
            Fills Claude Code&apos;s <Code>/model</Code> menu with Nebius models, each labelled
            &quot;via nconnect - not Anthropic&quot;. Built-in exploration subagents use Kimi K2.7
            Code in the Haiku slot.
          </li>
          <li>
            Sends the 1M-context hint for Kimi K3, so Claude Code uses the full window instead of
            compacting early.
          </li>
          <li>
            Backs the native <Code>web_search</Code> tool with Tavily when you have added a Tavily
            key, and routes pasted images to a vision model.
          </li>
          <li>
            Disables <Code>/feedback</Code>, which would post your transcript to Anthropic rather
            than through the proxy.
          </li>
        </ul>

        <H2 id="cost">See what the session cost</H2>
        <P>Claude Code is proxied, so every turn is metered. The total prints when you exit:</P>
        <CodeBlock label="On exit">
          {"[nconnect cost] session total: $0.0412 (11,840 in, 1,205 out)"}
        </CodeBlock>
        <P>
          The numbers above are illustrative. Run <Code>nconnect usage --last 7d</Code> for a
          breakdown by model and tool.
        </P>

        <H2 id="switching">Switch models later</H2>
        <P>
          Pick another model from <Code>/model</Code> inside Claude Code. NConnect remembers it and
          uses it as the default the next time you run <Code>nclaude</Code>.
        </P>
      </>
    );
  },
};
