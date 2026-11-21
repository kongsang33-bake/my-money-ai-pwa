import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { expireExits, initialExitSnap, keySig, mergeExitRows, nextExitSnap, nextExitStamp, type ExitSnap } from "./exiting-list.ts";

type Row = { id: string };
const key = (row: Row) => row.id;
const rows = (...ids: string[]) => ids.map((id) => ({ id }));
const shape = (list: { key: string; exiting: boolean }[]) => list.map((row) => `${row.key}${row.exiting ? "*" : ""}`);

describe("nextExitSnap", () => {
  it("does not update for a new array with the same keys (no render loop)", () => {
    assert.equal(nextExitSnap(initialExitSnap(rows("a", "b"), key), rows("a", "b"), key, 0), null);
  });

  it("keeps a deleted row as exiting, in its old place", () => {
    const next = nextExitSnap(initialExitSnap(rows("a", "b", "c"), key), rows("a", "c"), key, 0)!;
    assert.deepEqual(next.exiting.map((entry) => [entry.key, entry.index]), [["b", 1]]);
    assert.deepEqual(shape(mergeExitRows(rows("a", "c"), key, next.exiting)), ["a", "b*", "c"]);
  });

  it("does not fold the old list into a new scope, then folds a real delete within it", () => {
    const snap: ExitSnap<Row> = initialExitSnap(rows("a", "b"), key, "2026-10");
    const moved = nextExitSnap(snap, rows("x"), key, 0, undefined, "2026-11")!;
    assert.deepEqual(moved.exiting, []);
    assert.equal(moved.scope, "2026-11");
    assert.deepEqual(nextExitSnap(moved, [], key, 0, undefined, "2026-11")!.exiting.map((entry) => entry.key), ["x"]);
  });

  it("does not update when the scope and keys are the same", () => {
    assert.equal(nextExitSnap(initialExitSnap(rows("a"), key, "s"), rows("a"), key, 0, undefined, "s"), null);
  });

  it("drops more than three rows at once without folding", () => {
    assert.deepEqual(nextExitSnap(initialExitSnap(rows("a", "b", "c", "d", "e"), key), rows("a"), key, 0)!.exiting, []);
  });

  it("does not fold rows that were filtered out but still exist", () => {
    const next = nextExitSnap(initialExitSnap(rows("a", "b", "c"), key), rows("a"), key, 0, new Set(["a", "b", "c"]))!;
    assert.deepEqual(next.exiting, []);
  });

  it("folds a real delete while a filter is on", () => {
    const next = nextExitSnap(initialExitSnap(rows("a", "b"), key), rows("a"), key, 0, new Set(["a", "x"]))!;
    assert.deepEqual(next.exiting.map((entry) => entry.key), ["b"]);
  });

  it("stops exiting a row that comes back (undo), without drawing it twice", () => {
    const deleted = nextExitSnap(initialExitSnap(rows("a", "b"), key), rows("a"), key, 0)!;
    const undone = nextExitSnap(deleted, rows("a", "b"), key, 10)!;
    assert.deepEqual(undone.exiting, []);
    assert.deepEqual(shape(mergeExitRows(rows("a", "b"), key, deleted.exiting)), ["a", "b"]);
  });

  it("stops exiting a row that comes back by a cleared search before it finished", () => {
    // Search hides b (filtered, no fold), b is then deleted for real, then
    // the source has it again: it must not be stuck exiting.
    const source = new Set(["a", "b"]);
    const searched = nextExitSnap(initialExitSnap(rows("a", "b"), key), rows("a"), key, 0, source)!;
    assert.deepEqual(searched.exiting, []);
    const cleared = nextExitSnap(searched, rows("a", "b"), key, 5, source)!;
    assert.deepEqual(shape(mergeExitRows(cleared.items, key, cleared.exiting)), ["a", "b"]);
  });
});

describe("expireExits / nextExitStamp", () => {
  const exiting = [{ item: { id: "a" }, key: "a", index: 0, at: 1 }, { item: { id: "b" }, key: "b", index: 1, at: 2 }];
  it("drops the batch whose timer ran out and keeps a newer one", () => {
    assert.deepEqual(expireExits(exiting, 1).map((entry) => entry.key), ["b"]);
    assert.deepEqual(expireExits(exiting, 2), []);
  });
  it("stamps past the newest exit still running", () => {
    assert.equal(nextExitStamp(exiting), 3);
    assert.equal(nextExitStamp([]), 1);
  });
});

describe("keySig", () => {
  it("depends on order and keys only", () => {
    assert.equal(keySig(rows("a", "b"), key), keySig([{ id: "a" }, { id: "b" }], key));
    assert.notEqual(keySig(rows("a", "b"), key), keySig(rows("b", "a"), key));
  });
});
