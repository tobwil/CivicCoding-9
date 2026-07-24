import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { NextResponse } from "next/server";
import { z } from "zod";

const InputSchema = z.object({
  segments: z.array(z.object({
    id: z.string().min(1).max(120),
    chapter: z.string().min(1).max(240),
    original: z.string().max(2400),
    braille: z.string().max(5000),
    backTranslation: z.string().max(2400),
    hasReference: z.boolean().default(true),
    sourceMode: z.enum(["generated", "imported_braille"]).default("generated"),
    brailleProfile: z.enum(["de-g0", "en-ueb-g2", "en-gb-g2", "en-us-g2"]).default("de-g0"),
  })).min(1).max(24),
});

const FindingSchema = z.object({
  findings: z.array(z.object({
    id: z.string(),
    risk: z.enum(["high", "medium", "low"]),
    category: z.enum([
      "number_or_unit",
      "name_or_abbreviation",
      "punctuation_or_compound",
      "web_or_email",
      "semantic_difference",
      "structure",
      "none",
    ]),
    reason: z.string(),
    recommendation: z.string(),
    autoRelease: z.boolean(),
  })),
});

type Segment = z.infer<typeof InputSchema>["segments"][number];
type Finding = z.infer<typeof FindingSchema>["findings"][number];

function localFinding(segment: Segment): Finding {
  const text = segment.original;
  const observedText = `${segment.original} ${segment.backTranslation}`;
  const isWeb = /(https?:\/\/|www\.|[\w.-]+@[\w.-]+)/i.test(observedText);
  const hasNumber = /\d/.test(observedText);
  const hasAbbreviation = /\b(?:Dr|Prof|bzw|z\. ?B|u\. ?a)\./i.test(text);
  const hasHyphen = /[\p{L}]-[\p{L}]/u.test(text);
  const differs = segment.hasReference
    && segment.original.trim() !== segment.backTranslation.trim();

  if (isWeb) {
    return {
      id: segment.id,
      risk: "high",
      category: "web_or_email",
      reason: "Webadresse oder E-Mail-Adresse enthält bedeutungstragende Sonderzeichen.",
      recommendation: "Zeichenfolge vollständig mit der Vorlage vergleichen.",
      autoRelease: false,
    };
  }
  if (hasNumber) {
    return {
      id: segment.id,
      risk: "high",
      category: "number_or_unit",
      reason: "Zahl, Datum oder Maßeinheit erkannt.",
      recommendation: "Ziffern, Trennzeichen und Einheit manuell bestätigen.",
      autoRelease: false,
    };
  }
  if (segment.sourceMode === "imported_braille" && !segment.hasReference) {
    return {
      id: segment.id,
      risk: "medium",
      category: "structure",
      reason: "Ohne Schwarzschrift-Referenz kann die inhaltliche Vollständigkeit nicht automatisch bestätigt werden.",
      recommendation: "Rückübersetzung auf Plausibilität prüfen und nach Möglichkeit mit der Originalvorlage vergleichen.",
      autoRelease: false,
    };
  }
  if (differs) {
    return {
      id: segment.id,
      risk: "medium",
      category: "semantic_difference",
      reason: "Original und Rückübersetzung unterscheiden sich.",
      recommendation: "Abweichung im Kontext prüfen.",
      autoRelease: false,
    };
  }
  if (hasAbbreviation) {
    return {
      id: segment.id,
      risk: "medium",
      category: "name_or_abbreviation",
      reason: "Kontextabhängige Abkürzung erkannt.",
      recommendation: "Abkürzung und folgenden Eigennamen prüfen.",
      autoRelease: false,
    };
  }
  if (hasHyphen) {
    return {
      id: segment.id,
      risk: "medium",
      category: "punctuation_or_compound",
      reason: "Wortzusammensetzung mit Bindestrich erkannt.",
      recommendation: "Bindestrich und Wortgrenzen bestätigen.",
      autoRelease: false,
    };
  }
  return {
    id: segment.id,
    risk: "low",
    category: "none",
    reason: "Keine Auffälligkeit durch die lokale Vorprüfung erkannt.",
    recommendation: "Automatisch freigeben; stichprobenartig kontrollieren.",
    autoRelease: true,
  };
}

export async function POST(request: Request) {
  try {
    const parsed = InputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Die übermittelten Textabschnitte sind ungültig." },
        { status: 400 },
      );
    }

    const fallback = parsed.data.segments.map(localFinding);
    const sessionApiKey = request.headers.get("x-openai-api-key")?.trim();
    const apiKey = process.env.OPENAI_API_KEY || sessionApiKey;
    if (!apiKey) {
      return NextResponse.json({
        mode: "local",
        findings: fallback,
        notice: "Regelbasierte Prüfung aktiv. Für eine zusätzliche inhaltliche Prüfung ist noch kein API-Schlüssel hinterlegt.",
      });
    }

    const client = new OpenAI({ apiKey });
    const response = await client.responses.parse({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      store: false,
      reasoning: { effort: "low" },
      input: [
        {
          role: "system",
          content:
            "Du bist ein konservativer Qualitätssicherungs-Assistent für deutsche Braille-Produktion. " +
            "Bewerte jeden gelieferten Abschnitt anhand von Schwarzschrift-Referenz, Braille-Ausgabe und Rückübersetzung. " +
            "sourceMode=generated bedeutet, dass Braille aus dem Original erzeugt wurde; sourceMode=imported_braille " +
            "bedeutet, dass eine vorhandene Braille-Ausgabe geprüft wird. Bei hasReference=false darfst du nur " +
            "Plausibilität und Struktur beurteilen, niemals Vollständigkeit behaupten und autoRelease muss false sein. " +
            "brailleProfile kennzeichnet deutsche Basisschrift, UEB oder ältere britische beziehungsweise US-Grade-2-Regeln. " +
            "Braille übersetzt du nicht neu. Markiere Bedeutungsverlust, " +
            "Zahlen, Einheiten, Eigennamen, Abkürzungen, Webadressen, Interpunktion und strukturelle Risiken. " +
            "autoRelease darf nur true sein, wenn kein relevantes Risiko erkennbar ist. Gib für jede ID genau " +
            "einen Befund zurück und erfinde keine Textinhalte. Antworte auf Deutsch.",
        },
        {
          role: "user",
          content: JSON.stringify(parsed.data.segments),
        },
      ],
      text: {
        format: zodTextFormat(FindingSchema, "braille_qa_findings"),
      },
    });

    const aiFindings = response.output_parsed?.findings ?? [];
    const byId = new Map(aiFindings.map((finding) => [finding.id, finding]));
    const complete = parsed.data.segments.map((segment, index) => {
      const finding = byId.get(segment.id) ?? fallback[index];
      if (segment.sourceMode === "imported_braille" && !segment.hasReference) {
        return {
          ...finding,
          risk: finding.risk === "low" ? "medium" as const : finding.risk,
          autoRelease: false,
        };
      }
      return finding;
    });

    return NextResponse.json({
      mode: "openai",
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      findings: complete,
    });
  } catch (error) {
    console.error("Braille QA analysis failed", error);
    return NextResponse.json(
      { error: "Die Analyse konnte nicht abgeschlossen werden." },
      { status: 503 },
    );
  }
}
