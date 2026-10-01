import type { DocPage } from "../types";
import { Callout, Code, CopyBox, H2, P } from "../ui";

export const desktop: DocPage = {
  slug: "desktop",
  title: "ChatGPT / Codex Desktop (alpha)",
  navLabel: "Codex Desktop (alpha)",
  description:
    "Route compatible ChatGPT and Codex Desktop coding tasks through NConnect to Nebius models, and restore your original Codex configuration when you are done.",
  group: "Harnesses",
  Content() {
    return (
      <>
        <P>
          The released CLI includes <Code>nconnect chatgpt</Code> (alias: <Code>codex-app</Code>)
          for compatible desktop coding tasks. It configures a local Responses provider in{" "}
          <Code>~/.codex/config.toml</Code>, writes a model catalog, and attempts to open the
          desktop app.
        </P>
        <CopyBox text="nconnect chatgpt" />
        <Callout tone="warning" title="Alpha">
          This integration uses a provider-auth workaround and changes persistent configuration
          shared with Codex CLI, unlike the temporary settings used by the harness wrappers. It does
          not change the model selection for ordinary ChatGPT web chats. Desktop compatibility
          depends on the installed app version.
        </Callout>
        <H2 id="restore">Restore your configuration</H2>
        <P>Restore the backed-up configuration when you are finished:</P>
        <CopyBox text="nconnect chatgpt off" />
      </>
    );
  },
};
