import countriesTable from "liblouis-build/tables/countries.cti?raw";
import accentsTable from "liblouis-build/tables/de-accents-detailed.cti?raw";
import charDefsTable from "liblouis-build/tables/de-chardefs6.cti?raw";
import displayTable from "liblouis-build/tables/de-eurobrl6.dis?raw";
import coreTable from "liblouis-build/tables/de-g0-core.uti?raw";
import germanTable from "liblouis-build/tables/de-g0-detailed.utb?raw";
import digitsTable from "liblouis-build/tables/digits6DotsPlusDot6.uti?raw";
import latinTable from "liblouis-build/tables/latinLetterDef6Dots.uti?raw";
import literalDigitsTable from "liblouis-build/tables/litdigits6Dots.uti?raw";
import spacesTable from "liblouis-build/tables/spaces.uti?raw";
import unicodeDisplayTable from "liblouis-build/tables/unicode.dis?raw";
import braillePatternsTable from "liblouis-build/tables/braille-patterns.cti?raw";
import englishUebCharsTable from "liblouis-build/tables/en-ueb-chardefs.uti?raw";
import englishUebGrade1Table from "liblouis-build/tables/en-ueb-g1.ctb?raw";
import englishUebGrade2Table from "liblouis-build/tables/en-ueb-g2.ctb?raw";
import englishUebMathTable from "liblouis-build/tables/en-ueb-math.ctb?raw";
import latinUppercaseTable from "liblouis-build/tables/latinUppercaseComp6.uti?raw";
import nabccDisplayTable from "liblouis-build/tables/text_nabcc.dis?raw";
import englishBritishGrade1Table from "liblouis-build/tables/en-gb-g1.utb?raw";
import englishBritishGrade2Table from "liblouis-build/tables/en-GB-g2.ctb?raw";
import englishCharsTable from "liblouis-build/tables/en-chardefs.cti?raw";
import englishUsCompTable from "liblouis-build/tables/en-us-compbrl.uti?raw";
import englishUsEmphasisTable from "liblouis-build/tables/en-us-emphasis.uti?raw";
import englishUsGrade1Table from "liblouis-build/tables/en-us-g1.ctb?raw";
import englishUsGrade2Table from "liblouis-build/tables/en-us-g2.ctb?raw";
import loweredDigitsTable from "liblouis-build/tables/loweredDigits6Dots.uti?raw";
import ukCharsTable from "liblouis-build/tables/ukchardefs.cti?raw";
import brfDisplayTable from "liblouis-build/tables/en-us-brf.dis?raw";
import {
  createLiblouisTranslator,
  LiblouisBuild,
} from "@/lib/liblouis-core";
const tableFiles: Record<string, string> = {
  "countries.cti": countriesTable,
  "de-accents-detailed.cti": accentsTable,
  "de-chardefs6.cti": charDefsTable,
  "de-eurobrl6.dis": displayTable,
  "de-g0-core.uti": coreTable,
  "de-g0-detailed.utb": germanTable,
  "digits6DotsPlusDot6.uti": digitsTable,
  "latinLetterDef6Dots.uti": latinTable,
  "litdigits6Dots.uti": literalDigitsTable,
  "spaces.uti": spacesTable,
  "unicode.dis": unicodeDisplayTable,
  "braille-patterns.cti": braillePatternsTable,
  "en-ueb-chardefs.uti": englishUebCharsTable,
  "en-ueb-g1.ctb": englishUebGrade1Table,
  "en-ueb-g2.ctb": englishUebGrade2Table,
  "en-ueb-math.ctb": englishUebMathTable,
  "latinUppercaseComp6.uti": latinUppercaseTable,
  "text_nabcc.dis": nabccDisplayTable,
  "en-gb-g1.utb": englishBritishGrade1Table,
  "en-GB-g2.ctb": englishBritishGrade2Table,
  "en-chardefs.cti": englishCharsTable,
  "en-us-compbrl.uti": englishUsCompTable,
  "en-us-emphasis.uti": englishUsEmphasisTable,
  "en-us-g1.ctb": englishUsGrade1Table,
  "en-us-g2.ctb": englishUsGrade2Table,
  "loweredDigits6Dots.uti": loweredDigitsTable,
  "ukchardefs.cti": ukCharsTable,
  "en-us-brf.dis": brfDisplayTable,
};

let build: LiblouisBuild | null = null;
let loading: Promise<LiblouisBuild> | null = null;
let translator: ReturnType<typeof createLiblouisTranslator> | null = null;

declare global {
  interface Window {
    liblouisBuild?: LiblouisBuild;
  }
}

async function loadBuild() {
  if (build) return build;
  if (loading) return loading;
  loading = new Promise<LiblouisBuild>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-liblouis-build]");
    const finish = () => {
      if (window.liblouisBuild?.ccall) {
        build = window.liblouisBuild;
        resolve(build);
      } else {
        reject(new Error("Liblouis wurde geladen, konnte aber nicht gestartet werden."));
      }
    };
    if (window.liblouisBuild?.ccall) {
      finish();
      return;
    }
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Liblouis konnte nicht geladen werden.")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "/liblouis/build-no-tables-utf32.js";
    script.async = true;
    script.dataset.liblouisBuild = "true";
    script.addEventListener("load", finish, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Liblouis konnte nicht geladen werden.")),
      { once: true },
    );
    document.head.append(script);
  });
  return loading;
}

export async function loadLiblouis() {
  if (translator) return translator;
  translator = createLiblouisTranslator(await loadBuild(), tableFiles);
  return translator;
}
