import assert from "node:assert/strict";
import test from "node:test";

async function createWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

async function render() {
  const worker = await createWorker();
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
  assert.match(html, /<title>Braille QA Copilot · Buchprüfung<\/title>/i);
  assert.match(html, /Braille QA Copilot/);
  assert.match(html, /Nur noch .* Stellen brauchen Ihre Entscheidung/);
  assert.match(html, /Offene Stellen/);
  assert.match(html, /Diese Stelle braucht Ihre Entscheidung/);
  assert.match(html, /Buch wechseln/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("analyzes book segments safely without an API key", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        segments: [
          {
            id: "chapter-1-1",
            chapter: "Kapitel 1",
            original: "Die Strecke ist 12,5 km lang.",
            braille: "⠠⠙⠊⠑",
            backTranslation: "Die Strecke ist 125 km lang.",
          },
          {
            id: "chapter-1-2",
            chapter: "Kapitel 1",
            original: "Die nächste Ausgabe erscheint am Freitag.",
            braille: "⠠⠙⠊⠑",
            backTranslation: "Die nächste Ausgabe erscheint am Freitag.",
          },
        ],
      }),
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

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.mode, "local");
  assert.equal(result.findings.length, 2);
  assert.equal(result.findings[0].risk, "high");
  assert.equal(result.findings[0].autoRelease, false);
  assert.equal(result.findings[1].risk, "low");
  assert.equal(result.findings[1].autoRelease, true);
});
