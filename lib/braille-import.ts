import type { BrailleProfile } from "@/lib/liblouis-core";

export type BrailleImportFormat = "pef" | "brf" | "unicode";
export type BrailleSourceEncoding = "unicode" | "brf";
export type BrailleProfileChoice = BrailleProfile | "auto";

export type ImportedBrailleSegment = {
  id: string;
  chapterId: string;
  chapterTitle: string;
  braille: string;
  sourceEncoding: BrailleSourceEncoding;
  profile: BrailleProfile;
  reference?: string;
};

export type ImportedBrailleChapter = {
  id: string;
  title: string;
  blockCount: number;
};

export type BrailleImportResult = {
  format: BrailleImportFormat;
  title: string;
  fileName?: string;
  segments: ImportedBrailleSegment[];
  chapters: ImportedBrailleChapter[];
  referenceCount: number;
  profile: BrailleProfile;
  truncated: boolean;
};

const BRAILLE_ASCII_BY_PATTERN =
  " A1B'K2L@CIF/MSP\"E3H9O6R^DJG>NTQ,*5<-.U8V%[$+X!&;:4\\0Z7(_?W]#Y)=";

function normalizeReference(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function referenceBlocks(source: string) {
  return source
    .replace(/\r/g, "")
    .split(/\n\s*\n+/)
    .map((block) => normalizeReference(block))
    .filter(Boolean);
}

function unicodeBrailleBlocks(source: string) {
  return source
    .replace(/\r/g, "")
    .split(/\f|\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function brfPages(source: string) {
  return source
    .replace(/\r/g, "")
    .split(/\f/)
    .flatMap((page) => {
      const clean = page
        .split("\n")
        .map((line) => line.replace(/\s+$/g, ""))
        .join("\n")
        .trim();
      return clean ? [clean] : [];
    });
}

function makeResult(
  format: BrailleImportFormat,
  title: string,
  sourceBlocks: Array<{
    chapterId: string;
    chapterTitle: string;
    braille: string;
    sourceEncoding: BrailleSourceEncoding;
    profile: BrailleProfile;
  }>,
  referenceText = "",
  fileName?: string,
): BrailleImportResult {
  const references = referenceBlocks(referenceText);
  const segments = sourceBlocks.map((block, index) => ({
    ...block,
    id: `${block.chapterId}-${index + 1}`,
    reference: references[index],
  }));
  const chapterMap = new Map<string, ImportedBrailleChapter>();
  for (const segment of segments) {
    const chapter = chapterMap.get(segment.chapterId);
    if (chapter) {
      chapter.blockCount += 1;
    } else {
      chapterMap.set(segment.chapterId, {
        id: segment.chapterId,
        title: segment.chapterTitle,
        blockCount: 1,
      });
    }
  }
  return {
    format,
    title: title.trim() || "Unbenanntes Braille-Dokument",
    fileName,
    segments,
    chapters: Array.from(chapterMap.values()),
    referenceCount: segments.filter((segment) => Boolean(segment.reference)).length,
    profile: segments[0]?.profile ?? "de-g0",
    truncated: false,
  };
}

export function brfToUnicode(source: string) {
  const patternByAscii = new Map<string, number>();
  Array.from(BRAILLE_ASCII_BY_PATTERN).forEach((character, pattern) => {
    patternByAscii.set(character, pattern);
  });
  return Array.from(source).map((character) => {
    if (character === "\n" || character === "\r" || character === "\f") return character;
    const pattern = patternByAscii.get(character.toUpperCase());
    return pattern === undefined ? "⣿" : String.fromCodePoint(0x2800 + pattern);
  }).join("");
}

export function parseUnicodeBraille(
  source: string,
  title: string,
  referenceText = "",
): BrailleImportResult {
  if (!/[\u2800-\u28ff]/u.test(source)) {
    throw new Error("Es wurde kein Unicode-Braille erkannt. Braille-ASCII bitte als BRF-Datei importieren.");
  }
  const blocks = unicodeBrailleBlocks(source);
  return makeResult(
    "unicode",
    title,
    blocks.map((braille) => ({
      chapterId: "braille-document",
      chapterTitle: "Braille-Dokument",
      braille,
      sourceEncoding: "unicode",
      profile: "de-g0",
    })),
    referenceText,
  );
}

function parsePef(source: string, title: string, referenceText: string, fileName: string) {
  const document = new DOMParser().parseFromString(source, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("Die PEF-Datei enthält ungültiges XML.");
  }
  const rows = Array.from(document.getElementsByTagNameNS("*", "row"));
  if (!rows.length) {
    throw new Error("Die PEF-Datei enthält keine Braille-Zeilen.");
  }
  const volumes = Array.from(document.getElementsByTagNameNS("*", "volume"));
  const sourceBlocks: Array<{
    chapterId: string;
    chapterTitle: string;
    braille: string;
    sourceEncoding: BrailleSourceEncoding;
  }> = [];

  const volumeNodes = volumes.length ? volumes : [document.documentElement];
  volumeNodes.forEach((volume, volumeIndex) => {
    const pages = Array.from(volume.getElementsByTagNameNS("*", "page"));
    const pageNodes = pages.length ? pages : [volume];
    pageNodes.forEach((page) => {
      const pageRows = Array.from(page.getElementsByTagNameNS("*", "row"))
        .map((row) => row.textContent?.replace(/\s+$/g, "") ?? "")
        .filter(Boolean);
      if (!pageRows.length) return;
      sourceBlocks.push({
        chapterId: `volume-${volumeIndex + 1}`,
        chapterTitle: volumes.length > 1 ? `Band ${volumeIndex + 1}` : "Braille-Dokument",
        braille: pageRows.join("\n"),
        sourceEncoding: "unicode",
        profile: "de-g0",
      });
    });
  });

  return makeResult("pef", title, sourceBlocks, referenceText, fileName);
}

export async function parseBrailleFile(
  file: File,
  referenceText = "",
  profileChoice: BrailleProfileChoice = "auto",
): Promise<BrailleImportResult> {
  if (file.size > 50_000_000) {
    throw new Error("Die Braille-Datei ist größer als 50 MB.");
  }
  const source = await file.text();
  const title = file.name.replace(/\.(pef|brf|txt)$/i, "") || "Braille-Dokument";
  if (/\.pef$/i.test(file.name)) {
    return parsePef(source, title, referenceText, file.name);
  }
  if (/\.brf$/i.test(file.name)) {
    const pages = brfPages(source);
    if (!pages.length) throw new Error("Die BRF-Datei enthält keine Braille-Daten.");
    const profile = profileChoice === "auto" ? detectBrfProfile(source) : profileChoice;
    return makeResult(
      "brf",
      title,
      pages.map((braille) => ({
        chapterId: "braille-document",
        chapterTitle: "Braille-Dokument",
        braille,
        sourceEncoding: "brf",
        profile,
      })),
      referenceText,
      file.name,
    );
  }
  const result = parseUnicodeBraille(source, title, referenceText);
  result.fileName = file.name;
  return result;
}

export function detectBrfProfile(source: string): BrailleProfile {
  const englishCapitalIndicators = source.match(/,[A-Z]/g)?.length ?? 0;
  const germanCapitalIndicators = source.match(/\$[A-Z]/g)?.length ?? 0;
  const englishContractions = source.match(/(?:^|\s)[!&=)(](?=\s|[.,;?!])/gm)?.length ?? 0;
  return englishCapitalIndicators + englishContractions > germanCapitalIndicators * 2 + 1
    ? "en-us-g2"
    : "de-g0";
}
