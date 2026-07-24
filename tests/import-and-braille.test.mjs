import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DOMParser } from "linkedom";
import JSZip from "jszip";

globalThis.DOMParser = DOMParser;

test("reads EPUB metadata, spine order, chapters, and structured blocks", async () => {
  const { parseEpub } = await import(`../lib/book-import.ts?epub=${Date.now()}`);
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file("META-INF/container.xml", `<?xml version="1.0"?>
    <container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`);
  zip.file("OEBPS/content.opf", `<?xml version="1.0"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>EPUB-Praxistest</dc:title>
        <dc:creator>dzb lesen</dc:creator>
        <dc:language>de</dc:language>
      </metadata>
      <manifest>
        <item id="one" href="one.xhtml" media-type="application/xhtml+xml"/>
        <item id="two" href="two.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine><itemref idref="one"/><itemref idref="two"/></spine>
    </package>`);
  zip.file("OEBPS/one.xhtml", `<html xmlns="http://www.w3.org/1999/xhtml"><body>
    <h1>Kapitel 1 · Mobilität</h1><p>Die Strecke ist 12,5 km lang.</p>
  </body></html>`);
  zip.file("OEBPS/two.xhtml", `<html xmlns="http://www.w3.org/1999/xhtml"><body>
    <h1>Kapitel 2 · Ausblick</h1><ul><li>Barrierefreiheit bleibt das Ziel.</li></ul>
  </body></html>`);

  const file = await zip.generateAsync({ type: "nodebuffer" });
  Object.defineProperties(file, {
    name: { value: "test.epub" },
    size: { value: file.byteLength },
  });
  const result = await parseEpub(file);

  assert.equal(result.format, "epub");
  assert.equal(result.title, "EPUB-Praxistest");
  assert.equal(result.author, "dzb lesen");
  assert.equal(result.language, "de");
  assert.deepEqual(
    result.chapters.map((chapter) => chapter.title),
    ["Kapitel 1 · Mobilität", "Kapitel 2 · Ausblick"],
  );
  assert.deepEqual(
    result.blocks.map((block) => block.kind),
    ["heading", "paragraph", "heading", "list"],
  );
});

test("keeps TXT and Markdown as structured fallback imports", async () => {
  const { parseTextBook } = await import(`../lib/book-import.ts?text=${Date.now()}`);
  const result = parseTextBook(
    "# Kapitel 1 Start\n\nErster Absatz.\n\n# Kapitel 2 Ende\n\nZweiter Absatz.",
    "Fallback-Test",
    "markdown",
  );

  assert.equal(result.format, "markdown");
  assert.equal(result.title, "Fallback-Test");
  assert.equal(result.chapters.length, 2);
  assert.equal(result.blocks.length, 2);
});

test("translates and back-translates German text with Liblouis 3.38", async () => {
  const require = createRequire(import.meta.url);
  const build = require("liblouis-build");
  const { createLiblouisTranslator } = await import(
    `../lib/liblouis-core.ts?braille=${Date.now()}`
  );
  const names = [
    "countries.cti",
    "de-accents-detailed.cti",
    "de-chardefs6.cti",
    "de-eurobrl6.dis",
    "de-g0-core.uti",
    "de-g0-detailed.utb",
    "digits6DotsPlusDot6.uti",
    "latinLetterDef6Dots.uti",
    "litdigits6Dots.uti",
    "spaces.uti",
    "unicode.dis",
  ];
  const tableFiles = Object.fromEntries(await Promise.all(
    names.map(async (name) => [
      name,
      new Uint8Array(await readFile(
        new URL(`../node_modules/liblouis-build/tables/${name}`, import.meta.url),
      )),
    ]),
  ));
  const translator = createLiblouisTranslator(build, tableFiles);
  const original = "Dr. Müller fährt 12,5 km.";
  const braille = translator.translateToBraille(original);

  assert.equal(translator.info.version, "3.38.0");
  assert.match(braille, /[\u2800-\u28ff]/u);
  assert.equal(translator.backTranslateFromBraille(braille), original);
  assert.equal(translator.backTranslateFromBrf("#aj $ziegen"), "10 Ziegen");
});

test("imports Unicode Braille and pairs optional Schwarzschrift references", async () => {
  const { parseUnicodeBraille } = await import(
    `../lib/braille-import.ts?unicode=${Date.now()}`
  );
  const result = parseUnicodeBraille(
    "⠠⠑⠗⠎⠞⠑⠗ ⠠⠁⠃⠎⠁⠞⠵⠲\n\n⠠⠵⠺⠑⠊⠞⠑⠗ ⠠⠁⠃⠎⠁⠞⠵⠲",
    "Braille-Test",
    "Erster Absatz.\n\nZweiter Absatz.",
  );

  assert.equal(result.format, "unicode");
  assert.equal(result.segments.length, 2);
  assert.equal(result.referenceCount, 2);
  assert.equal(result.segments[1].reference, "Zweiter Absatz.");
});

test("imports PEF pages and BRF Braille ASCII", async () => {
  const { brfToUnicode, parseBrailleFile } = await import(
    `../lib/braille-import.ts?files=${Date.now()}`
  );
  const pef = `<?xml version="1.0" encoding="UTF-8"?>
    <pef xmlns="http://www.daisy.org/ns/2008/pef">
      <body><volume><section>
        <page><row>⠠⠎⠑⠊⠞⠑ ⠼⠁</row></page>
        <page><row>⠠⠎⠑⠊⠞⠑ ⠼⠃</row></page>
      </section></volume></body>
    </pef>`;
  const pefFile = {
    name: "buch.pef",
    size: pef.length,
    text: async () => pef,
  };
  const pefResult = await parseBrailleFile(pefFile);
  assert.equal(pefResult.format, "pef");
  assert.equal(pefResult.segments.length, 2);
  assert.match(pefResult.segments[0].braille, /[\u2800-\u28ff]/u);

  const brf = "#aj $ziegen\f$seite b";
  const brfFile = {
    name: "buch.brf",
    size: brf.length,
    text: async () => brf,
  };
  const brfResult = await parseBrailleFile(brfFile);
  assert.equal(brfResult.format, "brf");
  assert.equal(brfResult.segments.length, 2);
  assert.match(brfToUnicode(brfResult.segments[0].braille), /[\u2800-\u28ff]/u);
});
