import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isConnectionFailure, isDuplicateRowError, rowIdsForSave } from "./save.ts";

let counter = 0;
const nextId = () => `id-${++counter}`;

describe("rowIdsForSave", () => {
  it("draws one id per row for a first attempt", () => {
    const attempt = rowIdsForSave(null, "batch", 3, nextId);
    assert.equal(attempt.ids.length, 3);
    assert.equal(new Set(attempt.ids).size, 3);
  });

  it("reuses the ids when the same batch is retried", () => {
    // The whole point: a retry after a lost reply must send the same ids, so
    // a first attempt that did land is found rather than written again.
    const first = rowIdsForSave(null, "batch", 2, nextId);
    assert.deepEqual(rowIdsForSave(first, "batch", 2, nextId).ids, first.ids);
  });

  it("draws new ids once the batch has been edited", () => {
    const first = rowIdsForSave(null, "batch", 2, nextId);
    const edited = rowIdsForSave(first, "batch-edited", 2, nextId);
    assert.notDeepEqual(edited.ids, first.ids);
  });

  it("draws new ids when the same key expands to a different number of rows", () => {
    const first = rowIdsForSave(null, "batch", 2, nextId);
    assert.equal(rowIdsForSave(first, "batch", 3, nextId).ids.length, 3);
  });
});

describe("isDuplicateRowError", () => {
  it("recognises a unique violation and nothing else", () => {
    assert.equal(isDuplicateRowError({ code: "23505", message: "duplicate key value violates unique constraint \"transactions_pkey\"" }), true);
    assert.equal(isDuplicateRowError({ code: "42501", message: "permission denied" }), false);
    assert.equal(isDuplicateRowError(null), false);
  });
});

describe("isConnectionFailure", () => {
  it("treats anything while offline as a connection failure", () => {
    assert.equal(isConnectionFailure({ message: "whatever" }, false), true);
  });

  it("recognises a dropped fetch in each browser's wording", () => {
    for (const message of ["TypeError: Failed to fetch", "fetch failed", "Load failed", "NetworkError when attempting to fetch resource."]) {
      assert.equal(isConnectionFailure({ message }, true), true, message);
    }
  });

  it("recognises the app giving up on a slow request", () => {
    assert.equal(isConnectionFailure({ name: "AbortError", message: "signal is aborted without reason" }, true), true);
    assert.equal(isConnectionFailure({ message: "AbortError: The operation was aborted." }, true), true);
    assert.equal(isConnectionFailure({ name: "TimeoutError", message: "" }, true), true);
  });

  it("counts a request that never got an HTTP response", () => {
    assert.equal(isConnectionFailure({ code: "", message: "FetchError: something odd" }, true, 0), true);
  });

  it("leaves a real server refusal to speak for itself", () => {
    assert.equal(isConnectionFailure({ code: "23514", message: "new row violates check constraint" }, true, 400), false);
    assert.equal(isConnectionFailure(null, true), false);
  });
});
