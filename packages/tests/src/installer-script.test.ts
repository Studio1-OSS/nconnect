import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
      // A link left by an older generation, first on PATH, must be replaced -
      // not skipped - or it keeps shadowing the new commands forever.
      const staleBin = path.join(home, ".nebiuslink", "bin");
      mkdirSync(staleBin, { recursive: true });
      writeFileSync(path.join(staleBin, "nclaude"), "#!/bin/sh\nexec bun old.js claude\n", {
        mode: 0o755,
      });
      symlinkSync(path.join(staleBin, "nclaude"), path.join(tools, "nclaude"));
      // Someone else's wrapper that happens to run a file named nconnect.js
      // must be skipped, not replaced.
      const foreign = '#!/usr/bin/env sh\nexec bun "/opt/acme/nconnect.js" grok "$@"\n';
      writeFileSync(path.join(tools, "ngrok"), foreign, { mode: 0o755 });
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
      expect(readFileSync(path.join(tools, "ngrok"), "utf8")).toBe(foreign);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("finds Bun where BUN_INSTALL put it when it has to install Bun", () => {
    const home = mkdtempSync(path.join(tmpdir(), "relay-install-bun-"));
    try {
      const tools = path.join(home, "tools");
      const bunHome = path.join(home, "custom bun");
      mkdirSync(tools);
      // curl stands in for both downloads: Bun's installer (which honours
      // BUN_INSTALL, like the real one) and the NConnect bundle.
      writeFileSync(
        path.join(tools, "curl"),
        `#!/bin/sh
if [ "$2" = "https://bun.sh/install" ]; then
  cat <<'BUN'
mkdir -p "$BUN_INSTALL/bin"
printf '#!/bin/sh\\n[ "$1" = "--version" ] && echo 9.9.9 && exit 0\\nprintf "%%s\\\\n" "$@"\\n' > "$BUN_INSTALL/bin/bun"
chmod +x "$BUN_INSTALL/bin/bun"
BUN
  exit 0
fi
printf "// test bundle\\n" > "$4"
`,
        { mode: 0o755 },
      );
      const output = execFileSync("/bin/sh", [], {
        input: readFileSync(installer),
        env: {
          HOME: home,
          SHELL: "/bin/sh",
          PATH: `${tools}:/usr/bin:/bin`,
          BUN_INSTALL: bunHome,
          NCONNECT_HOME: path.join(home, "nc"),
          NCONNECT_ORIGIN: "https://installer.test",
        },
        encoding: "utf8",
      });
      expect(output).toContain("Bun installed: 9.9.9");
      expect(output).toContain("Verified:");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
