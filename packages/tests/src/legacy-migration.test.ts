import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  applyLegacyEnv,
  legacyMigrationNotice,
  migrateLegacyInstall,
} from "../../cli/src/lib/legacy-migration.js";

describe("legacy env fallback", () => {
  test("maps NEBIUSRELAY_* to NCONNECT_* only when the new name is unset", () => {
    const env: NodeJS.ProcessEnv = {
      NEBIUSRELAY_PORT: "7999",
      NEBIUSRELAY_DEBUG: "1",
      NCONNECT_DEBUG: "0",
      PATH: "/usr/bin",
    };
    expect(applyLegacyEnv(env)).toEqual(["NCONNECT_PORT"]);
    expect(env.NCONNECT_PORT).toBe("7999");
    expect(env.NCONNECT_DEBUG).toBe("0");
  });
});

describe("legacy install migration", () => {
  const dirs: string[] = [];
  const makeHome = () => {
    const home = mkdtempSync(path.join(tmpdir(), "nconnect-migrate-"));
    dirs.push(home);
    return home;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function legacyInstall(home: string) {
    const legacy = path.join(home, ".nebiusrelay");
    mkdirSync(path.join(legacy, "bin"), { recursive: true });
    mkdirSync(path.join(legacy, "prime-agent"), { recursive: true });
    writeFileSync(path.join(legacy, "config.json"), '{"apiKey":"k"}');
    writeFileSync(path.join(legacy, "preferences.json"), "{}");
    writeFileSync(path.join(legacy, "prime-agent", "models.json"), "[]");
    const bundle = path.join(legacy, "bin", "nebiusrelay.js");
    writeFileSync(bundle, "// new code, downloaded over the old bundle\n");
    writeFileSync(
      path.join(legacy, "bin", "nebiusrelay"),
      `#!/usr/bin/env sh\nexec bun "${bundle}" "$@"\n`,
    );
    writeFileSync(
      path.join(legacy, "bin", "nclaude"),
      `#!/usr/bin/env sh\nexec bun "${bundle}" claude "$@"\n`,
    );
    writeFileSync(path.join(legacy, "bin", "ncodex"), "#!/bin/sh\necho custom\n");
    return { legacy, bundle };
  }

  test("does nothing without a legacy install", async () => {
    const home = makeHome();
    const env = { NCONNECT_HOME: path.join(home, ".nconnect") };
    expect(await migrateLegacyInstall({ home, env, argv1: undefined })).toBeUndefined();
  });

  test("copies state, installs the bundle, rewrites our wrappers, runs once", async () => {
    const home = makeHome();
    const { legacy, bundle } = legacyInstall(home);
    const newHome = path.join(home, ".nconnect");
    const env = { NCONNECT_HOME: newHome };
    let serviceCalls = 0;
    const result = await migrateLegacyInstall({
      home,
      env,
      argv1: bundle,
      stopLegacyService: async () => {
        serviceCalls += 1;
        return true;
      },
    });
    expect(result).toBeDefined();
    expect(result!.copied).toEqual(["config.json", "preferences.json", "prime-agent/"]);
    expect(readFileSync(path.join(newHome, "config.json"), "utf8")).toBe('{"apiKey":"k"}');
    expect(result!.installedBundle).toBe(true);
    const newBundle = path.join(newHome, "bin", "nconnect.js");
    expect(existsSync(newBundle)).toBe(true);
    expect(existsSync(path.join(newHome, "bin", "nconnect"))).toBe(true);
    expect(existsSync(path.join(newHome, "bin", "nunreal"))).toBe(true);
    // Our old wrappers now exec the new bundle; the customized one is untouched.
    expect(result!.rewroteWrappers).toEqual(["nebiusrelay", "nclaude"]);
    expect(readFileSync(path.join(legacy, "bin", "nclaude"), "utf8")).toContain(
      `exec bun "${newBundle}" claude`,
    );
    expect(readFileSync(path.join(legacy, "bin", "ncodex"), "utf8")).toBe(
      "#!/bin/sh\necho custom\n",
    );
    expect(result!.removedService).toBe(true);
    expect(serviceCalls).toBe(1);
    expect(legacyMigrationNotice(result!)).toContain("nebiusrelay is now NConnect");

    // Second run is a no-op.
    expect(await migrateLegacyInstall({ home, env, argv1: bundle })).toBeUndefined();
  });

  test("never overwrites state the new home already has", async () => {
    const home = makeHome();
    const { bundle } = legacyInstall(home);
    const newHome = path.join(home, ".nconnect");
    mkdirSync(newHome, { recursive: true });
    writeFileSync(path.join(newHome, "config.json"), '{"apiKey":"newer"}');
    const result = await migrateLegacyInstall({
      home,
      env: { NCONNECT_HOME: newHome },
      argv1: bundle,
      stopLegacyService: async () => false,
    });
    expect(result!.copied).not.toContain("config.json");
    expect(readFileSync(path.join(newHome, "config.json"), "utf8")).toBe('{"apiKey":"newer"}');
  });

  test("finishes the install on a later run when the marker was written by a non-legacy process", async () => {
    const home = makeHome();
    const { legacy, bundle } = legacyInstall(home);
    const newHome = path.join(home, ".nconnect");
    // First run from a dev build: state copied, marker written, but no
    // install/rewrite possible because the process is not the legacy bundle.
    const first = await migrateLegacyInstall({
      home,
      env: { NCONNECT_HOME: newHome },
      argv1: "/repo/packages/cli/dist/bin/nconnect.js",
      stopLegacyService: async () => false,
    });
    expect(first!.copied).toContain("config.json");
    expect(first!.installedBundle).toBe(false);
    expect(first!.rewroteWrappers).toEqual([]);
    expect(readFileSync(path.join(legacy, "bin", "nclaude"), "utf8")).toContain("nebiusrelay.js");

    // Later run from the (updated) legacy bundle: install + rewrite happen now.
    const later = await migrateLegacyInstall({
      home,
      env: { NCONNECT_HOME: newHome },
      argv1: bundle,
      stopLegacyService: async () => {
        throw new Error("must not run again");
      },
    });
    expect(later!.installedBundle).toBe(true);
    expect(later!.rewroteWrappers).toEqual(["nebiusrelay", "nclaude"]);
    expect(later!.copied).toEqual([]);
    expect(readFileSync(path.join(legacy, "bin", "nclaude"), "utf8")).toContain(
      path.join(newHome, "bin", "nconnect.js"),
    );
    // And after that, silence.
    expect(
      await migrateLegacyInstall({ home, env: { NCONNECT_HOME: newHome }, argv1: bundle }),
    ).toBeUndefined();
  });

  test("repoints PATH links that still target an older install's bin dir", async () => {
    const home = makeHome();
    const { bundle } = legacyInstall(home);
    const newHome = path.join(home, ".nconnect");
    // A previous generation (nebiuslink) linked into a dir that is first on PATH.
    const oldBin = path.join(home, ".nebiuslink", "bin");
    mkdirSync(oldBin, { recursive: true });
    writeFileSync(path.join(oldBin, "nclaude"), "#!/bin/sh\nexec bun old.js claude\n");
    const pathDir = path.join(home, "pathdir");
    mkdirSync(pathDir);
    symlinkSync(path.join(oldBin, "nclaude"), path.join(pathDir, "nclaude"));
    symlinkSync(
      path.join(home, ".nebiusrelay", "bin", "nebiusrelay"),
      path.join(pathDir, "nebiusrelay"),
    );
    symlinkSync("/usr/bin/true", path.join(pathDir, "npi")); // not ours: untouched

    const result = await migrateLegacyInstall({
      home,
      env: { NCONNECT_HOME: newHome },
      argv1: bundle,
      pathDirs: [pathDir],
      stopLegacyService: async () => false,
    });
    expect(result!.repointedLinks.sort()).toEqual(
      [path.join(pathDir, "nclaude"), path.join(pathDir, "nebiusrelay")].sort(),
    );
    expect(readlinkSync(path.join(pathDir, "nclaude"))).toBe(path.join(newHome, "bin", "nclaude"));
    expect(readlinkSync(path.join(pathDir, "nebiusrelay"))).toBe(
      path.join(newHome, "bin", "nconnect"),
    );
    expect(readlinkSync(path.join(pathDir, "npi"))).toBe("/usr/bin/true");
    expect(legacyMigrationNotice(result!)).toContain("Repointed 2 command link(s)");
  });
});
