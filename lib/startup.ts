// What a signed-in, unlocked user sees once their data has been asked for.
//
// "This account is empty" is a claim about the database, and it can only be
// made after every read came back. A read that failed leaves its collection
// at the initial [] -- indistinguishable, on screen, from an account that
// really has nothing -- and treating that as empty sent an existing user into
// the first-run setup flow (and a Home of zeros inviting them to add a wallet
// that already exists) whenever the app opened offline or Supabase blinked.
// So a failed load wins over everything else: nothing is offered that would
// write on top of data the app has not seen.

export type StartupScreen = "load-failed" | "setup" | "app";

export function startupScreen(state: {
  /** Any of the account's reads failed on the last full load. */
  loadFailed: boolean;
  /** Every read finished for this user (loadedUserIdRef === the user). */
  loadedForUser: boolean;
  dataLoading: boolean;
  accountIsEmpty: boolean;
  setupGateDismissed: boolean;
}): StartupScreen {
  if (state.loadFailed) return "load-failed";
  if (state.dataLoading || !state.loadedForUser) return "app";
  if (state.accountIsEmpty && !state.setupGateDismissed) return "setup";
  return "app";
}

/** A full load counts only when every read in it succeeded. */
export function loadSucceeded(results: readonly boolean[]) {
  return results.every(Boolean);
}
