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
