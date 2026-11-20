import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recurringLogKey } from "./in-flight.ts";

describe("recurringLogKey", () => {
  it("is the same for the same bill on the same day, whatever the time", () => {
    assert.equal(recurringLogKey("a", new Date(2026, 10, 5, 0, 1)), recurringLogKey("a", new Date(2026, 10, 5, 23, 59)));
  });

  it("differs between bills and between billing days", () => {
    const day = new Date(2026, 10, 5);
    assert.notEqual(recurringLogKey("a", day), recurringLogKey("b", day));
    assert.notEqual(recurringLogKey("a", day), recurringLogKey("a", new Date(2026, 11, 5)));
  });
});
