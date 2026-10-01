import type { DocPage } from "../types";
import { Cell, Code, P, Row, Table } from "../ui";

const commands: Array<[string, string]> = [
  ["nconnect", "Interactive launcher. Pick a harness."],
  ["nconnect <harness> [args...]", "Launch a harness directly. Args pass through to the agent."],
  ["nconnect --model <id> <harness>", "Launch a harness on a specific Nebius model."],
  ["nconnect configure", "Set your API keys."],
  ["nconnect usage --last 7d", "Local spend by model and tool. Never uploaded."],
  ["nconnect update", "Update to the latest release now."],
  ["nconnect daemon install", "Start the daemon at login (launchd / systemd)."],
  ["nconnect daemon status", "Show auto-start status."],
  ["nconnect daemon stop", "Stop the running daemon."],
  ["nconnect daemon uninstall", "Stop starting the daemon at login."],
  ["nconnect hermes desktop", "Launch the Hermes desktop app on Nebius."],
  ["nconnect chatgpt", "Alpha: route ChatGPT / Codex Desktop through NConnect."],
  ["nconnect chatgpt off", "Restore your previous Codex / ChatGPT config."],
];

export const commandsPage: DocPage = {
  slug: "commands",
  title: "Command reference",
  navLabel: "Commands",
  description:
    "Every NConnect CLI command: launching harnesses, choosing models, configuring keys, viewing usage, updating, and managing the background daemon.",
  group: "Reference",
  Content() {
    return (
      <>
        <P>
          Each harness also has a short alias (<Code>nclaude</Code>, <Code>ncodex</Code>,{" "}
          <Code>nhermes</Code>, <Code>ngrok</Code> and so on), equivalent to{" "}
          <Code>nconnect &lt;harness&gt;</Code>. See <a href="/docs/harnesses">Harnesses</a>.
        </P>
        <Table head={["Command", "What it does"]}>
          {commands.map(([cmd, what]) => (
            <Row key={cmd}>
              <Cell>
                <Code>{cmd}</Code>
              </Cell>
              <Cell>{what}</Cell>
            </Row>
          ))}
        </Table>
      </>
    );
  },
};
