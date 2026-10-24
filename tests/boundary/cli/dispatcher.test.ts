import { copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect } from "vitest";

import { workspaceCliTest } from "../../support/cli/workspaceCliFixture.js";

describe("Bun executable admission", () => {
  workspaceCliTest(
    "rejects affected Bun before every executable adapter",
    async ({ processes }) => {
      for (const mode of [
        "--version",
        "mcp",
        "--mcp",
        "mcp-doctor",
        "direct",
      ]) {
        const args = mode === "mcp-doctor" ? ["mcp", "doctor"] : [mode];
        const entry =
          mode === "direct"
            ? `process.argv = ["node"]; process.exitCode = await (await import(${JSON.stringify(pathToFileURL(resolve("dist/main.js")).href)})).run();`
            : `process.argv = ["node", "rea", ...${JSON.stringify(args)}]; await import(${JSON.stringify(pathToFileURL(resolve("scripts/rea.mjs")).href)});`;
        const result = await processes.run(process.execPath, [
          "--input-type=module",
          "--eval",
          `Object.defineProperty(process.versions, 'bun', {value: '1.4.3'}); Object.defineProperty(process.versions, 'node', {value: '26.12.1'}); ${entry}`,
        ]);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain("Unsupported Bun 1.4.3");
      }
    },
  );
});

describe("executable dispatcher", () => {
  workspaceCliTest(
    "rejects vulnerable runtimes before CLI or MCP starts",
    async ({ processes }) => {
      const dispatcher = pathToFileURL(resolve("scripts/rea.mjs")).href;
      for (const version of ["22.23.3", "24.22.0", "26.12.0", "24.22.1-rc.1"]) {
        for (const mode of [
          "--version",
          "mcp",
          "--mcp",
          "mcp-doctor",
          "direct",
        ]) {
          const args = mode === "mcp-doctor" ? ["mcp", "doctor"] : [mode];
          const entry =
            mode === "direct"
              ? `process.argv = ["node"]; process.exitCode = await (await import(${JSON.stringify(pathToFileURL(resolve("dist/main.js")).href)})).run();`
              : `process.argv = ["node", "rea", ...${JSON.stringify(args)}]; await import(${JSON.stringify(dispatcher)});`;
          const result = await processes.run(process.execPath, [
            "--input-type=module",
            "--eval",
            `Object.defineProperty(process.versions, 'node', {value: ${JSON.stringify(version)}}); ${entry}`,
          ]);
          expect(result.exitCode).toBe(1);
          expect(result.stdout).toBe("");
          expect(result.stderr).toContain(`Unsupported Node.js ${version}`);
        }
      }
    },
  );

  workspaceCliTest(
    "reserves production MCP routing for bare mode arguments",
    async ({ processes, workspace }) => {
      const scripts = await workspace.mkdir("scripts");
      await workspace.mkdir("dist");
      await workspace.mkdir("dist/cli-runtime");
      await workspace.mkdir("dist/mcp");
      await workspace.mkdir("dist/domain");
      await Promise.all([
        copyFile("scripts/rea.mjs", join(scripts, "rea.mjs")),
        workspace.write(
          "dist/domain/runtimeVersion.js",
          "export const unsupportedRuntimeMessage = () => undefined;\n",
        ),
        workspace.write(
          "package.json",
          JSON.stringify({ type: "module", version: "1.0.0" }),
        ),
        workspace.write(
          "dist/mcp/main.js",
          'export const runEntrypoint = () => process.stdout.write(JSON.stringify({ adapter: "mcp" }));\n',
        ),
        workspace.write(
          "dist/cli-runtime/cli.js",
          'export const cliConfigurationError = () => undefined; export const createCli = () => ({ serve: (args) => process.stdout.write(JSON.stringify({ adapter: "cli", args })) });\n',
        ),
        workspace.write(
          "dist/cli-runtime/cliOutput.js",
          "export const validateCliOutputArguments = () => ({ ok: true }); export const renderCliOutputArgumentError = () => ''; export const renderEmptyFilteredCliOutput = () => undefined;\n",
        ),
        workspace.write(
          "dist/cli-runtime/cliResultOutput.js",
          "export const createCliResultOutput = () => undefined;\n",
        ),
        workspace.write(
          "dist/cli-runtime/mcpDoctor.js",
          'export const runProductionMcpDoctorCli = (args) => Promise.resolve({ output: JSON.stringify({ adapter: "mcp-doctor", args }), exitCode: 0 });\n',
        ),
      ]);

      const invoke = async (args: readonly string[]): Promise<unknown> => {
        const { exitCode, stdout } = await processes.run(
          process.execPath,
          [join(scripts, "rea.mjs"), ...args],
          { cwd: workspace.root },
        );
        expect(exitCode).toBe(0);
        return JSON.parse(stdout) as unknown;
      };

      await expect(invoke(["mcp"])).resolves.toEqual({ adapter: "mcp" });
      await expect(invoke(["--mcp"])).resolves.toEqual({ adapter: "mcp" });
      await expect(invoke(["mcp", "doctor", "--json"])).resolves.toEqual({
        adapter: "mcp-doctor",
        args: ["--json"],
      });
      await expect(invoke(["mcp", "add"])).resolves.toEqual({
        adapter: "cli",
        args: ["mcp", "add"],
      });
      await expect(invoke(["--mcp", "extra"])).resolves.toEqual({
        adapter: "cli",
        args: ["--mcp", "extra"],
      });
    },
  );

  workspaceCliTest(
    "explains how to restore a missing compiled runtime",
    async ({ processes, workspace }) => {
      const scripts = await workspace.mkdir("scripts");
      await Promise.all([
        copyFile("scripts/rea.mjs", join(scripts, "rea.mjs")),
        workspace.write(
          "package.json",
          JSON.stringify({ type: "module", version: "1.0.0" }),
        ),
      ]);

      for (const args of [["mcp"], ["mcp", "doctor"], ["--help"]]) {
        const result = await processes.run(
          process.execPath,
          [join(scripts, "rea.mjs"), ...args],
          { cwd: workspace.root },
        );
        expect(result).toMatchObject({
          exitCode: 1,
          stderr: expect.stringContaining(
            "REA's compiled runtime is missing. Run `npm ci && npm run build:cached` in",
          ),
        });
        expect(result.stderr).toContain(
          "If this is an installed package, reinstall rea-agents.",
        );
        expect(result).toMatchObject({
          stderr: expect.not.stringContaining("ERR_MODULE_NOT_FOUND"),
        });
      }
    },
  );
});
