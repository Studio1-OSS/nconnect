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
  harness: "Codex CLI",
  harnessId: "codex",
  alias: "ncodex",
  binary: "codex",
  install: "npm install -g @openai/codex",
  modelId: "zai-org/GLM-5.3",
};

export const glm53Codex: Tutorial = {
  slug: "glm-5-3-codex",
  title: "How to run GLM 5.3 with Codex CLI",
  navLabel: "GLM 5.3 + Codex CLI",
  description:
    "Run OpenAI's Codex CLI on Z.ai's GLM 5.3, a 1M-context model for coding and tool use, served by Nebius Token Factory through NConnect. No OpenAI account needed.",
  harness: setup.harness,
  model: "GLM 5.3",
  totalTime: "PT5M",
  updated: "2026-10-01",
  steps: setupHowTo(setup, "GLM 5.3"),
  Content() {
    return (
      <>
        <P>
          Codex speaks the OpenAI Responses API, which Nebius does not serve. NConnect runs a local
          proxy that translates Codex&apos;s requests to Nebius chat completions. GLM 5.3 from Z.ai
          is a 1,024K-context model tuned for coding, reasoning and tool use.
        </P>

        <Prerequisites>
          <li>No OpenAI account or API key.</li>
        </Prerequisites>
        <SetupSteps
          setup={setup}
          modelName="GLM 5.3"
          launchNote={
            <>
              <P>
                Arguments after <Code>codex</Code> go to Codex, so non-interactive runs work too:
              </P>
              <CopyBox text={launchCommand(setup, 'exec "add a test for the parser"')} />
            </>
          }
        />
        <FlagOrder setup={setup} />

        <H2 id="what-happens">What NConnect does on launch</H2>
        <ul>
          <li>
            Registers a temporary <Code>nconnect</Code> model provider with command-line overrides.
            Your <Code>~/.codex/config.toml</Code> is not modified.
          </li>
          <li>Translates Responses API traffic to Nebius and meters every turn.</li>
          <li>
            Backs Codex&apos;s native <Code>web_search</Code> with Tavily when you have added a
            Tavily key.
          </li>
          <li>
            Summarizes traces for Codex&apos;s durable memory with a cheaper model (MiniMax M3 by
            default; change it with <Code>NCONNECT_CODEX_MEMORY_MODEL</Code>).
          </li>
        </ul>

        <H2 id="faster-start">Start faster with --no-mcp</H2>
        <P>
          Codex connects to every MCP server in your config at startup, which can add seconds to a
          simple prompt. <Code>--no-mcp</Code> is an NConnect shortcut that skips your user config
          for that launch. Authentication still works.
        </P>
        <CopyBox text={launchCommand(setup, "--no-mcp")} />

        <H2 id="images">Attaching images</H2>
        <P>
          GLM 5.3 is text-only. To attach screenshots, launch with a vision model such as Kimi K2.6.
          See <a href="/docs/vision">Images &amp; vision</a>.
        </P>
      </>
    );
  },
};
