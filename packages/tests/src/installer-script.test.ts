import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const installer = fileURLToPath(new URL("../../../scripts/install.sh", import.meta.url));
const shells = ["/bin/sh", "/bin/bash", "/bin/dash"].filter((shell) => {
  try {
    execFileSync(shell, ["-c", "exit 0"]);
    return true;
  } catch {
    return false;
  }
});

describe("public installer", () => {
  test.each(shells)("installs and preserves wrapper arguments under %s", (shell) => {
    const home = mkdtempSync(path.join(tmpdir(), "relay-install-"));
    try {
      const tools = path.join(home, "tools");
      mkdirSync(tools);
      writeFileSync(path.join(tools, "bun"), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 });
      writeFileSync(
        path.join(tools, "curl"),
        '#!/bin/sh\n[ "$1" = "-fsSL" ] || exit 2\n[ "$2" = "https://installer.test/nconnect.js" ] || exit 3\nprintf "// test bundle\\n" > "$4"\n',
        { mode: 0o755 },
      );
      const env = {
        ...process.env,
        HOME: home,
        SHELL: "/bin/sh",
        PATH: `${tools}:/usr/bin:/bin`,
        NCONNECT_HOME: path.join(home, "relay with spaces"),
        NCONNECT_ORIGIN: "https://installer.test",
      };
      const run = () =>
        execFileSync(shell, [], { input: readFileSync(installer), env, encoding: "utf8" });
      expect(run()).toContain("Verified:");
      expect(run()).toContain("PATH already configured");
      expect(readFileSync(path.join(home, ".profile"), "utf8").match(/# nconnect/g)).toHaveLength(
        1,
      );
      for (const [wrapper, harness] of Object.entries({
        nconnect: "",
        nclaude: "claude",
        ncodex: "codex",
        nopencode: "opencode",
        npi: "pi",
        nprime: "prime",
        nhermes: "hermes",
        ndeepseek: "deepseek",
        ngrok: "grok",
        nunreal: "unreal",
      })) {
        const output = execFileSync(
          path.join(tools, wrapper),
          ["--image", "/tmp/image with spaces.png", "describe this"],
          { env, encoding: "utf8" },
        )
          .trim()
          .split("\n");
        expect(output).toEqual([
          path.join(env.NCONNECT_HOME, "bin/nconnect.js"),
          ...(harness ? [harness] : []),
          "--image",
          "/tmp/image with spaces.png",
          "describe this",
        ]);
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
