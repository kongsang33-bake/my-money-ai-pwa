import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);
const previewRoot = new URL("../app/_sites-preview/", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the app loading shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="th">/i);
  assert.match(html, /<title>เงินของฉัน — บันทึกรายรับรายจ่ายด้วย AI<\/title>/i);
  assert.match(html, /แอปบันทึกรายรับรายจ่ายที่ช่วยแยกรายการและจัดหมวดหมู่ด้วย AI/);
  assert.match(html, /<main class="shell">/);
  assert.match(html, /<section class="phone auth-screen">กำลังเตรียมบัญชี…<\/section>/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Codex is working|react-loading-skeleton/i);
});

test("keeps preview scaffolding out of the production app", async () => {
  const [page, layout, packageJson, files] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readdir(previewRoot).catch((error) => {
      if (error?.code === "ENOENT") return [];
      throw error;
    }),
  ]);

  assert.deepEqual(files.sort(), []);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(page, /codex-preview|_sites-preview|SkeletonPreview|react-loading-skeleton/i);
  assert.doesNotMatch(layout, /codex-preview|_sites-preview|SkeletonPreview|react-loading-skeleton/i);

  await assert.rejects(
    access(new URL("public/_sites-preview", templateRoot)),
  );
});
