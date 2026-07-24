import assert from "node:assert/strict";
import test from "node:test";

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

test("renders the Braille QA workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="de"/i);
  assert.match(html, /<title>Braille QA Copilot · dzb lesen Pilot<\/title>/i);
  assert.match(html, /Braille QA Copilot/);
  assert.match(html, /Auffällige Stellen/);
  assert.match(html, /Original und Rückübersetzung vergleichen/);
  assert.match(html, /Artikel importieren/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});
