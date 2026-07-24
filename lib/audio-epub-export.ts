import JSZip from "jszip";
import type { ImportedBlockKind } from "@/lib/book-import";

export type AudioEpubSegment = {
  id: string;
  chapterId: string;
  chapterTitle: string;
  kind: ImportedBlockKind;
  spoken: string;
  audio: Uint8Array;
  durationSeconds?: number;
};

export type AudioEpubInput = {
  title: string;
  language?: string;
  voice: string;
  segments: AudioEpubSegment[];
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "hoermedium";
}

function clockValue(seconds: number) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remaining = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${remaining.toFixed(3).padStart(6, "0")}`;
}

export function audioEpubFileName(title: string) {
  return `${slugify(title)}-hoermedium.epub`;
}

export async function buildAudioEpub(input: AudioEpubInput) {
  if (!input.segments.length) {
    throw new Error("Für den Export sind keine Audioabschnitte vorhanden.");
  }

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  const chapters = new Map<string, {
    id: string;
    title: string;
    index: number;
    segments: Array<AudioEpubSegment & { index: number }>;
  }>();
  input.segments.forEach((segment, index) => {
    const existing = chapters.get(segment.chapterId);
    if (existing) {
      existing.segments.push({ ...segment, index });
    } else {
      chapters.set(segment.chapterId, {
        id: segment.chapterId,
        title: segment.chapterTitle,
        index: chapters.size,
        segments: [{ ...segment, index }],
      });
    }
  });
  const orderedChapters = Array.from(chapters.values());

  for (const chapter of orderedChapters) {
    const chapterNumber = chapter.index + 1;
    const content = chapter.segments.map((segment) => {
      const element = segment.kind === "heading" ? "h2" : "p";
      return `    <${element} id="segment-${segment.index + 1}">${escapeXml(segment.spoken)}</${element}>`;
    }).join("\n");
    zip.file(`EPUB/text/chapter-${chapterNumber}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="${escapeXml(input.language || "de")}" xml:lang="${escapeXml(input.language || "de")}">
  <head>
    <title>${escapeXml(chapter.title)}</title>
    <link rel="stylesheet" type="text/css" href="../styles/book.css"/>
  </head>
  <body>
    <h1>${escapeXml(chapter.title)}</h1>
${content}
  </body>
</html>`);

    const overlay = chapter.segments.map((segment) => {
      const clipEnd = segment.durationSeconds && Number.isFinite(segment.durationSeconds)
        ? ` clipBegin="0s" clipEnd="${segment.durationSeconds.toFixed(3)}s"`
        : "";
      return `    <par id="par-${segment.index + 1}">
      <text src="../text/chapter-${chapterNumber}.xhtml#segment-${segment.index + 1}"/>
      <audio src="../audio/segment-${segment.index + 1}.mp3"${clipEnd}/>
    </par>`;
    }).join("\n");
    zip.file(`EPUB/overlays/chapter-${chapterNumber}.smil`, `<?xml version="1.0" encoding="UTF-8"?>
<smil xmlns="http://www.w3.org/ns/SMIL" version="3.0" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
${overlay}
  </body>
</smil>`);
  }

  input.segments.forEach((segment, index) => {
    zip.file(`EPUB/audio/segment-${index + 1}.mp3`, segment.audio, {
      binary: true,
      compression: "STORE",
    });
  });

  zip.file("EPUB/nav.xhtml", `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(input.language || "de")}">
  <head><title>Inhaltsverzeichnis</title></head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Inhaltsverzeichnis</h1>
      <ol>
${orderedChapters.map((chapter) => `        <li><a href="text/chapter-${chapter.index + 1}.xhtml">${escapeXml(chapter.title)}</a></li>`).join("\n")}
      </ol>
    </nav>
  </body>
</html>`);

  zip.file("EPUB/styles/book.css", `body { font-family: sans-serif; line-height: 1.55; margin: 5%; }
h1 { font-size: 1.65em; }
h2 { font-size: 1.25em; margin-top: 1.5em; }
p { margin: 0.85em 0; }
.-epub-media-overlay-active { background: #e5f1eb; }
.-epub-media-overlay-playing { color: #0d4733; }`);

  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const identifier = `urn:lesewege:${slugify(input.title)}:${modified.replace(/[^0-9]/g, "")}`;
  const hasCompleteDuration = input.segments.every((segment) => (
    segment.durationSeconds !== undefined && Number.isFinite(segment.durationSeconds)
  ));
  const totalDuration = hasCompleteDuration
    ? input.segments.reduce((sum, segment) => sum + (segment.durationSeconds || 0), 0)
    : 0;
  const manifests = orderedChapters.flatMap((chapter) => {
    const number = chapter.index + 1;
    return [
      `    <item id="chapter-${number}" href="text/chapter-${number}.xhtml" media-type="application/xhtml+xml" media-overlay="overlay-${number}"/>`,
      `    <item id="overlay-${number}" href="overlays/chapter-${number}.smil" media-type="application/smil+xml"/>`,
    ];
  });
  input.segments.forEach((_, index) => {
    manifests.push(`    <item id="audio-${index + 1}" href="audio/segment-${index + 1}.mp3" media-type="audio/mpeg"/>`);
  });
  const overlayDurations = orderedChapters.map((chapter) => {
    if (!chapter.segments.every((segment) => (
      segment.durationSeconds !== undefined && Number.isFinite(segment.durationSeconds)
    ))) return "";
    const duration = chapter.segments.reduce((sum, segment) => sum + (segment.durationSeconds || 0), 0);
    return duration > 0
      ? `    <meta property="media:duration" refines="#overlay-${chapter.index + 1}">${clockValue(duration)}</meta>`
      : "";
  }).filter(Boolean);

  zip.file("EPUB/package.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" prefix="media: http://www.idpf.org/epub/vocab/overlays/# schema: http://schema.org/">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${escapeXml(identifier)}</dc:identifier>
    <dc:title>${escapeXml(input.title)}</dc:title>
    <dc:language>${escapeXml(input.language || "de")}</dc:language>
    <dc:creator>Lesewege · KI-Stimme ${escapeXml(input.voice)}</dc:creator>
    <meta property="dcterms:modified">${modified}</meta>
    <meta property="schema:accessMode">auditory</meta>
    <meta property="schema:accessMode">textual</meta>
    <meta property="schema:accessibilityFeature">synchronizedAudioText</meta>
    <meta property="schema:accessibilityFeature">tableOfContents</meta>
${totalDuration > 0 ? `    <meta property="media:duration">${clockValue(totalDuration)}</meta>` : ""}
${overlayDurations.join("\n")}
    <meta property="media:active-class">-epub-media-overlay-active</meta>
    <meta property="media:playback-active-class">-epub-media-overlay-playing</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="style" href="styles/book.css" media-type="text/css"/>
${manifests.join("\n")}
  </manifest>
  <spine>
${orderedChapters.map((chapter) => `    <itemref idref="chapter-${chapter.index + 1}"/>`).join("\n")}
  </spine>
</package>`);

  return zip.generateAsync({
    type: "uint8array",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
