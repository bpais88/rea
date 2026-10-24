import { satisfies } from "semver";

/** Supported runtime range, kept in sync with the published package engines. */
export const SUPPORTED_NODE_VERSION_RANGE = "^22.23.4 || ^24.22.1 || >=26.12.1";

/** Human-readable form of {@link SUPPORTED_NODE_VERSION_RANGE} for remediation. */
export const SUPPORTED_NODE_VERSION_PROSE =
  "Node.js 22.x (>=22.23.4), 24.x (>=24.22.1), or >=26.12.1";

/** Return whether a Node.js version satisfies REA's tested runtime families. */
export const supportsNodeVersion = (version: string): boolean =>
  satisfies(version, SUPPORTED_NODE_VERSION_RANGE);

/** Bun's decoder is independent of the Node API version it advertises. */
export const SUPPORTED_BUN_VERSION_RANGE = ">=1.4.4";
const BUN_NODE_COMPATIBILITY_RANGE = "^22.19.0 || ^24.11.0 || >=26.0.0";

/** JavaScript runtime executing REA. Bun also reports a Node.js compatibility version. */
export type JavaScriptRuntime =
  | { readonly id: "node"; readonly version: string }
  | {
      readonly id: "bun";
      readonly version: string;
      readonly nodeCompatibilityVersion: string;
    };

/** Identify the runtime from `process.versions`; only Bun reports `bun`. */
export const javaScriptRuntime = (versions: {
  readonly node: string;
  readonly bun?: string | undefined;
}): JavaScriptRuntime =>
  versions.bun === undefined
    ? { id: "node", version: versions.node }
    : {
        id: "bun",
        version: versions.bun,
        nodeCompatibilityVersion: versions.node,
      };

/** Apply the patch floor to the actual runtime, retaining Bun's API baseline. */
export const supportsJavaScriptRuntime = (
  runtime: JavaScriptRuntime,
): boolean =>
  runtime.id === "node"
    ? supportsNodeVersion(runtime.version)
    : satisfies(runtime.version, SUPPORTED_BUN_VERSION_RANGE) &&
      satisfies(runtime.nodeCompatibilityVersion, BUN_NODE_COMPATIBILITY_RANGE);

export const runtimeVersionRequirement = (
  runtime: JavaScriptRuntime,
): string =>
  runtime.id === "node"
    ? SUPPORTED_NODE_VERSION_PROSE
    : "Bun >=1.4.4 with Node.js 22.x (>=22.19), 24.x (>=24.11), or 26+ API compatibility";

/** Shared entrypoint diagnostic before CLI/MCP creates any runtime resources. */
export const unsupportedRuntimeMessage = (versions: {
  readonly node: string;
  readonly bun?: string | undefined;
}): string | undefined => {
  const runtime = javaScriptRuntime(versions);
  return supportsJavaScriptRuntime(runtime)
    ? undefined
    : `Unsupported ${runtime.id === "node" ? "Node.js" : "Bun"} ${runtime.version}. Install ${runtimeVersionRequirement(runtime)}.\n`;
};
