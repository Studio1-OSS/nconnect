import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Give every test file its own NConnect home.
 *
 * Code under test writes real state there: the proxy records the model a
 * request asked for as the user's remembered model, and the Nebius client
 * appends request diagnostics. Without this, running the suite rewrote the
 * developer's own `~/.nconnect/preferences.json` - a proxy test that sends an
 * Auto request left their Claude Code set to Auto - and grew their
 * diagnostics log. Set NCONNECT_TEST_REAL_HOME=1 to opt out.
 */
if (process.env.NCONNECT_TEST_REAL_HOME !== "1") {
  const home = mkdtempSync(path.join(tmpdir(), "nconnect-test-home-"));
  process.env.NCONNECT_HOME = home;
  process.on("exit", () => {
    try {
      rmSync(home, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  });
}
