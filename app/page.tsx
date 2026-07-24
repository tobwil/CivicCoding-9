"use client";

import { ChangeEvent, useMemo, useState } from "react";

type Risk = "high" | "medium" | "low";
type ReviewState = "open" | "confirmed" | "corrected" | "dismissed";
type Filter = "all" | "high" | "medium" | "open";

type ReviewItem = {
  id: number;
  original: string;
  backTranslation: string;
  braille: string;
  risk: Risk;
  reason: string;
  rule: string;
  state: ReviewState;
};

const brailleLetters: Record<string, string> = {
  a: "⠁", b: "⠃", c: "⠉", d: "⠙", e: "⠑", f: "⠋", g: "⠛",
  h: "⠓", i: "⠊", j: "⠚", k: "⠅", l: "⠇", m: "⠍", n: "⠝",
  o: "⠕", p: "⠏", q: "⠟", r: "⠗", s: "⠎", t: "⠞", u: "⠥",
  v: "⠧", w: "⠺", x: "⠭", y: "⠽", z: "⠵", ä: "⠜", ö: "⠪",
  ü: "⠳", ß: "⠮", ",": "⠂", ".": "⠲", "-": "⠤", ":": "⠒",
  ";": "⠆", "?": "⠢", "!": "⠖", "/": "⠌", "%": "⠨⠴",
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
    const lower = character.toLowerCase();
    const capital = character !== lower && /[A-ZÄÖÜ]/.test(character) ? "⠠" : "";
    return capital + (brailleLetters[lower] ?? "⠿");
  }).join("");
}

const sampleItems: ReviewItem[] = [
  {
    id: 1,
    original: "Die neue Linie ist 12,5 km² groß und startet am 1. August.",
    backTranslation: "Die neue Linie ist 125 km2 groß und startet am 1 August.",
    braille: toBraille("Die neue Linie ist 12,5 km² groß und startet am 1. August."),
    risk: "high",
    reason: "Zahl, Dezimaltrennzeichen oder Maßeinheit könnten verändert worden sein.",
    rule: "ZAHL-04 · Zahlen und Maßeinheiten",
    state: "open",
  },
  {
    id: 2,
    original: "Dr. Miriam Vogel leitet das neue Projekt.",
    backTranslation: "Dr Miriam Vogel leitet das neue Projekt.",
    braille: toBraille("Dr. Miriam Vogel leitet das neue Projekt."),
    risk: "medium",
    reason: "Abkürzung mit nachfolgendem Eigennamen erkannt.",
    rule: "ABK-02 · Abkürzungen im Satz",
    state: "open",
  },
  {
    id: 3,
    original: "Das KI-System priorisiert auffällige Textstellen.",
    backTranslation: "Das KI System priorisiert auffällige Textstellen.",
    braille: toBraille("Das KI-System priorisiert auffällige Textstellen."),
    risk: "medium",
    reason: "Bindestrich in einer Wortzusammensetzung fehlt in der Rückübersetzung.",
    rule: "WORT-07 · Zusammensetzungen",
    state: "open",
  },
  {
    id: 4,
    original: "Die EU-Kommission veröffentlicht ihre Empfehlung im Herbst.",
    backTranslation: "Die EU Kommission veröffentlicht ihre Empfehlung im Herbst.",
    braille: toBraille("Die EU-Kommission veröffentlicht ihre Empfehlung im Herbst."),
    risk: "medium",
    reason: "Großschreibung und Bindestrich bei einer Institution prüfen.",
    rule: "NAME-03 · Institutionen und Eigennamen",
    state: "open",
  },
  {
    id: 5,
    original: "Weitere Informationen stehen unter www.dzblesen.de bereit.",
    backTranslation: "Weitere Informationen stehen unter www dzblesen de bereit.",
    braille: toBraille("Weitere Informationen stehen unter www.dzblesen.de bereit."),
    risk: "high",
    reason: "Webadresse enthält mehrere bedeutungstragende Sonderzeichen.",
    rule: "WEB-01 · URLs und E-Mail-Adressen",
    state: "open",
  },
  {
    id: 6,
    original: "Die Redaktion veröffentlicht die nächste Ausgabe am Freitag.",
    backTranslation: "Die Redaktion veröffentlicht die nächste Ausgabe am Freitag.",
    braille: toBraille("Die Redaktion veröffentlicht die nächste Ausgabe am Freitag."),
    risk: "low",
    reason: "Original und Rückübersetzung stimmen strukturell überein.",
    rule: "BASIS-01 · Strukturvergleich",
    state: "confirmed",
  },
];

function classifySegment(text: string, id: number): ReviewItem {
  const isWeb = /(https?:\/\/|www\.|[\w.-]+@[\w.-]+)/i.test(text);
  const hasNumber = /\d/.test(text);
  const hasAbbreviation = /\b(?:Dr|Prof|bzw|z\. B)\./i.test(text);
  const hasHyphen = /[\p{L}]-[\p{L}]/u.test(text);
  const risk: Risk = isWeb || hasNumber ? "high" : hasAbbreviation || hasHyphen ? "medium" : "low";
  const reason = isWeb
    ? "Webadresse oder E-Mail-Adresse mit bedeutungstragenden Sonderzeichen erkannt."
    : hasNumber
      ? "Zahl, Datum oder Maßeinheit sollte mit dem Original verglichen werden."
      : hasAbbreviation
        ? "Kontextabhängige Abkürzung erkannt."
        : hasHyphen
          ? "Wortzusammensetzung mit Bindestrich erkannt."
          : "Keine Auffälligkeit durch das aktuelle Regelset erkannt.";
  const rule = isWeb ? "WEB-01 · URLs und E-Mail-Adressen"
    : hasNumber ? "ZAHL-04 · Zahlen und Maßeinheiten"
      : hasAbbreviation ? "ABK-02 · Abkürzungen im Satz"
        : hasHyphen ? "WORT-07 · Zusammensetzungen"
          : "BASIS-01 · Strukturvergleich";

  return {
    id,
    original: text,
    backTranslation: text,
    braille: toBraille(text),
    risk,
    reason,
    rule,
    state: risk === "low" ? "confirmed" : "open",
  };
}

const riskLabel: Record<Risk, string> = {
  high: "Hohes Risiko",
  medium: "Prüfen",
  low: "Unauffällig",
};

const stateLabel: Record<ReviewState, string> = {
  open: "Offen",
  confirmed: "Bestätigt",
  corrected: "Korrigiert",
  dismissed: "Fehlalarm",
};

export default function Home() {
  const [items, setItems] = useState(sampleItems);
  const [selectedId, setSelectedId] = useState(1);
  const [filter, setFilter] = useState<Filter>("all");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState(
    "Ab dem 1. Januar gelten neue Regeln. Dr. Weber stellt das KI-System vor. Weitere Hinweise stehen unter www.beispiel.de.",
  );
  const [announcement, setAnnouncement] = useState("");

  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const openCount = items.filter((item) => item.state === "open").length;
  const highCount = items.filter((item) => item.risk === "high" && item.state === "open").length;
  const reviewedCount = items.length - openCount;
  const progress = Math.round((reviewedCount / items.length) * 100);

  const visibleItems = useMemo(() => items.filter((item) => {
    if (filter === "all") return true;
    if (filter === "open") return item.state === "open";
    return item.risk === filter;
  }), [filter, items]);

  function updateState(state: ReviewState) {
    setItems((current) => current.map((item) =>
      item.id === selected.id ? { ...item, state } : item,
    ));
    const label = stateLabel[state];
    setAnnouncement(`Prüfstelle ${selected.id} wurde als „${label}“ gespeichert.`);

    const currentIndex = visibleItems.findIndex((item) => item.id === selected.id);
    const next = visibleItems.slice(currentIndex + 1).find((item) => item.state === "open");
    if (next) setSelectedId(next.id);
  }

  function runImport() {
    const segments = importText
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 12);
    if (!segments.length) {
      setAnnouncement("Bitte zuerst einen Text eingeben.");
      return;
    }
    const importedItems = segments.map((segment, index) => classifySegment(segment, index + 1));
    setItems(importedItems);
    setSelectedId(1);
    setFilter("all");
    setShowImport(false);
    setAnnouncement(`${importedItems.length} Textabschnitte wurden analysiert.`);
  }

  function readTextFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportText(String(reader.result ?? ""));
      setAnnouncement(`Datei „${file.name}“ wurde geladen.`);
    };
    reader.readAsText(file);
  }

  return (
    <main className="app-shell">
      <a className="skip-link" href="#review-detail">Zur aktuellen Prüfstelle springen</a>

      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">⠿</div>
          <div>
            <p className="eyebrow">dzb lesen · Pilot</p>
            <h1>Braille QA Copilot</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="prototype-badge">Prototyp-Regelwerk</span>
          <button className="button button-primary" type="button" onClick={() => setShowImport(true)}>
            <span aria-hidden="true">＋</span> Artikel importieren
          </button>
        </div>
      </header>

      <section className="document-bar" aria-labelledby="document-title">
        <div>
          <p className="eyebrow">Aktueller Produktionslauf</p>
          <h2 id="document-title">Mobilität &amp; Gesellschaft · Ausgabe 07/2026</h2>
        </div>
        <div className="run-meta" aria-label="Produktionsinformationen">
          <span><strong>DE-Kurzschrift</strong><small>Regeltabelle</small></span>
          <span><strong>1.284 Wörter</strong><small>Umfang</small></span>
          <span><strong>vor 3 Min.</strong><small>Analysiert</small></span>
        </div>
      </section>

      <section className="summary-grid" aria-label="Prüfstatus">
        <article className="metric metric-critical">
          <span className="metric-icon" aria-hidden="true">!</span>
          <div><strong>{highCount}</strong><span>Kritische Stellen</span></div>
          <small>Zahlen, URLs oder Einheiten</small>
        </article>
        <article className="metric">
          <span className="metric-icon metric-icon-amber" aria-hidden="true">?</span>
          <div><strong>{openCount}</strong><span>Noch zu prüfen</span></div>
          <small>nach Risiko priorisiert</small>
        </article>
        <article className="metric">
          <span className="metric-icon metric-icon-green" aria-hidden="true">✓</span>
          <div><strong>{reviewedCount}</strong><span>Bereits geprüft</span></div>
          <small>Entscheidungen gespeichert</small>
        </article>
        <article className="metric progress-card">
          <div className="progress-copy">
            <strong>{progress}%</strong><span>Fortschritt</span>
          </div>
          <div className="progress-track" role="progressbar" aria-label="Prüffortschritt" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <small>{reviewedCount} von {items.length} Abschnitten freigegeben</small>
        </article>
      </section>

      <section className="workspace" aria-label="Korrekturarbeitsplatz">
        <aside className="review-list" aria-labelledby="review-list-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Prüfwarteschlange</p>
              <h2 id="review-list-title">Auffällige Stellen</h2>
            </div>
            <span className="count-badge">{visibleItems.length}</span>
          </div>

          <div className="filters" aria-label="Prüfstellen filtern">
            {([
              ["all", "Alle"],
              ["open", "Offen"],
              ["high", "Kritisch"],
              ["medium", "Prüfen"],
            ] as [Filter, string][]).map(([value, label]) => (
              <button
                className={filter === value ? "filter active" : "filter"}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                key={value}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="queue" role="list">
            {visibleItems.map((item) => (
              <button
                className={`queue-item ${selected.id === item.id ? "selected" : ""}`}
                type="button"
                onClick={() => setSelectedId(item.id)}
                aria-current={selected.id === item.id ? "true" : undefined}
                role="listitem"
                key={item.id}
              >
                <span className={`risk-dot risk-${item.risk}`} aria-hidden="true" />
                <span className="queue-copy">
                  <span className="queue-meta">
                    <span>Abschnitt {String(item.id).padStart(2, "0")}</span>
                    <span className={`state state-${item.state}`}>{stateLabel[item.state]}</span>
                  </span>
                  <strong>{item.original}</strong>
                  <small>{item.reason}</small>
                </span>
              </button>
            ))}
            {!visibleItems.length && (
              <p className="empty-state">Für diesen Filter gibt es keine Prüfstellen.</p>
            )}
          </div>
        </aside>

        <article className="review-detail" id="review-detail" tabIndex={-1} aria-labelledby="detail-title">
          <div className="panel-heading detail-heading">
            <div>
              <div className="detail-kicker">
                <span className={`risk-pill risk-pill-${selected.risk}`}>{riskLabel[selected.risk]}</span>
                <span>Abschnitt {String(selected.id).padStart(2, "0")}</span>
              </div>
              <h2 id="detail-title">Original und Rückübersetzung vergleichen</h2>
            </div>
            <span className={`state state-${selected.state}`}>{stateLabel[selected.state]}</span>
          </div>

          <div className="comparison-grid">
            <section className="text-panel">
              <div className="text-panel-label"><span>01</span><h3>Schwarzschrift-Original</h3></div>
              <p>{selected.original}</p>
            </section>
            <section className="text-panel braille-panel" lang="de-Brai">
              <div className="text-panel-label"><span>02</span><h3>Braille-Ausgabe</h3></div>
              <p className="braille-text">{selected.braille}</p>
              <small>Prototypische Vollschrift · noch nicht produktionsgeeignet</small>
            </section>
            <section className="text-panel back-panel">
              <div className="text-panel-label"><span>03</span><h3>Rückübersetzung</h3></div>
              <p>{selected.backTranslation}</p>
            </section>
          </div>

          <section className={`finding finding-${selected.risk}`} aria-labelledby="finding-title">
            <div className="finding-symbol" aria-hidden="true">{selected.risk === "high" ? "!" : selected.risk === "medium" ? "?" : "✓"}</div>
            <div>
              <p className="eyebrow" id="finding-title">Begründung des Prüfvorschlags</p>
              <strong>{selected.reason}</strong>
              <small>{selected.rule}</small>
            </div>
          </section>

          <div className="decision-bar">
            <div>
              <p className="eyebrow">Menschliche Entscheidung</p>
              <span>Die endgültige Freigabe bleibt bei der Fachkraft.</span>
            </div>
            <div className="decision-actions">
              <button className="button button-ghost" type="button" onClick={() => updateState("dismissed")}>
                Fehlalarm
              </button>
              <button className="button button-secondary" type="button" onClick={() => updateState("confirmed")}>
                Als korrekt bestätigen
              </button>
              <button className="button button-primary" type="button" onClick={() => updateState("corrected")}>
                Korrektur speichern
              </button>
            </div>
          </div>
        </article>
      </section>

      <footer className="app-footer">
        <span>Lokaler Demonstrator · keine Inhalte werden übertragen</span>
        <span>Regelsatz: Demo 0.1 · Letzte Änderung wird protokolliert</span>
      </footer>

      <p className="sr-only" aria-live="polite">{announcement}</p>

      {showImport && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Neuer Produktionslauf</p>
                <h2 id="import-title">Artikel importieren</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Import schließen" onClick={() => setShowImport(false)}>×</button>
            </div>
            <p>Text einfügen oder eine UTF-8-Textdatei auswählen. Die Analyse läuft ausschließlich in diesem Browser.</p>
            <label className="file-picker">
              <span>Textdatei auswählen</span>
              <input type="file" accept=".txt,text/plain" onChange={readTextFile} />
            </label>
            <label className="textarea-label" htmlFor="article-text">Artikeltext</label>
            <textarea id="article-text" rows={9} value={importText} onChange={(event) => setImportText(event.target.value)} />
            <div className="modal-actions">
              <button className="button button-ghost" type="button" onClick={() => setShowImport(false)}>Abbrechen</button>
              <button className="button button-primary" type="button" onClick={runImport}>Text analysieren</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
