// What makes "save" safe to retry, and honest about why it failed.
//
// A save that times out or loses its connection mid-request is ambiguous: the
// insert may never have reached the server, or it may have landed and only
// the reply was lost. Saying "saved" in either case would be a lie the user
// cannot see, so the app says "not saved" and offers a retry -- which is only
// safe if retrying cannot write the same entries a second time. It cannot,
// because the rows carry ids chosen here, not by the database: a retry of
// the same batch sends the same ids, and if the first attempt did land, the
// retry fails as a duplicate key and the app reads back the rows that are
// already there instead.

export type SaveAttempt = { key: string; ids: string[] };

type SupabaseLikeError = { code?: string | null; message?: string | null; name?: string | null };

/**
 * The row ids for a save of the batch identified by `key` (its content, so a
 * retry from a form that rebuilds its drafts still counts as the same batch).
 * Reuses the previous attempt's ids when it was the same batch of the same
 * size, and draws fresh ones otherwise -- an edited batch is a new save.
 */
export function rowIdsForSave(
  previous: SaveAttempt | null,
  key: string,
  count: number,
  makeId: () => string = () => crypto.randomUUID(),
): SaveAttempt {
  if (previous && previous.key === key && previous.ids.length === count) return previous;
  return { key, ids: Array.from({ length: count }, () => makeId()) };
}

/** Postgres unique_violation: on a retried save, the rows are already there. */
export function isDuplicateRowError(error: SupabaseLikeError | null | undefined): boolean {
  return error?.code === "23505";
}

/**
 * True when the save failed without the server ever answering -- offline,
 * the connection dropped, or the app gave up waiting. These are the failures
 * where nothing the server said is worth showing, and where "try again" is
 * the whole answer. A real server refusal (a constraint, a permission) has a
 * Postgres code and a message of its own, and is reported as that instead.
 */
export function isConnectionFailure(error: SupabaseLikeError | null | undefined, online: boolean, status?: number): boolean {
  if (!error) return false;
  if (!online) return true;
  // supabase-js reports a request that never got an HTTP response -- a
  // dropped fetch, or one the app aborted -- as status 0 with an empty code.
  if (status === 0) return true;
  if (error.name === "AbortError" || error.name === "TimeoutError") return true;
  return /failed to fetch|fetch failed|network|load failed|abort|timed? ?out/i.test(error.message ?? "");
}
