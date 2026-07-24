"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  BookImportResult,
  ImportedBlock,
  parseEpub,
  parseTextBook,
} from "@/lib/book-import";
import {
  BrailleImportResult,
  BrailleProfileChoice,
  brfToUnicode,
  parseBrailleFile,
  parseUnicodeBraille,
} from "@/lib/braille-import";

type Risk = "high" | "medium" | "low";
type ReviewState = "open" | "auto_approved" | "confirmed" | "corrected" | "dismissed";
type AnalysisMode = "local" | "openai";
type ApiStatus = "checking" | "server" | "session" | "missing";
type ReviewMode = "print_to_braille" | "braille_review";
type ImportMode = "print" | "braille";
type DocumentView = "parallel" | "original" | "braille" | "back";
type ImportPreview =
  | { mode: "print"; result: BookImportResult }
  | { mode: "braille"; result: BrailleImportResult };

type ReviewItem = {
  id: string;
  chapterId: string;
  chapterTitle: string;
  original: string;
  backTranslation: string;
  braille: string;
  risk: Risk;
  category: string;
  reason: string;
  recommendation: string;
  state: ReviewState;
  hasReference: boolean;
  sourceMode: "generated" | "imported_braille";
  brailleProfile: "de-g0" | "en-ueb-g2" | "en-gb-g2" | "en-us-g2";
};

type ApiFinding = {
  id: string;
  risk: Risk;
  category: string;
  reason: string;
  recommendation: string;
  autoRelease: boolean;
};

const stateLabel: Record<ReviewState, string> = {
  open: "Entscheidung nötig",
  auto_approved: "Automatisch geprüft",
  confirmed: "Bestätigt",
  corrected: "Korrigiert",
  dismissed: "Fehlalarm",
};

const riskLabel: Record<Risk, string> = {
  high: "Kritisch",
  medium: "Bitte prüfen",
  low: "Unauffällig",
};

const modeLabel: Record<AnalysisMode, string> = {
  local: "Lokale Regelprüfung",
  openai: "OpenAI + Regelprüfung",
};

const importFormatLabel: Record<BookImportResult["format"], string> = {
  epub: "EPUB 3",
  markdown: "Markdown",
  text: "TXT",
};

const brailleFormatLabel: Record<BrailleImportResult["format"], string> = {
  pef: "PEF",
  brf: "BRF",
  unicode: "Unicode-Braille",
};

const brailleProfileLabel = {
  "de-g0": "Deutsch · Basisschrift",
  "en-ueb-g2": "Englisch · UEB Grade 2",
  "en-gb-g2": "Englisch · British Grade 2",
  "en-us-g2": "Englisch · US Grade 2",
} as const;

async function createLiblouisItems(
  blocks: ImportedBlock[],
  onProgress: (value: number) => void,
) {
  const { loadLiblouis } = await import("@/lib/liblouis-client");
  const {
    backTranslateFromBraille,
    info,
    translateToBraille,
  } = await loadLiblouis();
  const translated: ReviewItem[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const braille = translateToBraille(block.text);
    translated.push({
      id: block.id,
      chapterId: block.chapterId,
      chapterTitle: block.chapterTitle,
      original: block.text,
      braille,
      backTranslation: backTranslateFromBraille(braille),
      risk: "low",
      category: block.kind,
      reason: "Wartet auf Analyse.",
      recommendation: "Automatische Analyse starten.",
      state: "auto_approved",
      hasReference: true,
      sourceMode: "generated",
      brailleProfile: "de-g0",
    });
    if (index % 10 === 0 || index === blocks.length - 1) {
      onProgress(5 + Math.round(((index + 1) / blocks.length) * 28));
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    }
  }

  return { items: translated, info };
}

async function createBrailleReviewItems(
  result: BrailleImportResult,
  onProgress: (value: number) => void,
) {
  const { loadLiblouis } = await import("@/lib/liblouis-client");
  const {
    backTranslateFromBraille,
    backTranslateFromBrf,
    info,
  } = await loadLiblouis();
  const translated: ReviewItem[] = [];

  for (let index = 0; index < result.segments.length; index += 1) {
    const segment = result.segments[index];
    const isBrf = segment.sourceEncoding === "brf";
    translated.push({
      id: segment.id,
      chapterId: segment.chapterId,
      chapterTitle: segment.chapterTitle,
      original: segment.reference ?? "",
      braille: isBrf ? brfToUnicode(segment.braille) : segment.braille,
      backTranslation: isBrf
        ? backTranslateFromBrf(segment.braille, segment.profile)
        : backTranslateFromBraille(segment.braille),
      risk: "medium",
      category: "structure",
      reason: "Wartet auf Analyse.",
      recommendation: "Automatische Analyse starten.",
      state: "open",
      hasReference: Boolean(segment.reference),
      sourceMode: "imported_braille",
      brailleProfile: segment.profile,
    });
    if (index % 10 === 0 || index === result.segments.length - 1) {
      onProgress(5 + Math.round(((index + 1) / result.segments.length) * 28));
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    }
  }

  return {
    items: translated,
    info: {
      ...info,
      label: result.profile === "en-ueb-g2"
        ? `Liblouis ${info.version} · Englisch UEB Grade 2`
        : result.profile === "en-gb-g2"
          ? `Liblouis ${info.version} · Englisch British Grade 2`
          : result.profile === "en-us-g2"
            ? `Liblouis ${info.version} · Englisch US Grade 2`
            : info.label,
    },
  };
}

export default function Home() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedChapter, setSelectedChapter] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const [bookTitle, setBookTitle] = useState("");
  const [reviewMode, setReviewMode] = useState<ReviewMode>("print_to_braille");
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("local");
  const [analysisNotice, setAnalysisNotice] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [isReleased, setIsReleased] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showImportDocument, setShowImportDocument] = useState(false);
  const [showDocument, setShowDocument] = useState(false);
  const [documentView, setDocumentView] = useState<DocumentView>("parallel");
  const [showSettings, setShowSettings] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [apiModel, setApiModel] = useState("gpt-5.6-luna");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("print");
  const [importTitle, setImportTitle] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState("");
  const [isReadingImport, setIsReadingImport] = useState(false);
  const [sourceFormat, setSourceFormat] = useState("");
  const [translationEngine, setTranslationEngine] = useState("");
  const [importText, setImportText] = useState("");
  const [brailleText, setBrailleText] = useState("");
  const [brailleReferenceText, setBrailleReferenceText] = useState("");
  const [brailleProfileChoice, setBrailleProfileChoice] = useState<BrailleProfileChoice>("auto");
  const [announcement, setAnnouncement] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const settingsCloseButtonRef = useRef<HTMLButtonElement>(null);
  const documentCloseButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      try {
        const response = await fetch("/api/settings");
        if (!response.ok) throw new Error("settings_unavailable");
        const data = await response.json() as {
          serverKeyConfigured: boolean;
          model: string;
        };
        if (!active) return;
        setApiModel(data.model);
        if (data.serverKeyConfigured) {
          setApiStatus("server");
        } else {
          setApiStatus(window.sessionStorage.getItem("braille-qa-openai-key") ? "session" : "missing");
        }
      } catch {
        if (active) {
          setApiStatus(window.sessionStorage.getItem("braille-qa-openai-key") ? "session" : "missing");
        }
      }
    }
    void loadSettings();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("braille-qa-session-v2");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as {
        items: ReviewItem[];
        bookTitle: string;
        analysisMode: AnalysisMode;
        analysisNotice: string;
        sourceFormat?: string;
        translationEngine?: string;
        reviewMode?: ReviewMode;
      };
      if (parsed.items?.length) {
        const restoredItems = parsed.items.map((item) => ({
          ...item,
          hasReference: item.hasReference ?? true,
          sourceMode: item.sourceMode ?? "generated" as const,
          brailleProfile: item.brailleProfile ?? "de-g0" as const,
        }));
        const frame = window.requestAnimationFrame(() => {
          setItems(restoredItems);
          setBookTitle(parsed.bookTitle);
          setAnalysisMode(parsed.analysisMode);
          setAnalysisNotice(parsed.analysisNotice);
          setSourceFormat(parsed.sourceFormat ?? "Vorherige Sitzung");
          setTranslationEngine(parsed.translationEngine ?? "Vorherige Übersetzung");
          setReviewMode(parsed.reviewMode ?? "print_to_braille");
          setSelectedId(restoredItems.find((item) => item.state === "open")?.id ?? restoredItems[0].id);
        });
        return () => window.cancelAnimationFrame(frame);
      }
    } catch {
      window.localStorage.removeItem("braille-qa-session-v2");
    }
  }, []);

  useEffect(() => {
    if (!items.length) return;
    try {
      window.localStorage.setItem("braille-qa-session-v2", JSON.stringify({
        items,
        bookTitle,
        analysisMode,
        analysisNotice,
        sourceFormat,
        translationEngine,
        reviewMode,
      }));
    } catch {
      // Große Bücher können die Browser-Speichergrenze überschreiten.
      // Die laufende Prüfung bleibt vollständig im Arbeitsspeicher erhalten.
    }
  }, [items, bookTitle, analysisMode, analysisNotice, sourceFormat, translationEngine, reviewMode]);

  useEffect(() => {
    if (!showImport) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowImport(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showImport]);

  useEffect(() => {
    if (!showSettings) return;
    settingsCloseButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowSettings(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showSettings]);

  useEffect(() => {
    if (!showDocument) return;
    documentCloseButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowDocument(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showDocument]);

  const chapters = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) seen.set(item.chapterId, item.chapterTitle);
    return Array.from(seen, ([id, title]) => ({
      id,
      title,
      count: items.filter((item) => item.chapterId === id).length,
      open: items.filter((item) => item.chapterId === id && item.state === "open").length,
    }));
  }, [items]);

  const openItems = items.filter((item) => item.state === "open");
  const highCount = openItems.filter((item) => item.risk === "high").length;
  const autoCount = items.filter((item) => item.state === "auto_approved").length;
  const reviewedCount = items.filter((item) => ["confirmed", "corrected", "dismissed"].includes(item.state)).length;
  const completedCount = items.length - openItems.length;
  const progress = items.length ? Math.round((completedCount / items.length) * 100) : 0;
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

  const visibleItems = items.filter((item) => {
    if (selectedChapter !== "all" && item.chapterId !== selectedChapter) return false;
    return showAll || item.state === "open";
  });

  function updateState(state: ReviewState) {
    if (!selected) return;
    const nextItems = items.map((item) => item.id === selected.id ? { ...item, state } : item);
    setItems(nextItems);
    setAnnouncement(`Prüfstelle wurde als „${stateLabel[state]}“ gespeichert.`);
    const next = nextItems.find((item) => item.state === "open" && item.id !== selected.id);
    if (next) {
      setSelectedId(next.id);
      setSelectedChapter(next.chapterId);
    }
  }

  function chooseChapter(chapterId: string) {
    setSelectedChapter(chapterId);
    const next = items.find((item) =>
      (chapterId === "all" || item.chapterId === chapterId)
      && (showAll || item.state === "open"),
    );
    if (next) setSelectedId(next.id);
  }

  async function analyzeBook(parsedItems: ReviewItem[], title: string) {
    setShowImport(false);
    setBookTitle(title.trim() || "Unbenanntes Buch");
    setItems(parsedItems);
    setSelectedId(parsedItems[0].id);
    setSelectedChapter("all");
    setShowAll(false);
    setIsReleased(false);
    setIsAnalyzing(true);
    setAnalysisProgress(35);
    setAnalysisNotice(
      parsedItems[0]?.sourceMode === "imported_braille"
        ? "Liblouis-Rückübersetzung abgeschlossen. Die Braille-Prüfung läuft."
        : "Liblouis-Übersetzung abgeschlossen. Die Risikoprüfung läuft.",
    );

    const results = new Map<string, ApiFinding>();
    let mode: AnalysisMode = "local";
    let notice = "Lokale Regelprüfung abgeschlossen.";
    const batchSize = 20;
    const sessionApiKey = window.sessionStorage.getItem("braille-qa-openai-key");

    try {
      for (let start = 0; start < parsedItems.length; start += batchSize) {
        const batch = parsedItems.slice(start, start + batchSize);
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(sessionApiKey ? { "x-openai-api-key": sessionApiKey } : {}),
          },
          body: JSON.stringify({
            segments: batch.map((item) => ({
              id: item.id,
              chapter: item.chapterTitle,
              original: item.original,
              braille: item.braille,
              backTranslation: item.backTranslation,
              hasReference: item.hasReference,
              sourceMode: item.sourceMode,
              brailleProfile: item.brailleProfile,
            })),
          }),
        });
        if (!response.ok) throw new Error("analysis_failed");
        const data = await response.json() as {
          mode: "local" | "openai";
          findings: ApiFinding[];
          notice?: string;
          model?: string;
        };
        mode = data.mode;
        notice = data.mode === "openai"
          ? `Semantische OpenAI-Prüfung mit ${data.model ?? "dem Analysemodell"} abgeschlossen.`
          : data.notice ?? "Lokale Regelprüfung abgeschlossen.";
        for (const finding of data.findings) results.set(finding.id, finding);
        setAnalysisProgress(35 + Math.round(((start + batch.length) / parsedItems.length) * 60));
      }

      const analyzed = parsedItems.map((item) => {
        const finding = results.get(item.id);
        if (!finding) return { ...item, risk: "medium" as const, state: "open" as const };
        return {
          ...item,
          risk: finding.risk,
          category: finding.category,
          reason: finding.reason,
          recommendation: finding.recommendation,
          state: finding.autoRelease ? "auto_approved" as const : "open" as const,
        };
      });
      setItems(analyzed);
      setAnalysisMode(mode);
      setAnalysisNotice(notice);
      const firstOpen = analyzed.find((item) => item.state === "open");
      setSelectedId(firstOpen?.id ?? analyzed[0].id);
      setSelectedChapter(firstOpen?.chapterId ?? "all");
      setAnalysisProgress(100);
      setAnnouncement(`${analyzed.length} Abschnitte wurden geprüft. ${analyzed.filter((item) => item.state === "open").length} benötigen eine Entscheidung.`);
    } catch {
      const safeItems = parsedItems.map((item) => ({
        ...item,
        risk: "medium" as const,
        reason: "Die automatische Analyse war nicht erreichbar.",
        recommendation: "Dieser Abschnitt wurde vorsorglich zur manuellen Prüfung vorgelegt.",
        state: "open" as const,
      }));
      setItems(safeItems);
      setAnalysisMode("local");
      setAnalysisNotice("Die automatische Analyse war nicht erreichbar. Alle Abschnitte wurden sicherheitshalber zur Prüfung vorgelegt.");
      setSelectedId(safeItems[0].id);
      setAnalysisProgress(100);
    } finally {
      setTimeout(() => setIsAnalyzing(false), 350);
    }
  }

  async function saveSessionApiKey() {
    const key = draftApiKey.trim();
    if (!key) {
      setSettingsMessage("Bitte zuerst einen API-Schlüssel eingeben.");
      return;
    }

    setIsTestingKey(true);
    setSettingsMessage("Verbindung wird geprüft …");
    try {
      const response = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "x-openai-api-key": key },
      });
      const data = await response.json() as {
        valid: boolean;
        source?: "server" | "session";
        error?: string;
      };
      if (!response.ok || !data.valid) {
        setSettingsMessage(data.error ?? "Der API-Schlüssel konnte nicht bestätigt werden.");
        return;
      }

      if (data.source === "server") {
        window.sessionStorage.removeItem("braille-qa-openai-key");
        setApiStatus("server");
      } else {
        window.sessionStorage.setItem("braille-qa-openai-key", key);
        setApiStatus("session");
      }
      setDraftApiKey("");
      setSettingsMessage("OpenAI ist verbunden. Neue Analysen laufen jetzt im echten Modus.");
      setAnnouncement("OpenAI-Verbindung wurde erfolgreich eingerichtet.");
    } catch {
      setSettingsMessage("Die Verbindung konnte gerade nicht geprüft werden.");
    } finally {
      setIsTestingKey(false);
    }
  }

  function removeSessionApiKey() {
    window.sessionStorage.removeItem("braille-qa-openai-key");
    setDraftApiKey("");
    setApiStatus("missing");
    setSettingsMessage("Der Sitzungsschlüssel wurde entfernt.");
    setAnnouncement("OpenAI-Sitzungsschlüssel wurde entfernt.");
  }

  function previewPastedText() {
    try {
      setShowImportDocument(false);
      if (importMode === "braille") {
        if (!brailleText.trim()) {
          setImportError("Bitte zuerst Unicode-Braille eingeben oder eine Datei auswählen.");
          return;
        }
        const preview = parseUnicodeBraille(brailleText, importTitle, brailleReferenceText);
        setImportPreview({ mode: "braille", result: preview });
        setAnnouncement(`${preview.segments.length} Braille-Abschnitte erkannt.`);
      } else {
        if (!importText.trim()) {
          setImportError("Bitte zuerst einen Buchtext eingeben.");
          return;
        }
        const preview = parseTextBook(importText, importTitle, "text");
        setImportPreview({ mode: "print", result: preview });
        setAnnouncement(`${preview.chapters.length} Kapitel mit ${preview.blocks.length} Abschnitten erkannt.`);
      }
      setImportError("");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Der Inhalt konnte nicht gelesen werden.");
    }
  }

  async function startImport() {
    if (!importPreview) {
      previewPastedText();
      return;
    }
    const segmentCount = importPreview.mode === "print"
      ? importPreview.result.blocks.length
      : importPreview.result.segments.length;
    if (!segmentCount) {
      setImportError("Es wurden keine prüfbaren Abschnitte erkannt.");
      return;
    }
    setShowImport(false);
    setBookTitle(importPreview.result.title);
    setIsAnalyzing(true);
    setAnalysisProgress(3);
    setAnalysisNotice(
      importPreview.mode === "print"
        ? "Liblouis übersetzt das Buch mit der deutschen Regeltabelle."
        : "Liblouis rückübersetzt die vorhandene Braille-Ausgabe.",
    );
    try {
      const translated = importPreview.mode === "print"
        ? await createLiblouisItems(importPreview.result.blocks, setAnalysisProgress)
        : await createBrailleReviewItems(importPreview.result, setAnalysisProgress);
      setTranslationEngine(translated.info.label);
      if (importPreview.mode === "print") {
        setReviewMode("print_to_braille");
        setSourceFormat(importFormatLabel[importPreview.result.format]);
      } else {
        setReviewMode("braille_review");
        setSourceFormat(brailleFormatLabel[importPreview.result.format]);
      }
      await analyzeBook(translated.items, importPreview.result.title);
      setImportPreview(null);
      setImportError("");
    } catch (error) {
      setIsAnalyzing(false);
      setShowImport(true);
      setImportError(
        error instanceof Error
          ? error.message
          : "Die Braille-Übersetzung konnte nicht gestartet werden.",
      );
    }
  }

  async function readImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsReadingImport(true);
    setImportError("");
    setImportPreview(null);
    setShowImportDocument(false);
    try {
      if (importMode === "braille") {
        const preview = await parseBrailleFile(file, brailleReferenceText, brailleProfileChoice);
        setImportTitle(preview.title);
        setImportPreview({ mode: "braille", result: preview });
        setAnnouncement(`„${file.name}“ wurde gelesen: ${preview.segments.length} Braille-Abschnitte erkannt.`);
      } else {
        const isEpub = /\.epub$/i.test(file.name);
        if (!isEpub && file.size > 5_000_000) {
          throw new Error("TXT- und Markdown-Dateien dürfen höchstens 5 MB groß sein.");
        }
        let preview: BookImportResult;
        if (isEpub) {
          preview = await parseEpub(file);
        } else {
          const source = await file.text();
          const fileTitle = file.name.replace(/\.(txt|md|markdown)$/i, "");
          const format = /\.md|\.markdown$/i.test(file.name) ? "markdown" : "text";
          setImportText(source);
          preview = parseTextBook(source, fileTitle, format);
          preview.fileName = file.name;
        }
        setImportTitle(preview.title);
        setImportPreview({ mode: "print", result: preview });
        setAnnouncement(`„${file.name}“ wurde gelesen: ${preview.chapters.length} Kapitel erkannt.`);
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Die Datei konnte nicht gelesen werden.");
    } finally {
      setIsReadingImport(false);
      event.target.value = "";
    }
  }

  function downloadReport() {
    const report = {
      book: bookTitle,
      generatedAt: new Date().toISOString(),
      sourceFormat,
      translationEngine,
      workflow: reviewMode,
      analysis: modeLabel[analysisMode],
      summary: {
        segments: items.length,
        autoApproved: autoCount,
        humanReviewed: reviewedCount,
        corrected: items.filter((item) => item.state === "corrected").length,
        dismissed: items.filter((item) => item.state === "dismissed").length,
        stillOpen: openItems.length,
      },
      chapters,
      decisions: items.map((item) => ({
        id: item.id,
        chapterId: item.chapterId,
        chapterTitle: item.chapterTitle,
        original: item.original,
        hasReference: item.hasReference,
        sourceMode: item.sourceMode,
        braille: item.braille,
        brailleProfile: item.brailleProfile,
        backTranslation: item.backTranslation,
        risk: item.risk,
        category: item.category,
        reason: item.reason,
        recommendation: item.recommendation,
        state: item.state,
      })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${bookTitle.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, "-")}-pruefbericht.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setAnnouncement("Der Prüfbericht wurde heruntergeladen.");
  }

  function releaseBook() {
    if (openItems.length) return;
    setIsReleased(true);
    setAnnouncement("Das Buch wurde für die nächste Produktionsstufe freigegeben.");
  }

  function openImport() {
    setImportPreview(null);
    setShowImportDocument(false);
    setImportError("");
    setShowImport(true);
  }

  function startOnboarding(mode: ImportMode) {
    setImportMode(mode);
    openImport();
  }

  return (
    <main className="app-shell">
      {selected && <a className="skip-link" href="#review-detail">Zur aktuellen Prüfstelle springen</a>}

      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">⠿</div>
          <div>
            <p className="eyebrow">dzb lesen · Produktionsassistent</p>
            <h1>Braille QA Copilot</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="settings-button" type="button" onClick={() => { setSettingsMessage(""); setShowSettings(true); }}>
            <span className={`connection-dot connection-${apiStatus}`} aria-hidden="true" />
            <span>
              <strong>Einstellungen</strong>
              <small>
                {apiStatus === "server" && "OpenAI serverseitig verbunden"}
                {apiStatus === "session" && "OpenAI für diese Sitzung verbunden"}
                {apiStatus === "missing" && "OpenAI-Schlüssel fehlt"}
                {apiStatus === "checking" && "Verbindung wird geprüft"}
              </small>
            </span>
          </button>
          {selected ? (
            <>
              <button className="button button-secondary" type="button" onClick={() => { setDocumentView("parallel"); setShowDocument(true); }}>
                Gesamtdokument
              </button>
              <button className="button button-secondary" type="button" onClick={openImport}>
                Buch wechseln
              </button>
            </>
          ) : (
            <button className="button button-primary" type="button" onClick={() => startOnboarding("print")}>
              Dokument importieren
            </button>
          )}
        </div>
      </header>

      {selected ? (
        <>
      <section className="document-bar" aria-labelledby="document-title">
        <div>
          <p className="eyebrow">
            {reviewMode === "braille_review" ? "Braille-Prüfung" : "Schwarzschrift → Braille"}
          </p>
          <h2 id="document-title">{bookTitle}</h2>
          <p className="document-subtitle">{chapters.length} Kapitel · {items.length} prüfbare Abschnitte · {sourceFormat} · {translationEngine}</p>
        </div>
        <div className={`engine-status engine-${analysisMode}`}>
          <span className="engine-dot" aria-hidden="true" />
          <div><strong>{modeLabel[analysisMode]}</strong><small>{analysisNotice}</small></div>
        </div>
      </section>

      <section className={`outcome-banner ${openItems.length === 0 ? "outcome-complete" : ""}`} aria-live="polite">
        <div className="outcome-icon" aria-hidden="true">{openItems.length === 0 ? "✓" : openItems.length}</div>
        <div className="outcome-copy">
          <p className="eyebrow">{openItems.length === 0 ? "Analyse abgeschlossen" : "Ihre Aufgabe"}</p>
          <h2>{openItems.length === 0 ? "Alle Prüfstellen sind entschieden." : `Nur noch ${openItems.length} Stellen brauchen Ihre Entscheidung.`}</h2>
          <p>{autoCount} unauffällige Abschnitte wurden automatisch geprüft. Sie können diese jederzeit über „Alle anzeigen“ stichprobenartig öffnen.</p>
        </div>
        <div className="outcome-actions">
          {openItems.length === 0 && (
            <button className="button button-primary" type="button" onClick={releaseBook}>
              Buch freigeben
            </button>
          )}
        </div>
      </section>

      <section className="focus-progress" aria-label="Prüffortschritt">
        <div className="focus-progress-copy">
          <strong>{progress}% abgeschlossen</strong>
          <span>{completedCount} von {items.length} Abschnitten · {highCount} kritisch</span>
        </div>
        <div className="progress-track" role="progressbar" aria-label="Prüffortschritt" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="workspace focus-workspace" aria-label="Korrekturarbeitsplatz">
        <aside className="review-list" aria-labelledby="review-list-title">
          <div className="focus-list-heading">
            <div><p className="eyebrow">Als Nächstes</p><h2 id="review-list-title">{showAll ? "Alle Abschnitte" : "Offene Stellen"}</h2></div>
            <span className="count-badge">{visibleItems.length}</span>
          </div>
          <div className="queue-controls">
            <label htmlFor="chapter-filter">Kapitel</label>
            <select id="chapter-filter" value={selectedChapter} onChange={(event) => chooseChapter(event.target.value)}>
              <option value="all">Gesamtes Buch</option>
              {chapters.map((chapter) => (
                <option value={chapter.id} key={chapter.id}>
                  {chapter.title} · {chapter.open} offen
                </option>
              ))}
            </select>
            <button type="button" aria-pressed={showAll} onClick={() => setShowAll((value) => !value)}>
              {showAll ? "Nur offene" : "Alle anzeigen"}
            </button>
          </div>
          <div className="queue" role="list">
            {visibleItems.map((item) => (
              <button className={`queue-item ${selected.id === item.id ? "selected" : ""}`} type="button" onClick={() => setSelectedId(item.id)} aria-current={selected.id === item.id ? "true" : undefined} role="listitem" key={item.id}>
                <span className={`risk-dot risk-${item.risk}`} aria-hidden="true" />
                <span className="queue-copy">
                  <span className="queue-meta"><span>{riskLabel[item.risk]}</span><span className={`state state-${item.state}`}>{stateLabel[item.state]}</span></span>
                  <strong>{item.original || item.backTranslation || "Braille-Abschnitt ohne Referenz"}</strong>
                  <small>{item.reason}</small>
                </span>
              </button>
            ))}
            {!visibleItems.length && (
              <div className="empty-state"><span aria-hidden="true">✓</span><strong>Dieses Kapitel ist fertig.</strong><p>Es gibt keine offenen Prüfstellen.</p></div>
            )}
          </div>
        </aside>

        <article className="review-detail" id="review-detail" tabIndex={-1} aria-labelledby="detail-title">
          <div className="panel-heading detail-heading">
            <div>
              <div className="detail-kicker"><span className={`risk-pill risk-pill-${selected.risk}`}>{riskLabel[selected.risk]}</span><span>{selected.chapterTitle}</span></div>
              <h2 id="detail-title">{selected.state === "open" ? "Diese Stelle braucht Ihre Entscheidung" : "Prüfergebnis ansehen"}</h2>
            </div>
            <span className={`state state-${selected.state}`}>{stateLabel[selected.state]}</span>
          </div>

          <div className="comparison-grid">
            <section className={`text-panel ${selected.hasReference ? "" : "reference-missing"}`}>
              <div className="text-panel-label"><span>01</span><h3>Schwarzschrift-Referenz</h3></div>
              <p>{selected.original || "Nicht mitgeliefert"}</p>
              {!selected.hasReference && <small>Inhaltliche Vollständigkeit kann ohne Referenz nicht automatisch bestätigt werden.</small>}
            </section>
            <section className="text-panel braille-panel" lang="de-Brai"><div className="text-panel-label"><span>02</span><h3>{selected.sourceMode === "imported_braille" ? "Vorhandene Braille-Ausgabe" : "Automatisch erzeugte Braille-Ausgabe"}</h3></div><p className="braille-text">{selected.braille}</p><small>{translationEngine}</small></section>
            <section className="text-panel back-panel"><div className="text-panel-label"><span>03</span><h3>Rückübersetzung</h3></div><p>{selected.backTranslation}</p></section>
          </div>

          <section className={`finding finding-${selected.risk}`} aria-labelledby="finding-title">
            <div className="finding-symbol" aria-hidden="true">{selected.risk === "high" ? "!" : selected.risk === "medium" ? "?" : "✓"}</div>
            <div><p className="eyebrow" id="finding-title">Automatische Einschätzung</p><strong>{selected.reason}</strong><small>{selected.recommendation}</small></div>
          </section>

          {selected.state === "open" ? (
            <div className="decision-bar">
              <div><p className="eyebrow">Ihre Entscheidung</p><span>Eine Auswahl genügt. Danach öffnet sich automatisch die nächste Stelle.</span></div>
              <div className="decision-actions">
                <button className="button button-ghost" type="button" onClick={() => updateState("dismissed")}>Fehlalarm</button>
                <button className="button button-secondary" type="button" onClick={() => updateState("confirmed")}>Ist korrekt</button>
                <button className="button button-primary" type="button" onClick={() => updateState("corrected")}>Korrektur speichern</button>
              </div>
            </div>
          ) : (
            <div className="reviewed-note"><span aria-hidden="true">✓</span><div><strong>{stateLabel[selected.state]}</strong><p>Dieser Abschnitt benötigt keine weitere Entscheidung.</p></div></div>
          )}
        </article>
      </section>

      <footer className="app-footer"><span>Schwarzschrift & Braille · EPUB 3, PEF, BRF · Liblouis 3.38.0 · Screenreader-bedienbar</span><button type="button" onClick={downloadReport}>Prüfbericht herunterladen</button></footer>
        </>
      ) : (
        <section className="onboarding" aria-labelledby="onboarding-title">
          <div className="onboarding-hero">
            <div className="onboarding-copy">
              <p className="onboarding-kicker"><span aria-hidden="true">✓</span> Startklar ohne Einrichtung</p>
              <h2 id="onboarding-title">Vom Dokument zu den Stellen, die wirklich geprüft werden müssen.</h2>
              <p className="onboarding-lead">
                Importieren Sie Schwarzschrift oder eine vorhandene Braille-Ausgabe. Der Copilot übernimmt Struktur,
                Übersetzung und Vorprüfung – Sie entscheiden nur noch bei auffälligen Stellen.
              </p>
              <div className="onboarding-actions">
                <button className="button button-primary onboarding-primary" type="button" onClick={() => startOnboarding("print")}>
                  <span aria-hidden="true">Aa</span>
                  <span><strong>Schwarzschrift übertragen</strong><small>EPUB, TXT oder Markdown</small></span>
                </button>
                <button className="button button-ghost onboarding-secondary" type="button" onClick={() => startOnboarding("braille")}>
                  <span aria-hidden="true">⠿</span>
                  <span><strong>Vorhandenes Braille prüfen</strong><small>PEF, BRF oder Unicode-Braille</small></span>
                </button>
              </div>
              <p className="onboarding-support">Auch ganze Bücher werden vollständig verarbeitet. Vor dem Start sehen Sie immer die erkannte Struktur.</p>
            </div>
            <div className="onboarding-summary" aria-label="Das übernimmt der Copilot">
              <p className="eyebrow">Das übernimmt der Copilot</p>
              <ul>
                <li><span aria-hidden="true">01</span><div><strong>Kapitel erkennen</strong><small>Lesereihenfolge und Abschnitte kontrollieren</small></div></li>
                <li><span aria-hidden="true">02</span><div><strong>Mit Liblouis verarbeiten</strong><small>Übersetzen oder vorhandenes Braille rückübersetzen</small></div></li>
                <li><span aria-hidden="true">03</span><div><strong>Risiken priorisieren</strong><small>Nur auffällige Stellen zur Entscheidung vorlegen</small></div></li>
              </ul>
            </div>
          </div>

          <div className="onboarding-steps" aria-label="Ablauf des Prüflaufs">
            <article>
              <span aria-hidden="true">1</span>
              <div><h3>Dokument wählen</h3><p>Datei hochladen oder Inhalt direkt einfügen.</p></div>
            </article>
            <article>
              <span aria-hidden="true">2</span>
              <div><h3>Struktur bestätigen</h3><p>Kapitel, Seiten und Referenzen vorab kontrollieren.</p></div>
            </article>
            <article>
              <span aria-hidden="true">3</span>
              <div><h3>Gezielt entscheiden</h3><p>Prüfstellen bearbeiten und Bericht herunterladen.</p></div>
            </article>
          </div>

          <div className="onboarding-ai">
            <span className={`connection-dot connection-${apiStatus}`} aria-hidden="true" />
            <div>
              <strong>
                {apiStatus === "server" || apiStatus === "session"
                  ? "Semantische OpenAI-Prüfung ist aktiv"
                  : "OpenAI ist optional"}
              </strong>
              <p>
                {apiStatus === "server" || apiStatus === "session"
                  ? "Neue Prüfläufe kombinieren Liblouis und die semantische Analyse."
                  : "Ohne API-Schlüssel arbeitet der Copilot mit Liblouis und lokalen Regeln. Für eine zusätzliche semantische Prüfung können Sie OpenAI in den Einstellungen verbinden."}
              </p>
            </div>
            {apiStatus !== "server" && apiStatus !== "session" && (
              <button className="button button-ghost" type="button" onClick={() => { setSettingsMessage(""); setShowSettings(true); }}>
                OpenAI verbinden
              </button>
            )}
          </div>
        </section>
      )}
      <p className="sr-only" aria-live="polite">{announcement}</p>

      {isReleased && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal release-modal" role="dialog" aria-modal="true" aria-labelledby="release-title">
            <div className="release-mark" aria-hidden="true">✓</div>
            <p className="eyebrow">Produktionsstufe abgeschlossen</p>
            <h2 id="release-title">{bookTitle} ist freigegeben.</h2>
            <p>Alle automatisch markierten Stellen wurden entschieden. Laden Sie den Prüfbericht herunter oder beginnen Sie mit einem neuen Buch.</p>
            <div className="release-summary"><span><strong>{items.length}</strong> Abschnitte</span><span><strong>{autoCount}</strong> automatisch geprüft</span><span><strong>{reviewedCount}</strong> menschlich geprüft</span></div>
            <div className="modal-actions">
              <button className="button button-secondary" type="button" onClick={downloadReport}>Prüfbericht laden</button>
              <button className="button button-primary" type="button" onClick={() => { setIsReleased(false); openImport(); }}>Neues Buch</button>
            </div>
          </section>
        </div>
      )}

      {showDocument && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal document-modal" role="dialog" aria-modal="true" aria-labelledby="document-view-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Gesamtdokument · {items.length} Abschnitte</p>
                <h2 id="document-view-title">{bookTitle}</h2>
              </div>
              <button className="icon-button" ref={documentCloseButtonRef} type="button" aria-label="Gesamtdokument schließen" onClick={() => setShowDocument(false)}>×</button>
            </div>
            <div className="document-tabs" role="tablist" aria-label="Dokumentdarstellung">
              {([
                ["parallel", "Vergleich"],
                ["original", "Schwarzschrift"],
                ["braille", "Braille"],
                ["back", "Rückübersetzung"],
              ] as const).map(([view, label]) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={documentView === view}
                  className={documentView === view ? "active" : ""}
                  onClick={() => setDocumentView(view)}
                  key={view}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="whole-document" role="tabpanel">
              {chapters.map((chapter, chapterIndex) => (
                <section className="whole-document-chapter" key={chapter.id}>
                  <header>
                    <span>{String(chapterIndex + 1).padStart(2, "0")}</span>
                    <div><h3>{chapter.title}</h3><small>{chapter.count} Abschnitte</small></div>
                  </header>
                  <div className={documentView === "parallel" ? "whole-document-parallel" : "whole-document-linear"}>
                    {items.filter((item) => item.chapterId === chapter.id).map((item) => (
                      documentView === "parallel" ? (
                        <article className="whole-document-row" key={item.id}>
                          <div>
                            <small>Schwarzschrift</small>
                            <p>{item.original || "Keine Referenz mitgeliefert"}</p>
                          </div>
                          <div lang="de-Brai">
                            <small>Braille</small>
                            <p className="braille-document-text">{item.braille}</p>
                          </div>
                          <div>
                            <small>Rückübersetzung</small>
                            <p>{item.backTranslation}</p>
                          </div>
                        </article>
                      ) : (
                        <p className={documentView === "braille" ? "braille-document-text" : ""} lang={documentView === "braille" ? "de-Brai" : undefined} key={item.id}>
                          {documentView === "original"
                            ? item.original || "[Keine Schwarzschrift-Referenz]"
                            : documentView === "braille"
                              ? item.braille
                              : item.backTranslation}
                        </p>
                      )
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="modal-actions">
              <button className="button button-primary" type="button" onClick={() => setShowDocument(false)}>Zur Prüfung zurückkehren</button>
            </div>
          </section>
        </div>
      )}

      {showSettings && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="modal-heading">
              <div><p className="eyebrow">Verbindung</p><h2 id="settings-title">OpenAI-Einstellungen</h2></div>
              <button className="icon-button" ref={settingsCloseButtonRef} type="button" aria-label="Einstellungen schließen" onClick={() => setShowSettings(false)}>×</button>
            </div>

            {apiStatus === "server" ? (
              <div className="connection-card connection-card-success">
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>Serverseitig verbunden</strong>
                  <p>Der sicher hinterlegte Schlüssel wird automatisch verwendet. Im Browser ist keine Eingabe nötig.</p>
                </div>
              </div>
            ) : (
              <>
                <p className="modal-intro">Es ist kein serverseitiger Schlüssel hinterlegt. Sie können OpenAI für diesen Browser-Tab verbinden.</p>
                <label className="field-label" htmlFor="openai-key">OpenAI API-Schlüssel</label>
                <input
                  className="text-input api-key-input"
                  id="openai-key"
                  type="password"
                  value={draftApiKey}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="sk-…"
                  onChange={(event) => { setDraftApiKey(event.target.value); setSettingsMessage(""); }}
                />
                <div className="privacy-note">
                  <span aria-hidden="true">⌁</span>
                  <p><strong>Nur für diese Sitzung</strong>Der Schlüssel bleibt ausschließlich im Sitzungsspeicher dieses Browser-Tabs und verschwindet beim Schließen. Er wird weder im Projekt noch im Prüfbericht gespeichert.</p>
                </div>
                {apiStatus === "session" && (
                  <div className="connection-card connection-card-success compact">
                    <span aria-hidden="true">✓</span>
                    <div><strong>OpenAI ist verbunden</strong><p>Neue Buchanalysen nutzen den echten Modus.</p></div>
                  </div>
                )}
              </>
            )}

            <div className="settings-meta">
              <span>Modell</span>
              <strong>{apiModel}</strong>
            </div>
            {settingsMessage && <p className="settings-message" role="status">{settingsMessage}</p>}
            <div className="modal-actions">
              {apiStatus === "session" && (
                <button className="button button-ghost danger-button" type="button" onClick={removeSessionApiKey}>
                  Schlüssel entfernen
                </button>
              )}
              <button className="button button-ghost" type="button" onClick={() => setShowSettings(false)}>Schließen</button>
              {apiStatus !== "server" && (
                <button className="button button-primary" type="button" disabled={isTestingKey} onClick={() => void saveSessionApiKey()}>
                  {isTestingKey ? "Verbindung wird geprüft …" : apiStatus === "session" ? "Anderen Schlüssel verwenden" : "Prüfen & verbinden"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {showImport && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{importPreview ? "Strukturvorschau" : "Neuer Prüflauf"}</p>
                <h2 id="import-title">{importPreview ? "Ist die erkannte Struktur korrekt?" : "Was möchten Sie prüfen?"}</h2>
              </div>
              <button className="icon-button" ref={closeButtonRef} type="button" aria-label="Import schließen" onClick={() => setShowImport(false)}>×</button>
            </div>

            {!importPreview ? (
              <>
                <div className="workflow-switch" role="group" aria-label="Arbeitsmodus wählen">
                  <button
                    className={importMode === "print" ? "active" : ""}
                    type="button"
                    aria-pressed={importMode === "print"}
                    onClick={() => { setImportMode("print"); setImportError(""); }}
                  >
                    <span aria-hidden="true">Aa</span>
                    <strong>Schwarzschrift übertragen</strong>
                    <small>Text importieren, automatisch in Braille übersetzen und per Rückübersetzung prüfen.</small>
                  </button>
                  <button
                    className={importMode === "braille" ? "active" : ""}
                    type="button"
                    aria-pressed={importMode === "braille"}
                    onClick={() => { setImportMode("braille"); setImportError(""); }}
                  >
                    <span aria-hidden="true">⠿</span>
                    <strong>Vorhandenes Braille prüfen</strong>
                    <small>PEF, BRF oder Unicode-Braille rückübersetzen und gezielt reviewen.</small>
                  </button>
                </div>
                <p className="modal-intro">
                  {importMode === "print"
                    ? "EPUB 3 wird mit Lesereihenfolge und Kapitelstruktur übernommen. TXT und Markdown bleiben als einfacher Fallback verfügbar."
                    : "Vorhandene Braille-Ausgaben werden rückübersetzt. Eine Schwarzschrift-Referenz ist optional, macht die inhaltliche Prüfung aber deutlich stärker."}
                </p>
                <label className="file-drop file-drop-primary">
                  <span className="file-drop-icon" aria-hidden="true">{isReadingImport ? "…" : "↑"}</span>
                  <span>
                    <strong>
                      {isReadingImport
                        ? "Datei wird strukturiert …"
                        : importMode === "print"
                          ? "EPUB, TXT oder Markdown auswählen"
                          : "PEF, BRF oder Braille-TXT auswählen"}
                    </strong>
                    <small>{importMode === "print" ? "EPUB bis 50 MB · TXT/Markdown bis 5 MB" : "Braille-Dateien bis 50 MB"}</small>
                  </span>
                  <input
                    type="file"
                    disabled={isReadingImport}
                    accept={importMode === "print"
                      ? ".epub,.txt,.md,.markdown,application/epub+zip,text/plain,text/markdown"
                      : ".pef,.brf,.txt,application/x-pef+xml,text/plain"}
                    onChange={(event) => void readImportFile(event)}
                  />
                </label>
                <div className="format-row" aria-label="Unterstützte Formate">
                  {importMode === "print" ? (
                    <>
                      <span className="format-pill preferred">EPUB 3 · empfohlen</span>
                      <span className="format-pill">Markdown</span>
                      <span className="format-pill">TXT</span>
                    </>
                  ) : (
                    <>
                      <span className="format-pill preferred">PEF · empfohlen</span>
                      <span className="format-pill">BRF</span>
                      <span className="format-pill">Unicode-TXT</span>
                    </>
                  )}
                </div>
                {importMode === "braille" && (
                  <>
                    <label className="field-label" htmlFor="braille-profile">BRF-Regelwerk</label>
                    <select
                      className="text-input"
                      id="braille-profile"
                      value={brailleProfileChoice}
                      onChange={(event) => {
                        setBrailleProfileChoice(event.target.value as BrailleProfileChoice);
                        setImportPreview(null);
                      }}
                    >
                      <option value="auto">Automatisch aus BRF erkennen</option>
                      <option value="de-g0">Deutsch · Basisschrift</option>
                      <option value="en-ueb-g2">Englisch · UEB Grade 2</option>
                      <option value="en-gb-g2">Englisch · British Grade 2</option>
                      <option value="en-us-g2">Englisch · US Grade 2</option>
                    </select>
                  </>
                )}
                <div className="or-divider"><span>{importMode === "print" ? "oder Text einfügen" : "oder Unicode-Braille einfügen"}</span></div>
                <label className="field-label" htmlFor="book-title">Titel</label>
                <input className="text-input" id="book-title" placeholder="Titel des Dokuments" value={importTitle} onChange={(event) => { setImportTitle(event.target.value); setImportPreview(null); }} />
                {importMode === "print" ? (
                  <>
                    <label className="field-label" htmlFor="book-text">Buchtext</label>
                    <textarea id="book-text" rows={7} placeholder="Text hier einfügen …" value={importText} onChange={(event) => { setImportText(event.target.value); setImportPreview(null); }} />
                  </>
                ) : (
                  <>
                    <label className="field-label" htmlFor="braille-text">Unicode-Braille</label>
                    <textarea className="braille-input" id="braille-text" rows={5} lang="de-Brai" placeholder="Unicode-Braille hier einfügen …" value={brailleText} onChange={(event) => { setBrailleText(event.target.value); setImportPreview(null); }} />
                    <label className="field-label optional-label" htmlFor="reference-text">
                      Schwarzschrift-Referenz <span>optional</span>
                    </label>
                    <textarea id="reference-text" rows={5} placeholder="Absätze in derselben Reihenfolge einfügen …" value={brailleReferenceText} onChange={(event) => { setBrailleReferenceText(event.target.value); setImportPreview(null); }} />
                  </>
                )}
                <div className="import-assurance"><span aria-hidden="true">✓</span><p><strong>Struktur zuerst prüfen</strong>Vor der Analyse sehen Sie erkannte Kapitel, Seiten und Referenzabdeckung. Noch wird nichts an OpenAI gesendet.</p></div>
              </>
            ) : (
              <div className="structure-preview">
                <div className="preview-summary">
                  <div>
                    <span className={`format-badge format-${importPreview.result.format}`}>
                      {importPreview.mode === "print"
                        ? importFormatLabel[importPreview.result.format]
                        : brailleFormatLabel[importPreview.result.format]}
                    </span>
                    <h3>{importPreview.result.title}</h3>
                    <p>
                      {importPreview.mode === "print"
                        ? [importPreview.result.author, importPreview.result.language].filter(Boolean).join(" · ")
                          || importPreview.result.fileName
                          || "Eingefügter Text"
                        : `${importPreview.result.fileName || "Eingefügtes Unicode-Braille"} · ${brailleProfileLabel[importPreview.result.profile]}`}
                    </p>
                  </div>
                  <div className="preview-numbers">
                    <span><strong>{importPreview.result.chapters.length}</strong> {importPreview.mode === "print" ? "Kapitel" : "Bände"}</span>
                    <span><strong>{importPreview.mode === "print" ? importPreview.result.blocks.length : importPreview.result.segments.length}</strong> Abschnitte</span>
                    {importPreview.mode === "braille" && (
                      <span><strong>{importPreview.result.referenceCount}</strong> mit Referenz</span>
                    )}
                  </div>
                </div>
                <ol className="chapter-preview-list">
                  {importPreview.result.chapters.map((chapter, index) => (
                    <li key={chapter.id}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{chapter.title}</strong>
                      <small>{chapter.blockCount} Abschnitte</small>
                    </li>
                  ))}
                </ol>
                <button
                  className="document-preview-toggle"
                  type="button"
                  aria-expanded={showImportDocument}
                  onClick={() => setShowImportDocument((value) => !value)}
                >
                  <span>
                    <strong>{showImportDocument ? "Dokumentvorschau schließen" : "Gesamten Import ansehen"}</strong>
                    <small>
                      {importPreview.mode === "print"
                        ? "Alle erkannten Schwarzschrift-Abschnitte in Lesereihenfolge"
                        : "Alle erkannten Braille-Seiten und vorhandenen Referenzen"}
                    </small>
                  </span>
                  <span aria-hidden="true">{showImportDocument ? "−" : "+"}</span>
                </button>
                {showImportDocument && (
                  <div className="import-document-preview">
                    {importPreview.result.chapters.map((chapter) => (
                      <section key={chapter.id}>
                        <h3>{chapter.title}</h3>
                        {importPreview.mode === "print"
                          ? importPreview.result.blocks
                            .filter((block) => block.chapterId === chapter.id)
                            .map((block) => <p key={block.id}>{block.text}</p>)
                          : importPreview.result.segments
                            .filter((segment) => segment.chapterId === chapter.id)
                            .map((segment) => (
                              <article key={segment.id}>
                                {segment.reference && <p><small>Schwarzschrift</small>{segment.reference}</p>}
                                <p className="braille-document-text" lang="de-Brai"><small>Braille</small>{segment.sourceEncoding === "brf" ? brfToUnicode(segment.braille) : segment.braille}</p>
                              </article>
                            ))}
                      </section>
                    ))}
                  </div>
                )}
                <div className="liblouis-assurance">
                  <span aria-hidden="true">⠿</span>
                  <p>
                    <strong>{importPreview.mode === "print" ? "Nächster Schritt: echte Braille-Übersetzung" : "Nächster Schritt: Braille-Rückübersetzung und Review"}</strong>
                    {importPreview.mode === "print"
                      ? `Liblouis 3.38.0 übersetzt alle ${importPreview.result.blocks.length} Abschnitte. Danach startet die abschnittsweise Regel- und optional die OpenAI-Prüfung.`
                      : importPreview.result.referenceCount === importPreview.result.segments.length
                        ? `Liblouis rückübersetzt alle ${importPreview.result.segments.length} Abschnitte und vergleicht sie mit der mitgelieferten Schwarzschrift.`
                        : `Liblouis rückübersetzt alle ${importPreview.result.segments.length} Abschnitte. Stellen ohne Schwarzschrift-Referenz bleiben bewusst zur menschlichen Entscheidung offen.`}
                  </p>
                </div>
              </div>
            )}

            {importError && <p className="import-error" role="alert">{importError}</p>}
            <div className="modal-actions">
              {importPreview ? (
                <>
                  <button className="button button-ghost" type="button" onClick={() => { setImportPreview(null); setShowImportDocument(false); setImportError(""); }}>Andere Datei</button>
                  <button className="button button-primary" type="button" onClick={() => void startImport()}>
                    {importPreview.mode === "print" ? "Übersetzen & analysieren" : "Braille prüfen"}
                  </button>
                </>
              ) : (
                <>
                  <button className="button button-ghost" type="button" onClick={() => setShowImport(false)}>Abbrechen</button>
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={isReadingImport || (importMode === "print" ? !importText.trim() : !brailleText.trim())}
                    onClick={previewPastedText}
                  >
                    Eingabe prüfen
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {isAnalyzing && (
        <div className="analysis-overlay" role="status" aria-live="polite">
          <div className="analysis-card">
            <div className="analysis-mark" aria-hidden="true">⠿</div>
            <p className="eyebrow">Automatische Vorprüfung</p>
            <h2>{bookTitle} wird analysiert</h2>
            <p>
              {reviewMode === "braille_review"
                ? "Die vorhandene Braille-Ausgabe wird mit Liblouis rückübersetzt und anschließend auf Risikostellen geprüft."
                : "Kapitel werden strukturiert, mit Liblouis übersetzt und anschließend auf Risikostellen geprüft."}
            </p>
            <div className="analysis-progress"><span style={{ width: `${analysisProgress}%` }} /></div>
            <strong>{analysisProgress}%</strong>
            <small>Sie können danach direkt mit den wichtigsten Stellen beginnen.</small>
          </div>
        </div>
      )}
    </main>
  );
}
