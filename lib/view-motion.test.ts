import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { viewMotion } from "./view-motion.ts";

describe("viewMotion", () => {
  it("fades between two tabs", () => {
    assert.equal(viewMotion(0, 0), "fade");
  });
  it("slides forward into a screen with a back button", () => {
    assert.equal(viewMotion(0, 1), "forward");
  });
  it("slides back out of one", () => {
    assert.equal(viewMotion(1, 0), "back");
  });
  it("fades between two screens at the same depth", () => {
    assert.equal(viewMotion(1, 1), "fade");
  });
});
