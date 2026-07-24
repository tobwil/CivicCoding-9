"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Risk = "high" | "medium" | "low";
type ReviewState = "open" | "auto_approved" | "confirmed" | "corrected" | "dismissed";
type AnalysisMode = "demo" | "local" | "openai";
type ApiStatus = "checking" | "server" | "session" | "missing";

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
};

type ApiFinding = {
  id: string;
  risk: Risk;
  category: string;
  reason: string;
  recommendation: string;
  autoRelease: boolean;
};

const brailleLetters: Record<string, string> = {
  a: "⠁", b: "⠃", c: "⠉", d: "⠙", e: "⠑", f: "⠋", g: "⠛",
  h: "⠓", i: "⠊", j: "⠚", k: "⠅", l: "⠇", m: "⠍", n: "⠝",
  o: "⠕", p: "⠏", q: "⠟", r: "⠗", s: "⠎", t: "⠞", u: "⠥",
  v: "⠧", w: "⠺", x: "⠭", y: "⠽", z: "⠵", ä: "⠜", ö: "⠪",
  ü: "⠳", ß: "⠮", ",": "⠂", ".": "⠲", "-": "⠤", ":": "⠒",
  ";": "⠆", "?": "⠢", "!": "⠖", "/": "⠌", "%": "⠨⠴",
  "(": "⠶", ")": "⠶", "\"": "⠶",
};

const digitBraille: Record<string, string> = {
  "1": "⠁", "2": "⠃", "3": "⠉", "4": "⠙", "5": "⠑",
  "6": "⠋", "7": "⠛", "8": "⠓", "9": "⠊", "0": "⠚",
};

function toBraille(text: string) {
  let inNumber = false;
  return Array.from(text).map((character) => {
    if (digitBraille[character]) {
      const prefix = inNumber ? "" : "⠼";
      inNumber = true;
      return prefix + digitBraille[character];
    }
    inNumber = false;
    if (character === " ") return " ";
    if (character === "\n") return "\n";
    const lower = character.toLowerCase();
    const capital = character !== lower && /[A-ZÄÖÜ]/.test(character) ? "⠠" : "";
    return capital + (brailleLetters[lower] ?? "⠿");
  }).join("");
}

function simulateBackTranslation(text: string) {
  return text
    .replace(/(\d),(\d)/g, "$1$2")
    .replace(/([\p{L}])[-–]([\p{L}])/gu, "$1 $2")
    .replace(/\b(www)\./gi, "$1 ")
    .replace(/\.([a-z]{2,4})\b/gi, " $1")
    .replace(/\b(Dr|Prof)\./g, "$1")
    .replace(/(\d)\.\s/g, "$1 ");
}

function makeItem(
  id: string,
  chapterId: string,
  chapterTitle: string,
  original: string,
): ReviewItem {
  const backTranslation = simulateBackTranslation(original);
  return {
    id,
    chapterId,
    chapterTitle,
    original,
    backTranslation,
    braille: toBraille(original),
    risk: "low",
    category: "none",
    reason: "Wartet auf Analyse.",
    recommendation: "Automatische Analyse starten.",
    state: "auto_approved",
  };
}

const sampleTexts = [
  ["chapter-1", "Kapitel 1 · Der neue Nahverkehr", [
    "Ab dem kommenden Frühjahr fahren die Straßenbahnen häufiger durch die Innenstadt.",
    "Die neue Linie ist 12,5 km lang und startet am 1. August.",
    "Dr. Miriam Vogel leitet das Projekt gemeinsam mit der Stadtverwaltung.",
    "Die Redaktion hat alle Haltestellen in einer Übersicht zusammengefasst.",
  ]],
  ["chapter-2", "Kapitel 2 · Technik und Teilhabe", [
    "Das KI-System priorisiert auffällige Textstellen für die Korrektur.",
    "Blinde Testlesende begleiten die Entwicklung von Beginn an.",
    "Weitere Informationen stehen unter www.dzblesen.de bereit.",
    "Jede menschliche Entscheidung wird für spätere Prüfungen dokumentiert.",
  ]],
  ["chapter-3", "Kapitel 3 · Ausblick", [
    "Die EU-Kommission veröffentlicht ihre Empfehlung im Herbst.",
    "Die nächste Ausgabe erscheint wie geplant am Freitag.",
  ]],
] as const;

const sampleItems = sampleTexts.flatMap(([chapterId, chapterTitle, texts]) =>
  texts.map((text, index) => {
    const item = makeItem(`${chapterId}-${index + 1}`, chapterId, chapterTitle, text);
    const hasHigh = /\d|www\./i.test(text);
    const hasMedium = /Dr\.|[\p{L}]-[\p{L}]/u.test(text);
    return {
      ...item,
      risk: hasHigh ? "high" as const : hasMedium ? "medium" as const : "low" as const,
      category: hasHigh ? "number_or_web" : hasMedium ? "context" : "none",
      reason: hasHigh
        ? "Zahl, Datum, Einheit oder Webadresse muss bestätigt werden."
        : hasMedium
          ? "Abkürzung oder Wortzusammensetzung im Kontext prüfen."
          : "Keine Auffälligkeit in der automatischen Vorprüfung.",
      recommendation: hasHigh || hasMedium
        ? "Original und Rückübersetzung vergleichen."
        : "Automatisch freigeben; Stichprobe bleibt möglich.",
      state: hasHigh || hasMedium ? "open" as const : "auto_approved" as const,
    };
  }),
);

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
  demo: "Beispielanalyse",
  local: "Lokale Regelprüfung",
  openai: "OpenAI + Regelprüfung",
};

function splitLongParagraph(text: string) {
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

function parseBook(text: string) {
  const lines = text.replace(/\r/g, "").split("\n");
  let chapterIndex = 1;
  let chapterId = "chapter-1";
  let chapterTitle = "Kapitel 1";
  let paragraphBuffer: string[] = [];
  const items: ReviewItem[] = [];

  function flushParagraph() {
    const paragraph = paragraphBuffer.join(" ").trim();
    paragraphBuffer = [];
    if (!paragraph) return;
    for (const part of splitLongParagraph(paragraph)) {
      items.push(makeItem(
        `${chapterId}-${items.filter((item) => item.chapterId === chapterId).length + 1}`,
        chapterId,
        chapterTitle,
        part,
      ));
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(/^(?:#{1,3}\s+)?(?:Kapitel|Chapter)\s+(.+)$/i)
      ?? line.match(/^#{1,2}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const hasContent = items.some((item) => item.chapterId === chapterId);
      if (hasContent || chapterIndex > 1) chapterIndex += 1;
      chapterId = `chapter-${chapterIndex}`;
      chapterTitle = line.replace(/^#{1,3}\s+/, "");
      continue;
    }
    if (!line) {
      flushParagraph();
    } else {
      paragraphBuffer.push(line);
    }
  }
  flushParagraph();

  if (!items.length && text.trim()) {
    return [makeItem("chapter-1-1", "chapter-1", "Kapitel 1", text.trim())];
  }
  return items.slice(0, 500);
}

export default function Home() {
  const [items, setItems] = useState<ReviewItem[]>(sampleItems);
  const [selectedId, setSelectedId] = useState(sampleItems.find((item) => item.state === "open")?.id ?? sampleItems[0].id);
  const [selectedChapter, setSelectedChapter] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const [bookTitle, setBookTitle] = useState("Mobilität & Gesellschaft");
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("demo");
  const [analysisNotice, setAnalysisNotice] = useState("Beispieldaten – bereit zum Ausprobieren.");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [isReleased, setIsReleased] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [apiModel, setApiModel] = useState("gpt-5.6-luna");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [importTitle, setImportTitle] = useState("Mein Buch");
  const [importText, setImportText] = useState(
    "Kapitel 1 Einführung\n\nAb dem 1. Januar gelten neue Regeln. Dr. Weber stellt das KI-System vor.\n\nWeitere Hinweise stehen unter www.beispiel.de.\n\nKapitel 2 Ausblick\n\nDie nächste Ausgabe erscheint am Freitag.",
  );
  const [announcement, setAnnouncement] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const settingsCloseButtonRef = useRef<HTMLButtonElement>(null);

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
      };
      if (parsed.items?.length) {
        const frame = window.requestAnimationFrame(() => {
          setItems(parsed.items);
          setBookTitle(parsed.bookTitle);
          setAnalysisMode(parsed.analysisMode);
          setAnalysisNotice(parsed.analysisNotice);
          setSelectedId(parsed.items.find((item) => item.state === "open")?.id ?? parsed.items[0].id);
        });
        return () => window.cancelAnimationFrame(frame);
      }
    } catch {
      window.localStorage.removeItem("braille-qa-session-v2");
    }
  }, []);

  useEffect(() => {
    if (analysisMode === "demo") return;
    window.localStorage.setItem("braille-qa-session-v2", JSON.stringify({
      items,
      bookTitle,
      analysisMode,
      analysisNotice,
    }));
  }, [items, bookTitle, analysisMode, analysisNotice]);

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
    setAnalysisProgress(5);
    setAnalysisNotice("Das Buch wird kapitelweise geprüft.");

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
        setAnalysisProgress(Math.round(((start + batch.length) / parsedItems.length) * 90) + 5);
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

  function startImport() {
    const parsed = parseBook(importText);
    if (!parsed.length) {
      setAnnouncement("Bitte zuerst einen Buchtext eingeben.");
      return;
    }
    void analyzeBook(parsed, importTitle);
  }

  function readTextFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5_000_000) {
      setAnnouncement("Die Datei ist größer als 5 MB. Bitte eine kleinere Textfassung verwenden.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImportText(String(reader.result ?? ""));
      setImportTitle(file.name.replace(/\.(txt|md)$/i, ""));
      setAnnouncement(`Datei „${file.name}“ wurde geladen.`);
    };
    reader.readAsText(file);
  }

  function downloadReport() {
    const report = {
      book: bookTitle,
      generatedAt: new Date().toISOString(),
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

  if (!selected) return null;

  return (
    <main className="app-shell">
      <a className="skip-link" href="#review-detail">Zur aktuellen Prüfstelle springen</a>

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
          <button className="button button-secondary" type="button" onClick={() => setShowImport(true)}>
            Buch wechseln
          </button>
        </div>
      </header>

      <section className="document-bar" aria-labelledby="document-title">
        <div>
          <p className="eyebrow">Aktuelles Buch</p>
          <h2 id="document-title">{bookTitle}</h2>
          <p className="document-subtitle">{chapters.length} Kapitel · {items.length} prüfbare Abschnitte · Sitzung wird lokal gespeichert</p>
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
                  <strong>{item.original}</strong>
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
            <section className="text-panel"><div className="text-panel-label"><span>01</span><h3>Schwarzschrift-Original</h3></div><p>{selected.original}</p></section>
            <section className="text-panel braille-panel" lang="de-Brai"><div className="text-panel-label"><span>02</span><h3>Braille-Ausgabe</h3></div><p className="braille-text">{selected.braille}</p><small>Demonstrator-Vollschrift · produktiv durch aktuelle dzb-Liblouis-Tabelle ersetzen</small></section>
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

      <footer className="app-footer"><span>Barrierefreier Demonstrator · Tastatur- und Screenreader-bedienbar</span><button type="button" onClick={downloadReport}>Prüfbericht herunterladen</button></footer>
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
              <button className="button button-primary" type="button" onClick={() => { setIsReleased(false); setShowImport(true); }}>Neues Buch</button>
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
              <div><p className="eyebrow">Schritt 1 von 3</p><h2 id="import-title">Buch oder Kapitel importieren</h2></div>
              <button className="icon-button" ref={closeButtonRef} type="button" aria-label="Import schließen" onClick={() => setShowImport(false)}>×</button>
            </div>
            <p className="modal-intro">TXT- oder Markdown-Datei auswählen. Kapitelüberschriften wie „Kapitel 1 …“ werden automatisch erkannt.</p>
            <label className="field-label" htmlFor="book-title">Titel</label>
            <input className="text-input" id="book-title" value={importTitle} onChange={(event) => setImportTitle(event.target.value)} />
            <label className="file-drop">
              <span className="file-drop-icon" aria-hidden="true">↑</span>
              <span><strong>TXT- oder Markdown-Datei auswählen</strong><small>bis 5 MB · der Text wird kapitelweise verarbeitet</small></span>
              <input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={readTextFile} />
            </label>
            <div className="or-divider"><span>oder Text einfügen</span></div>
            <label className="field-label" htmlFor="book-text">Buchtext</label>
            <textarea id="book-text" rows={9} value={importText} onChange={(event) => setImportText(event.target.value)} />
            <div className="import-assurance"><span aria-hidden="true">✓</span><p><strong>Sicherer Ablauf</strong>Unauffällige Abschnitte werden automatisch freigegeben. Unsichere Fälle bleiben immer in Ihrer Arbeitsliste.</p></div>
            <div className="modal-actions"><button className="button button-ghost" type="button" onClick={() => setShowImport(false)}>Abbrechen</button><button className="button button-primary" type="button" onClick={startImport}>Buch analysieren</button></div>
          </section>
        </div>
      )}

      {isAnalyzing && (
        <div className="analysis-overlay" role="status" aria-live="polite">
          <div className="analysis-card">
            <div className="analysis-mark" aria-hidden="true">⠿</div>
            <p className="eyebrow">Automatische Vorprüfung</p>
            <h2>{bookTitle} wird analysiert</h2>
            <p>Kapitel werden strukturiert, Braille wird erzeugt und Risikostellen werden priorisiert.</p>
            <div className="analysis-progress"><span style={{ width: `${analysisProgress}%` }} /></div>
            <strong>{analysisProgress}%</strong>
            <small>Sie können danach direkt mit den wichtigsten Stellen beginnen.</small>
          </div>
        </div>
      )}
    </main>
  );
}
