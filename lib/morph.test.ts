import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isOnScreen, morphTransform, parseDuration } from "./morph.ts";

describe("morphTransform", () => {
  it("moves and scales a box onto another", () => {
    const from = { left: 20, top: 500, width: 40, height: 20 };
    const to = { left: 16, top: 120, width: 120, height: 40 };
    assert.deepEqual(morphTransform(from, to), { dx: -4, dy: -380, scale: 2 });
  });

  it("scales by height alone, so figures are never stretched", () => {
    const { scale } = morphTransform({ left: 0, top: 0, width: 50, height: 10 }, { left: 0, top: 0, width: 400, height: 30 });
    assert.equal(scale, 3);
  });

  it("does not divide by a zero height", () => {
    assert.equal(morphTransform({ left: 0, top: 0, width: 10, height: 0 }, { left: 0, top: 0, width: 10, height: 10 }).scale, 1);
  });
});

describe("isOnScreen", () => {
  const viewport = { width: 390, height: 844 };
  it("accepts a box inside the viewport, or partly in it", () => {
    assert.equal(isOnScreen({ left: 10, top: 10, width: 40, height: 40 }, viewport), true);
    assert.equal(isOnScreen({ left: 370, top: 10, width: 40, height: 40 }, viewport), true);
  });
  it("refuses a box off screen or not drawn", () => {
    assert.equal(isOnScreen({ left: 400, top: 10, width: 40, height: 40 }, viewport), false);
    assert.equal(isOnScreen({ left: 10, top: -60, width: 40, height: 40 }, viewport), false);
    assert.equal(isOnScreen({ left: 10, top: 10, width: 0, height: 0 }, viewport), false);
  });
});

describe("parseDuration", () => {
  it("reads ms and s", () => {
    assert.equal(parseDuration("240ms", 0), 240);
    assert.equal(parseDuration(" 0.24s", 0), 240);
  });
  it("falls back on anything else", () => {
    assert.equal(parseDuration("", 200), 200);
    assert.equal(parseDuration("fast", 200), 200);
  });
});
