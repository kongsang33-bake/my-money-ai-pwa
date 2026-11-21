import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scrimOpacityFor, sheetDragIntent, shouldCloseSheet } from "./sheet-drag.ts";
import { SHEET_DRAG_CLOSE_FRACTION, SHEET_DRAG_FLICK_MIN_PX, SHEET_DRAG_FLICK_VELOCITY, SHEET_DRAG_SLOP } from "./constants.ts";

describe("sheetDragIntent", () => {
  it("waits until the finger has moved past the slop", () => {
    assert.equal(sheetDragIntent(0, SHEET_DRAG_SLOP - 1), "pending");
  });
  it("is a drag when it goes mostly down", () => {
    assert.equal(sheetDragIntent(3, 20), "drag");
  });
  it("leaves a sideways swipe to the rail under it", () => {
    assert.equal(sheetDragIntent(20, 10), "ignore");
  });
  it("leaves an upward move to the sheet's own scroll", () => {
    assert.equal(sheetDragIntent(0, -20), "ignore");
  });
});

describe("shouldCloseSheet", () => {
  const height = 600;
  it("closes past the share of the sheet's height", () => {
    assert.equal(shouldCloseSheet(height * SHEET_DRAG_CLOSE_FRACTION, 0, height), true);
  });
  it("snaps back from a short, slow drag", () => {
    assert.equal(shouldCloseSheet(height * SHEET_DRAG_CLOSE_FRACTION - 1, 0.1, height), false);
  });
  it("closes on a flick even when short", () => {
    assert.equal(shouldCloseSheet(SHEET_DRAG_FLICK_MIN_PX, SHEET_DRAG_FLICK_VELOCITY, height), true);
  });
  it("does not count a fast twitch as a flick", () => {
    assert.equal(shouldCloseSheet(SHEET_DRAG_FLICK_MIN_PX - 1, SHEET_DRAG_FLICK_VELOCITY * 3, height), false);
  });
  it("never closes a sheet that is back at the top", () => {
    assert.equal(shouldCloseSheet(0, 5, height), false);
  });
});

describe("scrimOpacityFor", () => {
  it("is whole at rest and fades with the sheet", () => {
    assert.equal(scrimOpacityFor(0, 600), 1);
    assert.equal(scrimOpacityFor(300, 600), 0.5);
  });
  it("never fades below a third", () => {
    assert.equal(scrimOpacityFor(600, 600), 1 / 3);
  });
});
