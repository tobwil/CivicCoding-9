import JSZip from "jszip";

export type ImportFormat = "epub" | "markdown" | "text";
export type ImportedBlockKind =
  | "heading"
  | "paragraph"
  | "list"
  | "table"
  | "caption";

export type ImportedBlock = {
  id: string;
  chapterId: string;
  chapterTitle: string;
  kind: ImportedBlockKind;
  text: string;
};

export type ImportedChapter = {
  id: string;
  title: string;
  blockCount: number;
};

export type BookImportResult = {
  format: ImportFormat;
  title: string;
  author?: string;
  language?: string;
  fileName?: string;
  blocks: ImportedBlock[];
  chapters: ImportedChapter[];
  truncated: boolean;
};

const MAX_EPUB_ENTRIES = 5_000;
const MAX_EXTRACTED_TEXT_BYTES = 8_000_000;
const BLOCK_SELECTOR = "h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,dt,dd,tr";

function normalizeText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function splitLongText(text: string) {
  if (text.length <= 650) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && `${current} ${sentence}`.length > 650) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function parseXml(source: string, type: DOMParserSupportedType) {
  const document = new DOMParser().parseFromString(source, type);
  if (document.querySelector("parsererror")) {
    throw new Error("Die EPUB-Struktur enthält ungültiges XML.");
  }
  return document;
}

function firstByLocalName(document: Document, name: string) {
  return allByLocalName(document, name)[0] ?? null;
}

function allByLocalName(document: Document, name: string) {
  const namespaced = Array.from(document.getElementsByTagNameNS("*", name));
  if (namespaced.length) return namespaced;
  return Array.from(document.querySelectorAll("*"))
    .filter((element) => (
      element.localName === name
      || element.localName.endsWith(`:${name}`)
      || element.tagName.endsWith(`:${name}`)
    ));
}

function dirname(filePath: string) {
  const index = filePath.lastIndexOf("/");
  return index === -1 ? "" : filePath.slice(0, index + 1);
}

function resolveArchivePath(baseDirectory: string, href: string) {
  const cleanHref = decodeURIComponent(href.split("#")[0]);
  const parts = `${baseDirectory}${cleanHref}`.split("/");
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  return resolved.join("/");
}

function inferKind(element: Element): ImportedBlockKind {
  const tag = element.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "li" || tag === "dt" || tag === "dd") return "list";
  if (tag === "tr") return "table";
  if (tag === "figcaption") return "caption";
  return "paragraph";
}

function elementText(element: Element) {
  if (element.tagName.toLowerCase() === "tr") {
    return Array.from(element.querySelectorAll("th,td"))
      .map((cell) => normalizeText(cell.textContent ?? ""))
      .filter(Boolean)
      .join(" | ");
  }
  return normalizeText(element.textContent ?? "");
}

function chapterBlocks(
  document: Document,
  chapterId: string,
  fallbackTitle: string,
) {
  document.querySelectorAll("script,style,noscript,template").forEach((element) => element.remove());
  const firstHeading = Array.from(document.querySelectorAll("h1,h2,h3"))
    .map((element) => normalizeText(element.textContent ?? ""))
    .find(Boolean);
  const chapterTitle = firstHeading ?? fallbackTitle;
  const blocks: ImportedBlock[] = [];

  for (const element of Array.from(document.querySelectorAll(BLOCK_SELECTOR))) {
    if (element.closest("[aria-hidden='true'],nav")) continue;
    if (element.matches("p") && element.closest("li,blockquote,figcaption,td,th")) continue;
    const text = elementText(element);
    if (!text || text.length < 2) continue;
    const kind = inferKind(element);
    for (const part of splitLongText(text)) {
      blocks.push({
        id: `${chapterId}-${blocks.length + 1}`,
        chapterId,
        chapterTitle,
        kind,
        text: part,
      });
    }
  }

  return { title: chapterTitle, blocks };
}

export function parseTextBook(
  source: string,
  title: string,
  format: ImportFormat = "text",
): BookImportResult {
  const lines = source.replace(/\r/g, "").split("\n");
  let chapterIndex = 1;
  let chapterId = "chapter-1";
  let chapterTitle = "Kapitel 1";
  let chapterBlockIndex = 0;
  let paragraphBuffer: string[] = [];
  const blocks: ImportedBlock[] = [];

  function flushParagraph() {
    const paragraph = normalizeText(paragraphBuffer.join(" "));
    paragraphBuffer = [];
    if (!paragraph) return;
    for (const part of splitLongText(paragraph)) {
      chapterBlockIndex += 1;
      blocks.push({
        id: `${chapterId}-${chapterBlockIndex}`,
        chapterId,
        chapterTitle,
        kind: "paragraph",
        text: part,
      });
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(/^(?:#{1,3}\s+)?(?:Kapitel|Chapter)\s+(.+)$/i)
      ?? line.match(/^#{1,2}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const hasContent = blocks.some((block) => block.chapterId === chapterId);
      if (hasContent || chapterIndex > 1) chapterIndex += 1;
      chapterId = `chapter-${chapterIndex}`;
      chapterTitle = line.replace(/^#{1,3}\s+/, "");
      chapterBlockIndex = 0;
      continue;
    }
    if (!line) {
      flushParagraph();
    } else {
      paragraphBuffer.push(line);
    }
  }
  flushParagraph();

  if (!blocks.length && source.trim()) {
    blocks.push({
      id: "chapter-1-1",
      chapterId: "chapter-1",
      chapterTitle: "Kapitel 1",
      kind: "paragraph",
      text: normalizeText(source),
    });
  }

  const chapterMap = new Map<string, ImportedChapter>();
  for (const block of blocks) {
    const existing = chapterMap.get(block.chapterId);
    if (existing) {
      existing.blockCount += 1;
    } else {
      chapterMap.set(block.chapterId, {
        id: block.chapterId,
        title: block.chapterTitle,
        blockCount: 1,
      });
    }
  }

  return {
    format,
    title: title.trim() || "Unbenanntes Buch",
    blocks,
    chapters: Array.from(chapterMap.values()),
    truncated: false,
  };
}

export async function parseEpub(file: File): Promise<BookImportResult> {
  if (file.size > 50_000_000) {
    throw new Error("Die EPUB-Datei ist größer als 50 MB.");
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error("Die Datei ist kein lesbares EPUB.");
  }

  const entries = Object.keys(zip.files);
  if (entries.length > MAX_EPUB_ENTRIES) {
    throw new Error("Das EPUB enthält ungewöhnlich viele Dateien und wurde nicht geöffnet.");
  }

  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) {
    throw new Error("Dem EPUB fehlt die Containerbeschreibung.");
  }

  const container = parseXml(await containerFile.async("text"), "application/xml");
  const rootPath = firstByLocalName(container, "rootfile")?.getAttribute("full-path");
  if (!rootPath) {
    throw new Error("Die EPUB-Inhaltsdatei konnte nicht gefunden werden.");
  }

  const packageFile = zip.file(rootPath);
  if (!packageFile) {
    throw new Error("Die EPUB-Inhaltsdatei fehlt.");
  }

  const packageDocument = parseXml(await packageFile.async("text"), "application/xml");
  const metadataTitle = normalizeText(firstByLocalName(packageDocument, "title")?.textContent ?? "");
  const author = normalizeText(firstByLocalName(packageDocument, "creator")?.textContent ?? "");
  const language = normalizeText(firstByLocalName(packageDocument, "language")?.textContent ?? "");
  const packageDirectory = dirname(rootPath);
  const manifest = new Map<string, { href: string; mediaType: string }>();

  for (const item of allByLocalName(packageDocument, "item")) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (!id || !href) continue;
    manifest.set(id, {
      href,
      mediaType: item.getAttribute("media-type") ?? "",
    });
  }

  const spineIds = allByLocalName(packageDocument, "itemref")
    .map((item) => item.getAttribute("idref"))
    .filter((id): id is string => Boolean(id));
  if (!spineIds.length) {
    throw new Error("Das EPUB enthält keine definierte Lesereihenfolge.");
  }

  const blocks: ImportedBlock[] = [];
  const chapters: ImportedChapter[] = [];
  let extractedBytes = 0;

  for (const id of spineIds) {
    const item = manifest.get(id);
    if (!item || !/xhtml|html/i.test(item.mediaType)) continue;
    const contentPath = resolveArchivePath(packageDirectory, item.href);
    const contentFile = zip.file(contentPath);
    if (!contentFile) continue;
    const source = await contentFile.async("text");
    extractedBytes += new TextEncoder().encode(source).byteLength;
    if (extractedBytes > MAX_EXTRACTED_TEXT_BYTES) {
      throw new Error("Der entpackte EPUB-Text ist größer als 8 MB.");
    }

    let document: Document;
    try {
      document = parseXml(source, "application/xhtml+xml");
    } catch {
      document = new DOMParser().parseFromString(source, "text/html");
    }
    const chapterId = `chapter-${chapters.length + 1}`;
    const fallbackTitle = `Kapitel ${chapters.length + 1}`;
    const parsed = chapterBlocks(document, chapterId, fallbackTitle);
    if (!parsed.blocks.length) continue;
    blocks.push(...parsed.blocks);
    chapters.push({
      id: chapterId,
      title: parsed.title,
      blockCount: parsed.blocks.length,
    });
  }

  if (!blocks.length) {
    throw new Error("Im EPUB wurde kein auswertbarer Buchtext gefunden.");
  }

  return {
    format: "epub",
    title: metadataTitle || file.name.replace(/\.epub$/i, ""),
    author: author || undefined,
    language: language || undefined,
    fileName: file.name,
    blocks,
    chapters,
    truncated: false,
  };
}
