import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { edgeSwipeIntent, shouldGoBack, startsAtEdge } from "./edge-swipe.ts";
import { EDGE_SWIPE_BACK_FRACTION, EDGE_SWIPE_SLOP, EDGE_SWIPE_ZONE, SHEET_DRAG_FLICK_MIN_PX, SHEET_DRAG_FLICK_VELOCITY } from "./constants.ts";

describe("startsAtEdge", () => {
  it("takes a touch on the left edge", () => {
    assert.equal(startsAtEdge(0), true);
    assert.equal(startsAtEdge(EDGE_SWIPE_ZONE), true);
  });
  it("leaves a touch further in to the page", () => {
    assert.equal(startsAtEdge(EDGE_SWIPE_ZONE + 1), false);
  });
});

describe("edgeSwipeIntent", () => {
  it("waits until the finger has moved past the slop", () => {
    assert.equal(edgeSwipeIntent(EDGE_SWIPE_SLOP - 1, 0), "pending");
  });
  it("is a swipe when it goes right and mostly sideways", () => {
    assert.equal(edgeSwipeIntent(30, 8), "swipe");
  });
  it("leaves a mostly vertical move to the page's scroll", () => {
    assert.equal(edgeSwipeIntent(8, 30), "ignore");
  });
  it("leaves a move to the left alone", () => {
    assert.equal(edgeSwipeIntent(-30, 0), "ignore");
  });
});

describe("shouldGoBack", () => {
  const width = 400;
  it("goes back past the share of the screen", () => {
    assert.equal(shouldGoBack(width * EDGE_SWIPE_BACK_FRACTION, 0, width), true);
  });
  it("springs back from a short, slow swipe", () => {
    assert.equal(shouldGoBack(width * EDGE_SWIPE_BACK_FRACTION - 1, 0.1, width), false);
  });
  it("goes back on a flick, even a short one", () => {
    assert.equal(shouldGoBack(SHEET_DRAG_FLICK_MIN_PX, SHEET_DRAG_FLICK_VELOCITY, width), true);
  });
  it("does not count a twitch as a flick", () => {
    assert.equal(shouldGoBack(SHEET_DRAG_FLICK_MIN_PX - 1, SHEET_DRAG_FLICK_VELOCITY * 3, width), false);
  });
  it("never goes back from where it started", () => {
    assert.equal(shouldGoBack(0, 5, width), false);
  });
});
