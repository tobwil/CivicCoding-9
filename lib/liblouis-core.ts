export type LiblouisBuild = {
  FS: {
    mkdir(path: string): void;
    createDataFile(
      parent: string,
      name: string,
      data: Uint8Array,
      canRead: boolean,
      canWrite: boolean,
    ): void;
  };
  HEAPU32: Uint32Array;
  _free(pointer: number): void;
  _malloc(size: number): number;
  ccall(
    functionName: string,
    returnType: string,
    argumentTypes?: string[],
    argumentsList?: Array<string | number>,
  ): string | number;
  getValue(pointer: number, type: string): number;
  setValue(pointer: number, value: number, type: string): void;
  stringToUTF32(value: string, pointer: number, maxBytes: number): void;
};

export type BrailleProfile = "de-g0" | "en-ueb-g2" | "en-gb-g2" | "en-us-g2";

const TABLE_DIRECTORY = "/braille-tables";
const UNICODE_TABLE_NAME = `${TABLE_DIRECTORY}/unicode.dis,${TABLE_DIRECTORY}/de-g0-detailed.utb`;
const BRF_TABLE_NAMES: Record<BrailleProfile, string> = {
  "de-g0": `${TABLE_DIRECTORY}/de-eurobrl6.dis,${TABLE_DIRECTORY}/de-g0-detailed.utb`,
  "en-ueb-g2": `${TABLE_DIRECTORY}/en-us-brf.dis,${TABLE_DIRECTORY}/en-ueb-g2.ctb`,
  "en-gb-g2": `${TABLE_DIRECTORY}/en-us-brf.dis,${TABLE_DIRECTORY}/en-GB-g2.ctb`,
  "en-us-g2": `${TABLE_DIRECTORY}/en-us-brf.dis,${TABLE_DIRECTORY}/en-us-g2.ctb`,
};

function codePointsToString(codePoints: Uint32Array) {
  let result = "";
  for (const codePoint of codePoints) {
    result += String.fromCodePoint(codePoint);
  }
  return result;
}

export function createLiblouisTranslator(
  build: LiblouisBuild,
  tableFiles: Record<string, string | Uint8Array>,
) {
  try {
    build.FS.mkdir(TABLE_DIRECTORY);
  } catch {
    // Directory already exists when hot reload initializes the module again.
  }
  const encoder = new TextEncoder();
  for (const [name, source] of Object.entries(tableFiles)) {
    try {
      build.FS.createDataFile(
        TABLE_DIRECTORY,
        name,
        typeof source === "string" ? encoder.encode(source) : source,
        true,
        false,
      );
    } catch {
      // File already exists.
    }
  }

  const unicodeValid = build.ccall("lou_checkTable", "number", ["string"], [UNICODE_TABLE_NAME]);
  const germanBrfValid = build.ccall("lou_checkTable", "number", ["string"], [BRF_TABLE_NAMES["de-g0"]]);
  const englishBrfValid = (["en-ueb-g2", "en-gb-g2", "en-us-g2"] as const)
    .every((profile) => (
      build.ccall("lou_checkTable", "number", ["string"], [BRF_TABLE_NAMES[profile]]) === 1
    ));
  if (unicodeValid !== 1 || germanBrfValid !== 1 || !englishBrfValid) {
    throw new Error("Die deutsche Liblouis-Tabelle konnte nicht geladen werden.");
  }

  function translate(
    text: string,
    backTranslate: boolean,
    tableName = UNICODE_TABLE_NAME,
    mode = 0,
  ) {
    if (!text) return "";
    const inputLength = Array.from(text).length;
    const inputPointer = build._malloc((inputLength + 1) * 4);
    const inputLengthPointer = build._malloc(4);
    const outputCapacity = Math.max(inputLength * 8 + 64, 256);
    const outputPointer = build._malloc((outputCapacity + 1) * 4);
    const outputLengthPointer = build._malloc(4);

    try {
      build.stringToUTF32(text, inputPointer, (inputLength + 1) * 4);
      build.setValue(inputLengthPointer, inputLength, "i32");
      build.setValue(outputLengthPointer, outputCapacity, "i32");
      const success = build.ccall(
        backTranslate ? "lou_backTranslateString" : "lou_translateString",
        "number",
        ["string", "number", "number", "number", "number", "number", "number", "number"],
        [
          tableName,
          inputPointer,
          inputLengthPointer,
          outputPointer,
          outputLengthPointer,
          mode,
          0,
          0,
        ],
      );
      if (success !== 1) {
        throw new Error("Liblouis konnte den Abschnitt nicht übersetzen.");
      }
      const outputLength = build.getValue(outputLengthPointer, "i32");
      const start = outputPointer >>> 2;
      return codePointsToString(build.HEAPU32.slice(start, start + outputLength));
    } finally {
      build._free(inputPointer);
      build._free(inputLengthPointer);
      build._free(outputPointer);
      build._free(outputLengthPointer);
    }
  }

  const version = String(build.ccall("lou_version", "string"));
  return {
    translateToBraille: (text: string) => translate(text, false),
    backTranslateFromBraille: (braille: string) => translate(braille, true),
    backTranslateFromBrf: (braille: string, profile: BrailleProfile = "de-g0") => {
      if (profile !== "de-g0") {
        return braille
          .replace(/\r/g, "")
          .split("\n")
          .map((line) => translate(line, true, BRF_TABLE_NAMES[profile]))
          .join("\n");
      }
      return translate(braille, true, BRF_TABLE_NAMES[profile]);
    },
    info: {
      version,
      table: "de-g0-detailed.utb",
      label: `Liblouis ${version} · Deutsche Basisschrift (detailliert)`,
    },
  };
}
