import { describe, expect, it } from "vitest";

import {
  javaScriptRuntime,
  supportsNodeVersion,
  supportsJavaScriptRuntime,
  unsupportedRuntimeMessage,
} from "./runtimeVersion.js";

describe("supported Node.js versions", () => {
  it.each([
    ["20.0.0", false],
    ["22.18.9", false],
    ["22.19.0", false],
    ["22.23.3", false],
    ["22.23.4", true],
    ["22.24.0", true],
    ["22.99.0", true],
    ["23.0.0", false],
    ["24.10.9", false],
    ["24.11.0", false],
    ["24.22.0", false],
    ["24.22.1", true],
    ["24.23.0", true],
    ["24.99.0", true],
    ["25.1.0", false],
    ["26.0.0", false],
    ["26.12.0", false],
    ["26.12.1", true],
    ["26.13.0", true],
    ["27.0.0", true],
    ["24.11.0-rc.1", false],
    ["26.0.0-nightly.20261001", false],
    ["24.11", false],
    ["24.11.invalid", false],
    ["invalid", false],
  ])("classifies %s as supported=%s", (version, expected) => {
    expect(supportsNodeVersion(version)).toBe(expected);
  });
});

describe("JavaScript runtime identity", () => {
  it("distinguishes Bun from Node.js by its own version", () => {
    expect(javaScriptRuntime({ node: "24.18.0" })).toEqual({
      id: "node",
      version: "24.18.0",
    });
    expect(javaScriptRuntime({ node: "26.3.0", bun: "1.4.2" })).toEqual({
      id: "bun",
      version: "1.4.2",
      nodeCompatibilityVersion: "26.3.0",
    });
  });
});

describe("runtime-specific security admission", () => {
  it.each([
    ["1.4.3", "26.12.1", false],
    ["1.4.4", "26.3.0", true],
    ["1.5.0", "26.3.0", true],
    ["1.4.4-rc.1", "26.12.1", false],
    ["invalid", "26.12.1", false],
    ["1.4.4", "25.1.0", false],
  ])(
    "checks Bun %s independently of compatibility %s",
    (bun, node, expected) => {
      expect(supportsJavaScriptRuntime(javaScriptRuntime({ bun, node }))).toBe(
        expected,
      );
      expect(unsupportedRuntimeMessage({ bun, node }) === undefined).toBe(
        expected,
      );
    },
  );
});
