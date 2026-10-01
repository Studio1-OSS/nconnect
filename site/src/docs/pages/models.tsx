import type { DocPage } from "../types";
import { models } from "../data";
import { ProviderBrand } from "../../components/ProviderBrand";
import { Badge, Callout, Cell, Code, CodeBlock, H2, Mark, P, Row, Table } from "../ui";

export const modelsPage: DocPage = {
  slug: "models",
  title: "Models",
  description:
    "Every model Nebius Token Factory serves is available in NConnect: GLM 5.3, Kimi K3, DeepSeek V4, Qwen 3.5, MiniMax M3 and more. Compare context windows and vision support.",
  group: "Models",
  Content() {
    return (
      <>
        <div className="docs-provider-inline">
          <ProviderBrand provider="nebius" />
        </div>
        <P>
          The model list is fetched live from Nebius at startup, so every model they serve is
          available and each model's vision support comes from the API's own modality field, never a
          hand-maintained list. Results are cached locally and fall back to a bundled snapshot when
          offline.
        </P>
        <Table head={["Model", "Id", "Best for", "Context", "Vision"]}>
          {models.map((m) => (
            <Row key={m.id}>
              <Cell strong>
                <span className="docs-name">
                  <Mark logo={m.logo} />
                  {m.name}
                  {m.isDefault ? <Badge tone="neutral">Default</Badge> : null}
                </span>
              </Cell>
              <Cell>
                <Code>{m.id}</Code>
              </Cell>
              <Cell>{m.bestFor}</Cell>
              <Cell>{m.context}</Cell>
              <Cell>{m.vision ? "Yes" : "No"}</Cell>
            </Row>
          ))}
        </Table>

        <H2 id="selecting">Selecting a model</H2>
        <P>
          GLM 5.3 Flash is the default. Pass <Code>--model</Code> before the harness name to pick
          another one, or switch inside the agent where it supports that.
        </P>
        <CodeBlock>{`nconnect --model zai-org/GLM-5.3 codex
nconnect --model deepseek-ai/DeepSeek-V4-Pro-0813 codex
nconnect --model moonshotai/Kimi-K3 hermes`}</CodeBlock>
        <P>
          Proxied harnesses remember the model you last switched to inside a session and use it as
          the default on the next launch.
        </P>
        <Callout>
          In Codex, select a vision-capable model before attaching images. Claude Code uses a
          separate vision-description path. See <a href="/docs/vision">Images &amp; vision</a>.
        </Callout>
      </>
    );
  },
};
