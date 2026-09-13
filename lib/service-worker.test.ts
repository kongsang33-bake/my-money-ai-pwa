import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// public/sw.js is a classic service-worker script, not a module, so it cannot
// be imported -- it gets loaded into a vm with a fake Cache Storage instead.
//
// It is worth the harness because this is the file that broke quietly: its
// cache writes were floating promises the browser could kill, and its cache
// name was a constant a comment asked every deploy to bump by hand. Between
// them a device could hold an app shell and a stylesheet from an older build
// indefinitely, and a launch that missed the network came back in a palette
// that had been retired three deploys earlier. Nothing failed; it just looked
// wrong, on a phone, to one person.
const swSource = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

const ORIGIN = "https://monii.app";
const abs = (key: string | Request) => (typeof key === "string" ? new URL(key, ORIGIN).href : key.url);
const url = (path: string) => new Request(`${ORIGIN}${path}`);

// The one property of the real Cache API this has to reproduce is that match()
// returns a FRESH response every time. Holding the response object itself
// would let a single .text() poison every later read, which both hides real
// bugs and invents imaginary ones.
class FakeCache {
  store = new Map<string, string>();
  async put(key: string | Request, res: Response) { this.store.set(abs(key), await res.text()); }
  async match(key: string | Request) {
    const body = this.store.get(abs(key));
    return body === undefined ? undefined : new Response(body);
  }
  async keys() { return [...this.store.keys()].map((href) => new Request(href)); }
  async delete(key: string | Request) { return this.store.delete(abs(key)); }
  async add() {}
}

type ResponseShape = { ok: boolean; type: string; redirected: boolean };
type ServiceWorkerApi = {
  CACHE_NAME: string;
  staticAssetsIn: (html: string) => Set<string>;
  isCacheable: (response: ResponseShape) => boolean;
  reconcileShell: (forCache: Response, forRead: Response) => Promise<void>;
};

function loadServiceWorker() {
  const caches = {
    named: new Map<string, FakeCache>(),
    async open(name: string) {
      if (!this.named.has(name)) this.named.set(name, new FakeCache());
      return this.named.get(name) as FakeCache;
    },
    async keys() { return [...this.named.keys()]; },
    async delete(name: string) { return this.named.delete(name); },
  };
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: () => {},
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const context = vm.createContext({ self, caches, Response, Request, URL, Set, Map, Promise, console });
  vm.runInContext(swSource, context);
  const api = vm.runInContext(
    "({ CACHE_NAME, staticAssetsIn, isCacheable, reconcileShell })", context) as ServiceWorkerApi;
  return { api, caches };
}

// Both forms below are lifted from a real production shell: Next writes each
// stylesheet once as an ordinary href and again, backslash-escaped, inside the
// inlined flight payload.
const SHELL_BEFORE = '<link rel="stylesheet" href="/_next/static/chunks/OLD.css" data-precedence="next"/>'
  + '<script src="/_next/static/chunks/shared.js"></script>'
  + ':HL[\\"/_next/static/chunks/OLD.css\\",\\"style\\"]';
const SHELL_AFTER = SHELL_BEFORE.replaceAll("OLD.css", "NEW.css");

describe("static asset extraction", () => {
  const { api } = loadServiceWorker();

  it("reads a stylesheet out of both the markup and the escaped flight payload", () => {
    assert.deepEqual([...api.staticAssetsIn(SHELL_BEFORE)],
      ["/_next/static/chunks/OLD.css", "/_next/static/chunks/shared.js"]);
  });

  it("stops at the escape, so a quoted URL is not glued to its neighbour", () => {
    assert.deepEqual([...api.staticAssetsIn('\\"/_next/static/chunks/a.css\\"(/_next/static/chunks/b.js)')],
      ["/_next/static/chunks/a.css", "/_next/static/chunks/b.js"]);
  });

  it("drops a query string, so one asset cannot fork into two cache identities", () => {
    assert.deepEqual([...api.staticAssetsIn('"/_next/static/chunks/a.js?dpl=abc"')],
      ["/_next/static/chunks/a.js"]);
  });
});

describe("shell reconciliation", () => {
  it("evicts the assets a redeploy stopped referencing, and keeps the rest", async () => {
    const { api, caches } = loadServiceWorker();
    const cache = await caches.open(api.CACHE_NAME);
    await cache.put("/", new Response(SHELL_BEFORE));
    await cache.put(url("/_next/static/chunks/OLD.css"), new Response("--income-fill:#a8c04d"));
    await cache.put(url("/_next/static/chunks/shared.js"), new Response("shared"));
    await cache.put(url("/icons/icon-192.png"), new Response("icon"));

    await api.reconcileShell(new Response(SHELL_AFTER), new Response(SHELL_AFTER));

    assert.equal(await (await cache.match("/"))?.text(), SHELL_AFTER, "the shell itself must be rewritten");
    assert.equal(await cache.match(url("/_next/static/chunks/OLD.css")), undefined,
      "the retired stylesheet is what a stale launch was painting itself with");
    assert.ok(await cache.match(url("/_next/static/chunks/shared.js")), "an asset the new build still names stays");
    assert.ok(await cache.match(url("/icons/icon-192.png")), "assets outside the build are not collateral");
  });

  it("evicts nothing when the build has not changed", async () => {
    const { api, caches } = loadServiceWorker();
    const cache = await caches.open(api.CACHE_NAME);
    await cache.put("/", new Response(SHELL_AFTER));
    // Not in the shell's markup: chunks fetched on demand are cached as they
    // are used, and an unchanged build must not make every launch re-fetch them.
    await cache.put(url("/_next/static/chunks/lazy.js"), new Response("lazy"));

    await api.reconcileShell(new Response(SHELL_AFTER), new Response(SHELL_AFTER));

    assert.ok(await cache.match(url("/_next/static/chunks/lazy.js")), "a lazily-loaded chunk survives");
  });

  it("caches a first shell without anything to compare it against", async () => {
    const { api, caches } = loadServiceWorker();
    const cache = await caches.open(api.CACHE_NAME);

    await api.reconcileShell(new Response(SHELL_AFTER), new Response(SHELL_AFTER));

    assert.equal(await (await cache.match("/"))?.text(), SHELL_AFTER);
  });
});

describe("what may be stored", () => {
  const { api } = loadServiceWorker();

  it("stores a plain same-origin 200", () => {
    assert.equal(api.isCacheable({ ok: true, type: "basic", redirected: false }), true);
  });

  // Each of these, cached as the app shell, turns a passing outage into one
  // that outlives it.
  it("refuses an error, an opaque response and a redirect", () => {
    assert.equal(api.isCacheable({ ok: false, type: "basic", redirected: false }), false);
    assert.equal(api.isCacheable({ ok: true, type: "opaque", redirected: false }), false);
    assert.equal(api.isCacheable({ ok: true, type: "basic", redirected: true }), false);
  });
});
