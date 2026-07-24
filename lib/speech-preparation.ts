import type { ImportedBlock } from "@/lib/book-import";

export type SpeechSegment = {
  id: string;
  chapterId: string;
  chapterTitle: string;
  kind: ImportedBlock["kind"];
  original: string;
  spoken: string;
};

const replacements: Array<[RegExp, string]> = [
  [/\bz\.\s*B\./gi, "zum Beispiel"],
  [/\bu\.\s*a\./gi, "unter anderem"],
  [/\bbzw\./gi, "beziehungsweise"],
  [/\bDr\.\s+/g, "Doktor "],
  [/\bProf\.\s+/g, "Professor "],
  [/\bca\.\s+/gi, "circa "],
  [/\bkm²/gi, "Quadratkilometer"],
  [/\bcm²/gi, "Quadratzentimeter"],
  [/\bm²/gi, "Quadratmeter"],
  [/\bkm\/h\b/gi, "Kilometer pro Stunde"],
  [/\bkg\b/gi, "Kilogramm"],
  [/\bkm\b/gi, "Kilometer"],
  [/\bcm\b/gi, "Zentimeter"],
  [/\bmm\b/gi, "Millimeter"],
  [/\s*%/g, " Prozent"],
  [/(\d),(\d)/g, "$1 Komma $2"],
  [/&/g, " und "],
];

export function prepareSpokenText(source: string) {
  let text = source
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, " – ")
    .replace(/\s+/g, " ")
    .trim();

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  return text
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function createSpeechSegments(blocks: ImportedBlock[]): SpeechSegment[] {
  return blocks.map((block) => ({
    id: block.id,
    chapterId: block.chapterId,
    chapterTitle: block.chapterTitle,
    kind: block.kind,
    original: block.text,
    spoken: prepareSpokenText(block.text),
  }));
}
