import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";

test("exports a navigable EPUB 3 publication with text, MP3, and media overlays", async () => {
  const { buildAudioEpub, audioEpubFileName } = await import(
    `../lib/audio-epub-export.ts?export=${Date.now()}`
  );
  const bytes = await buildAudioEpub({
    title: "Kapitän Mansana",
    language: "de",
    voice: "Nova",
    segments: [
      {
        id: "chapter-1-1",
        chapterId: "chapter-1",
        chapterTitle: "Kapitel 1",
        kind: "paragraph",
        spoken: "Der erste Abschnitt.",
        audio: new Uint8Array([0x49, 0x44, 0x33, 0x01]),
        durationSeconds: 2.5,
      },
      {
        id: "chapter-2-1",
        chapterId: "chapter-2",
        chapterTitle: "Kapitel 2",
        kind: "paragraph",
        spoken: "Der zweite Abschnitt.",
        audio: new Uint8Array([0x49, 0x44, 0x33, 0x02]),
        durationSeconds: 3.25,
      },
    ],
  });
  const zip = await JSZip.loadAsync(bytes);

  assert.equal(await zip.file("mimetype").async("text"), "application/epub+zip");
  assert.ok(zip.file("META-INF/container.xml"));
  assert.ok(zip.file("EPUB/nav.xhtml"));
  assert.ok(zip.file("EPUB/audio/segment-1.mp3"));
  assert.ok(zip.file("EPUB/audio/segment-2.mp3"));

  const packageDocument = await zip.file("EPUB/package.opf").async("text");
  assert.match(packageDocument, /media-overlay="overlay-1"/);
  assert.match(packageDocument, /application\/smil\+xml/);
  assert.match(packageDocument, /synchronizedAudioText/);
  assert.match(packageDocument, /00:00:05\.750/);

  const overlay = await zip.file("EPUB/overlays/chapter-1.smil").async("text");
  assert.match(overlay, /chapter-1\.xhtml#segment-1/);
  assert.match(overlay, /segment-1\.mp3/);
  assert.match(overlay, /clipEnd="2\.500s"/);

  assert.equal(audioEpubFileName("Kapitän Mansana"), "kapitan-mansana-hoermedium.epub");
});
