import { describe, expect, it } from "vitest";
import { ExcalidrawElementSchema, type RectangleElement } from "../src/index.js";

const element = (n: number): RectangleElement => ({
  id: `rectangle-${n}`, type: "rectangle", x: n, y: n, width: 100, height: 80, angle: 0,
  strokeColor: "#000000", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 1,
  strokeStyle: "solid", roughness: 1, opacity: 100, groupIds: null, frameId: null, index: `${n}`,
  roundness: null, seed: n, versionNonce: n, isDeleted: false, boundElements: null, updated: n,
  link: null, locked: false,
});

describe("Excalidraw element JSON round-trip", () => {
  it("round-trips 100 elements without changing their data", () => {
    const elements = Array.from({ length: 100 }, (_, n) => element(n));
    const parsed = JSON.parse(JSON.stringify(elements));
    expect(parsed).toEqual(elements);
    expect(parsed.every((value: unknown) => ExcalidrawElementSchema.safeParse(value).success)).toBe(true);
  });
});

