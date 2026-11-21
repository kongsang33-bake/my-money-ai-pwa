import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadSucceeded, startupScreen } from "./startup.ts";

const base = { loadFailed: false, loadedForUser: true, dataLoading: false, accountIsEmpty: false, setupGateDismissed: false };

describe("startupScreen", () => {
  it("opens the app for an account with data", () => {
    assert.equal(startupScreen(base), "app");
  });

  it("offers setup only to an account that loaded and is really empty", () => {
    assert.equal(startupScreen({ ...base, accountIsEmpty: true }), "setup");
    assert.equal(startupScreen({ ...base, accountIsEmpty: true, setupGateDismissed: true }), "app");
  });

  it("never offers setup before the reads have finished", () => {
    assert.equal(startupScreen({ ...base, accountIsEmpty: true, dataLoading: true }), "app");
    assert.equal(startupScreen({ ...base, accountIsEmpty: true, loadedForUser: false }), "app");
  });

  it("holds a failed load at the failure screen, never at setup", () => {
    // Every collection is [] after a failed read -- exactly what an empty
    // account looks like -- which is the case this exists for.
    assert.equal(startupScreen({ ...base, loadFailed: true, accountIsEmpty: true, loadedForUser: false }), "load-failed");
    assert.equal(startupScreen({ ...base, loadFailed: true }), "load-failed");
  });

  it("keeps the failure screen up while a retry is loading", () => {
    assert.equal(startupScreen({ ...base, loadFailed: true, dataLoading: true }), "load-failed");
  });
});

describe("loadSucceeded", () => {
  it("needs every read to have succeeded", () => {
    assert.equal(loadSucceeded([true, true, true]), true);
    assert.equal(loadSucceeded([true, false, true]), false);
  });
});
