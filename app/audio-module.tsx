"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  BookImportResult,
  parseEpub,
  parseTextBook,
} from "@/lib/book-import";
import {
  createSpeechSegments,
  SpeechSegment,
} from "@/lib/speech-preparation";
import {
  audioEpubFileName,
  buildAudioEpub,
} from "@/lib/audio-epub-export";

type ApiStatus = "checking" | "server" | "session" | "missing";
type AudioStage = "onboarding" | "preview" | "workspace";
type AudioReviewState = "open" | "approved";
type Voice = "alloy" | "echo" | "fable" | "nova" | "onyx" | "shimmer";

type ReviewSegment = SpeechSegment & {
  state: AudioReviewState;
  audioUrl?: string;
  durationSeconds?: number;
};

type AudioModuleProps = {
  apiStatus: ApiStatus;
  onOpenSettings: () => void;
};

const voiceOptions: Array<{ id: Voice; label: string; character: string }> = [
  { id: "nova", label: "Nova", character: "klar und lebendig" },
  { id: "onyx", label: "Onyx", character: "ruhig und tief" },
  { id: "shimmer", label: "Shimmer", character: "hell und freundlich" },
  { id: "alloy", label: "Alloy", character: "neutral und ausgewogen" },
];

function formatLabel(format: BookImportResult["format"]) {
  return format === "epub" ? "EPUB 3" : format === "markdown" ? "Markdown" : "TXT";
}

export default function AudioModule({ apiStatus, onOpenSettings }: AudioModuleProps) {
  const [stage, setStage] = useState<AudioStage>("onboarding");
  const [preview, setPreview] = useState<BookImportResult | null>(null);
  const [segments, setSegments] = useState<ReviewSegment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<Voice>("nova");
  const [isReading, setIsReading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [showWholeDocument, setShowWholeDocument] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const audioUrlsRef = useRef(new Set<string>());

  useEffect(() => () => {
    for (const url of audioUrlsRef.current) URL.revokeObjectURL(url);
  }, []);

  const selected = segments.find((segment) => segment.id === selectedId) ?? segments[0];
  const approvedCount = segments.filter((segment) => segment.state === "approved").length;
  const audioCount = segments.filter((segment) => segment.audioUrl).length;
  const selectedCount = selectedIds.size;
  const selectedWithAudioCount = segments.filter((segment) => selectedIds.has(segment.id) && segment.audioUrl).length;
  const selectedMissingAudioCount = selectedCount - selectedWithAudioCount;
  const exportReady = segments.length > 0
    && approvedCount === segments.length
    && audioCount === segments.length;
  const progress = segments.length ? Math.round((approvedCount / segments.length) * 100) : 0;
  const chapters = useMemo(() => {
    const map = new Map<string, { id: string; title: string; count: number }>();
    for (const segment of segments) {
      const chapter = map.get(segment.chapterId);
      if (chapter) chapter.count += 1;
      else map.set(segment.chapterId, {
        id: segment.chapterId,
        title: segment.chapterTitle,
        count: 1,
      });
    }
    return Array.from(map.values());
  }, [segments]);

  function resetImport() {
    for (const url of audioUrlsRef.current) URL.revokeObjectURL(url);
    audioUrlsRef.current.clear();
    setPreview(null);
    setSegments([]);
    setSelectedIds(new Set());
    setStage("onboarding");
    setError("");
    setShowWholeDocument(false);
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsReading(true);
    setError("");
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      const result = extension === "epub"
        ? await parseEpub(file)
        : parseTextBook(
          await file.text(),
          file.name.replace(/\.(txt|md|markdown)$/i, ""),
          extension === "md" || extension === "markdown" ? "markdown" : "text",
        );
      if (!result.blocks.length) throw new Error("Das Dokument enthält keine lesbaren Textabschnitte.");
      setPreview(result);
      setTitle(result.title);
      setStage("preview");
      setAnnouncement(`${result.blocks.length} Abschnitte wurden erkannt.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Die Datei konnte nicht gelesen werden.");
    } finally {
      setIsReading(false);
    }
  }

  function previewText() {
    if (!text.trim()) {
      setError("Bitte zuerst Text eingeben oder eine Datei auswählen.");
      return;
    }
    const result = parseTextBook(text, title, "text");
    setPreview(result);
    setTitle(result.title);
    setStage("preview");
    setError("");
    setAnnouncement(`${result.blocks.length} Abschnitte wurden erkannt.`);
  }

  function startProduction() {
    if (!preview) return;
    const prepared = createSpeechSegments(preview.blocks).map((segment) => ({
      ...segment,
      state: "open" as const,
    }));
    setSegments(prepared);
    setSelectedIds(new Set());
    setSelectedId(prepared[0]?.id ?? "");
    setStage("workspace");
    setError("");
    setAnnouncement(`${prepared.length} Sprechabschnitte sind zur Hörprüfung bereit.`);
  }

  function updateSpoken(value: string) {
    if (!selected) return;
    setSegments((current) => current.map((segment) => {
      if (segment.id !== selected.id) return segment;
      if (segment.audioUrl) {
        URL.revokeObjectURL(segment.audioUrl);
        audioUrlsRef.current.delete(segment.audioUrl);
      }
      return {
        ...segment,
        spoken: value,
        audioUrl: undefined,
        durationSeconds: undefined,
        state: "open",
      };
    }));
  }

  async function requestAudio(spoken: string) {
    const sessionApiKey = window.sessionStorage.getItem("braille-qa-openai-key");
    const response = await fetch("/api/audio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionApiKey ? { "x-openai-api-key": sessionApiKey } : {}),
      },
      body: JSON.stringify({ text: spoken, voice }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? "Die Sprachausgabe konnte nicht erzeugt werden.");
    }
    const url = URL.createObjectURL(await response.blob());
    audioUrlsRef.current.add(url);
    const durationSeconds = await new Promise<number | undefined>((resolve) => {
      const audio = new Audio();
      audio.preload = "metadata";
      audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) ? audio.duration : undefined);
      audio.onerror = () => resolve(undefined);
      audio.src = url;
    });
    return { url, durationSeconds };
  }

  function storeAudio(id: string, url: string, durationSeconds?: number) {
    setSegments((current) => current.map((segment) => {
      if (segment.id !== id) return segment;
      if (segment.audioUrl) {
        URL.revokeObjectURL(segment.audioUrl);
        audioUrlsRef.current.delete(segment.audioUrl);
      }
      return { ...segment, audioUrl: url, durationSeconds, state: "open" };
    }));
  }

  function ensureOpenAiConnection() {
    if (apiStatus === "server" || apiStatus === "session") return true;
    setError("Verbinden Sie zuerst OpenAI in den Einstellungen.");
    onOpenSettings();
    return false;
  }

  async function generateAudio() {
    if (!selected?.spoken.trim() || !ensureOpenAiConnection()) return;

    setIsGenerating(true);
    setError("");
    try {
      const generated = await requestAudio(selected.spoken);
      storeAudio(selected.id, generated.url, generated.durationSeconds);
      setAnnouncement("Die Sprachausgabe ist bereit.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Die Sprachausgabe konnte nicht erzeugt werden.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function generateSelectedAudio() {
    if (!selectedIds.size || !ensureOpenAiConnection()) return;
    const targets = segments.filter((segment) => selectedIds.has(segment.id) && !segment.audioUrl);
    if (!targets.length) {
      setError("Für die Auswahl sind bereits alle Audiofassungen vorhanden.");
      return;
    }
    setIsBulkGenerating(true);
    setError("");
    try {
      for (let index = 0; index < targets.length; index += 1) {
        const target = targets[index];
        setBulkProgress(`${index + 1} von ${targets.length}`);
        const generated = await requestAudio(target.spoken);
        storeAudio(target.id, generated.url, generated.durationSeconds);
      }
      setAnnouncement(`${targets.length} ausgewählte Audiofassungen wurden erzeugt.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Die Sammelerzeugung wurde unterbrochen.");
    } finally {
      setBulkProgress("");
      setIsBulkGenerating(false);
    }
  }

  function approveSelected() {
    if (!selected?.audioUrl) return;
    const nextSegments = segments.map((segment) => (
      segment.id === selected.id ? { ...segment, state: "approved" as const } : segment
    ));
    setSegments(nextSegments);
    const next = nextSegments.find((segment) => segment.state === "open" && segment.id !== selected.id);
    if (next) setSelectedId(next.id);
    setAnnouncement("Abschnitt wurde nach der Hörprüfung freigegeben.");
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllSegments() {
    setSelectedIds((current) => (
      current.size === segments.length
        ? new Set()
        : new Set(segments.map((segment) => segment.id))
    ));
  }

  function approveSelection() {
    if (!selectedIds.size) return;
    const withoutAudio = segments.filter((segment) => selectedIds.has(segment.id) && !segment.audioUrl);
    if (withoutAudio.length) {
      setError(`${withoutAudio.length} ausgewählte Abschnitte haben noch keine Audiofassung.`);
      return;
    }
    setSegments((current) => current.map((segment) => (
      selectedIds.has(segment.id) ? { ...segment, state: "approved" as const } : segment
    )));
    setSelectedIds(new Set());
    setError("");
    setAnnouncement(`${selectedIds.size} Abschnitte wurden gemeinsam freigegeben.`);
  }

  function approveAll() {
    if (audioCount !== segments.length) {
      setError(`Für „Alle freigeben“ fehlen noch ${segments.length - audioCount} Audiofassungen.`);
      return;
    }
    setSegments((current) => current.map((segment) => ({ ...segment, state: "approved" })));
    setSelectedIds(new Set());
    setError("");
    setAnnouncement("Alle Audiofassungen wurden gemeinsam freigegeben.");
  }

  async function exportAudioEpub() {
    if (!exportReady) {
      setError("Der vollständige Export ist bereit, sobald alle Abschnitte Audio besitzen und freigegeben sind.");
      return;
    }
    setIsExporting(true);
    setError("");
    try {
      const exportSegments = await Promise.all(segments.map(async (segment) => ({
        id: segment.id,
        chapterId: segment.chapterId,
        chapterTitle: segment.chapterTitle,
        kind: segment.kind,
        spoken: segment.spoken,
        audio: new Uint8Array(await (await fetch(segment.audioUrl!)).arrayBuffer()),
        durationSeconds: segment.durationSeconds,
      })));
      const bytes = await buildAudioEpub({
        title,
        language: preview?.language || "de",
        voice: voiceOptions.find((option) => option.id === voice)?.label || voice,
        segments: exportSegments,
      });
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/epub+zip" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = audioEpubFileName(title);
      anchor.click();
      URL.revokeObjectURL(url);
      setAnnouncement("Das navigierbare EPUB-3-Hörmedium wurde exportiert.");
    } catch {
      setError("Das Hörmedium konnte nicht verpackt werden.");
    } finally {
      setIsExporting(false);
    }
  }

  if (stage === "onboarding") {
    return (
      <section className="audio-onboarding" aria-labelledby="audio-onboarding-title">
        <div className="audio-onboarding-copy">
          <p className="onboarding-kicker"><span aria-hidden="true">▶</span> Hörmedien · zweiter Leseweg</p>
          <h2 id="audio-onboarding-title">Vom Dokument zur geprüften Sprechfassung.</h2>
          <p className="onboarding-lead">
            Importieren Sie eine Ausgabe, prüfen Sie automatisch vorbereitete Sprechtexte und hören Sie jeden
            Abschnitt direkt gegen. So entsteht schneller eine belastbare Grundlage für Audio- und DAISY-Produkte.
          </p>
          <label className="file-drop file-drop-primary audio-file-drop">
            <span className="file-drop-icon" aria-hidden="true">{isReading ? "…" : "↑"}</span>
            <span>
              <strong>{isReading ? "Dokument wird strukturiert …" : "EPUB, TXT oder Markdown auswählen"}</strong>
              <small>EPUB bis 50 MB · vollständige Kapitel und Lesereihenfolge</small>
            </span>
            <input
              type="file"
              disabled={isReading}
              accept=".epub,.txt,.md,.markdown,application/epub+zip,text/plain,text/markdown"
              onChange={(event) => void readFile(event)}
            />
          </label>
          <div className="or-divider"><span>oder Text einfügen</span></div>
          <label className="field-label" htmlFor="audio-title">Titel</label>
          <input
            className="text-input"
            id="audio-title"
            placeholder="Titel des Dokuments"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <label className="field-label" htmlFor="audio-source-text">Dokumenttext</label>
          <textarea
            id="audio-source-text"
            rows={7}
            placeholder="Text hier einfügen …"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          {error && <p className="import-error" role="alert">{error}</p>}
          <div className="audio-start-actions">
            <p>Die Struktur bleibt vollständig. Audio wird erst nach Ihrer Auswahl abschnittsweise erzeugt.</p>
            <button className="button button-primary" type="button" disabled={!text.trim()} onClick={previewText}>
              Eingabe prüfen
            </button>
          </div>
        </div>
        <aside className="audio-onboarding-summary" aria-label="Ablauf der Hörmedien-Produktion">
          <p className="eyebrow">In drei kontrollierbaren Schritten</p>
          <ol>
            <li><span>01</span><div><strong>Struktur übernehmen</strong><small>Kapitel und Lesereihenfolge aus EPUB</small></div></li>
            <li><span>02</span><div><strong>Sprechtext vorbereiten</strong><small>Abkürzungen, Zahlen und Einheiten verständlich machen</small></div></li>
            <li><span>03</span><div><strong>Hören und freigeben</strong><small>KI-Stimme abschnittsweise kontrollieren</small></div></li>
          </ol>
          <div className={`audio-connection connection-card ${apiStatus === "server" || apiStatus === "session" ? "connection-card-success" : ""}`}>
            <span className={`connection-dot connection-${apiStatus}`} aria-hidden="true" />
            <div>
              <strong>{apiStatus === "server" || apiStatus === "session" ? "Sprachausgabe ist bereit" : "OpenAI noch nicht verbunden"}</strong>
              <p>{apiStatus === "server" || apiStatus === "session" ? "Audio kann nach dem Import sofort erzeugt werden." : "Import und Sprechtext funktionieren bereits; für Audio verbinden Sie OpenAI."}</p>
            </div>
            {apiStatus !== "server" && apiStatus !== "session" && (
              <button className="button button-ghost" type="button" onClick={onOpenSettings}>OpenAI verbinden</button>
            )}
          </div>
        </aside>
        <p className="sr-only" aria-live="polite">{announcement}</p>
      </section>
    );
  }

  if (stage === "preview" && preview) {
    return (
      <section className="audio-preview" aria-labelledby="audio-preview-title">
        <div className="audio-section-heading">
          <div>
            <p className="eyebrow">Hörmedien · Strukturvorschau</p>
            <h2 id="audio-preview-title">Ist die erkannte Lesereihenfolge korrekt?</h2>
          </div>
          <button className="button button-ghost" type="button" onClick={resetImport}>Anderes Dokument</button>
        </div>
        <div className="audio-preview-card">
          <div className="preview-summary">
            <div>
              <span className={`format-badge format-${preview.format}`}>{formatLabel(preview.format)}</span>
              <h3>{preview.title}</h3>
              <p>{[preview.author, preview.language, preview.fileName].filter(Boolean).join(" · ") || "Eingefügter Text"}</p>
            </div>
            <div className="preview-numbers">
              <span><strong>{preview.chapters.length}</strong> Kapitel</span>
              <span><strong>{preview.blocks.length}</strong> Sprechabschnitte</span>
            </div>
          </div>
          <ol className="chapter-preview-list">
            {preview.chapters.map((chapter, index) => (
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
            aria-expanded={showWholeDocument}
            onClick={() => setShowWholeDocument((value) => !value)}
          >
            <span><strong>{showWholeDocument ? "Dokumentvorschau schließen" : "Gesamten Import ansehen"}</strong><small>Alle erkannten Texte in Lesereihenfolge</small></span>
            <span aria-hidden="true">{showWholeDocument ? "−" : "+"}</span>
          </button>
          {showWholeDocument && (
            <div className="import-document-preview audio-document-preview">
              {preview.chapters.map((chapter) => (
                <section key={chapter.id}>
                  <h3>{chapter.title}</h3>
                  {preview.blocks.filter((block) => block.chapterId === chapter.id).map((block) => (
                    <p key={block.id}>{block.text}</p>
                  ))}
                </section>
              ))}
            </div>
          )}
          <div className="audio-preview-actions">
            <div><strong>Noch keine Audiokosten</strong><p>Die Sprachausgabe wird später nur für den jeweils ausgewählten Abschnitt erzeugt.</p></div>
            <button className="button button-primary" type="button" onClick={startProduction}>Sprechfassung vorbereiten</button>
          </div>
        </div>
        <p className="sr-only" aria-live="polite">{announcement}</p>
      </section>
    );
  }

  if (!selected) return null;

  return (
    <>
      <section className="document-bar audio-document-bar" aria-labelledby="audio-document-title">
        <div>
          <p className="eyebrow">Hörmedien · Sprechfassung und Hörprüfung</p>
          <h2 id="audio-document-title">{title}</h2>
          <p className="document-subtitle">{chapters.length} Kapitel · {segments.length} Sprechabschnitte · {approvedCount} freigegeben</p>
        </div>
        <div className="audio-document-actions">
          <label htmlFor="audio-voice">Stimme</label>
          <select id="audio-voice" value={voice} onChange={(event) => setVoice(event.target.value as Voice)}>
            {voiceOptions.map((option) => (
              <option value={option.id} key={option.id}>{option.label} · {option.character}</option>
            ))}
          </select>
          <button className="button button-secondary" type="button" onClick={resetImport}>Dokument wechseln</button>
        </div>
      </section>

      <section className={`outcome-banner ${approvedCount === segments.length ? "outcome-complete" : ""}`} aria-live="polite">
        <div className="outcome-icon" aria-hidden="true">{approvedCount === segments.length ? "✓" : segments.length - approvedCount}</div>
        <div className="outcome-copy">
          <p className="eyebrow">{approvedCount === segments.length ? "Hörprüfung abgeschlossen" : "Ihre Aufgabe"}</p>
          <h2>{approvedCount === segments.length ? "Alle Sprechabschnitte sind freigegeben." : `Noch ${segments.length - approvedCount} Abschnitte anhören und bestätigen.`}</h2>
          <p>Der Sprechtext ist automatisch vorbereitet. Sie behalten Text, Stimme und Freigabe in der Hand.</p>
        </div>
        <div className="outcome-actions">
          <button className="button button-secondary" type="button" onClick={() => document.getElementById("audio-export")?.scrollIntoView({ behavior: "smooth" })}>
            Export ansehen
          </button>
        </div>
      </section>

      <section className="focus-progress" aria-label="Fortschritt der Hörprüfung">
        <div className="focus-progress-copy"><strong>{progress}% abgeschlossen</strong><span>{approvedCount} von {segments.length} Abschnitten</span></div>
        <div className="progress-track" role="progressbar" aria-label="Fortschritt der Hörprüfung" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="workspace focus-workspace audio-workspace" aria-label="Hörmedien-Arbeitsplatz">
        <aside className="review-list" aria-labelledby="audio-queue-title">
          <div className="focus-list-heading">
            <div><p className="eyebrow">Lesereihenfolge</p><h2 id="audio-queue-title">Sprechabschnitte</h2></div>
            <span className="count-badge">{segments.length}</span>
          </div>
          <div className="audio-bulk-toolbar" aria-label="Mehrfachaktionen">
            <label>
              <input
                type="checkbox"
                checked={selectedIds.size === segments.length}
                onChange={selectAllSegments}
              />
              <span>{selectedIds.size === segments.length ? "Auswahl aufheben" : "Alle auswählen"}</span>
            </label>
            <span>{selectedCount} ausgewählt · {selectedWithAudioCount} mit Audio</span>
            <div>
              <button type="button" disabled={!selectedMissingAudioCount || isBulkGenerating} onClick={() => void generateSelectedAudio()}>
                {isBulkGenerating ? `Vertonung ${bulkProgress}` : `Auswahl vertonen${selectedMissingAudioCount ? ` (${selectedMissingAudioCount})` : ""}`}
              </button>
              <button type="button" disabled={!selectedCount || selectedWithAudioCount !== selectedCount || isBulkGenerating} onClick={approveSelection}>
                Auswahl freigeben
              </button>
              <button type="button" disabled={audioCount !== segments.length || isBulkGenerating} onClick={approveAll}>
                Alle freigeben
              </button>
            </div>
            <small>Mehrfaches Vertonen erzeugt pro Abschnitt einen OpenAI-Aufruf.</small>
          </div>
          <div className="queue audio-queue" role="list">
            {segments.map((segment, index) => (
              <div className={`audio-queue-row ${selected.id === segment.id ? "selected" : ""}`} role="listitem" key={segment.id}>
                <label className="audio-row-select">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(segment.id)}
                    onChange={() => toggleSelection(segment.id)}
                  />
                  <span className="sr-only">Abschnitt {index + 1} auswählen</span>
                </label>
                <button
                  className="queue-item"
                  type="button"
                  aria-current={selected.id === segment.id ? "true" : undefined}
                  onClick={() => { setSelectedId(segment.id); setError(""); }}
                >
                  <span className={`audio-state-dot ${segment.state === "approved" ? "approved" : ""}`} aria-hidden="true">{segment.state === "approved" ? "✓" : index + 1}</span>
                  <span className="queue-copy">
                    <span className="queue-meta"><span>{segment.chapterTitle}</span><span className={`state state-${segment.state}`}>{segment.state === "approved" ? "Freigegeben" : segment.audioUrl ? "Audio bereit" : "Offen"}</span></span>
                    <strong>{segment.spoken}</strong>
                    <small>{segment.kind === "heading" ? "Überschrift" : "Sprechtext"}</small>
                  </span>
                </button>
              </div>
            ))}
          </div>
        </aside>

        <article className="review-detail audio-review-detail" id="audio-review-detail" tabIndex={-1} aria-labelledby="audio-detail-title">
          <div className="panel-heading detail-heading">
            <div>
              <div className="detail-kicker"><span className="risk-pill">Sprechtext</span><span>{selected.chapterTitle}</span></div>
              <h2 id="audio-detail-title">Text prüfen, erzeugen, anhören.</h2>
            </div>
            <span className={`state state-${selected.state}`}>{selected.state === "approved" ? "Freigegeben" : "Offen"}</span>
          </div>

          <div className="audio-edit-grid">
            <section className="audio-source-panel">
              <p className="eyebrow">Originaltext</p>
              <p>{selected.original}</p>
            </section>
            <section className="audio-spoken-panel">
              <label className="eyebrow" htmlFor={`spoken-${selected.id}`}>Vorbereitete Sprechfassung</label>
              <textarea
                id={`spoken-${selected.id}`}
                rows={7}
                maxLength={4096}
                value={selected.spoken}
                onChange={(event) => updateSpoken(event.target.value)}
              />
              <div className="audio-text-meta"><span>Änderungen sind jederzeit möglich.</span><span>{selected.spoken.length} / 4.096 Zeichen</span></div>
            </section>
          </div>

          <section className="audio-player-card" aria-labelledby="audio-player-title">
            <div>
              <p className="eyebrow">Hörprobe</p>
              <h3 id="audio-player-title">{selected.audioUrl ? "Audio ist bereit" : "Noch keine Audiofassung erzeugt"}</h3>
              <p>Die Stimme ist KI-generiert. Bitte Aussprache, Betonung und Pausen fachlich prüfen.</p>
            </div>
            {selected.audioUrl ? (
              <audio controls src={selected.audioUrl}>Ihr Browser unterstützt die Audiowiedergabe nicht.</audio>
            ) : (
              <div className="audio-placeholder" aria-hidden="true">▶</div>
            )}
          </section>

          {error && <p className="import-error audio-error" role="alert">{error}</p>}

          <div className="decision-bar audio-decision-bar">
            <div><p className="eyebrow">Nächster Schritt</p><span>Erzeugen Sie nur diesen Abschnitt. Nach der Hörprobe können Sie ihn freigeben.</span></div>
            <div className="decision-actions">
              <button className="button button-secondary" type="button" disabled={isGenerating || !selected.spoken.trim()} onClick={() => void generateAudio()}>
                {isGenerating ? "Audio wird erzeugt …" : selected.audioUrl ? "Audio neu erzeugen" : "Audio erzeugen"}
              </button>
              <button className="button button-primary" type="button" disabled={!selected.audioUrl || selected.state === "approved"} onClick={approveSelected}>
                {selected.state === "approved" ? "Freigegeben" : "Klingt gut · freigeben"}
              </button>
            </div>
          </div>
        </article>
      </section>
      <section className={`audio-export-card ${exportReady ? "ready" : ""}`} id="audio-export" aria-labelledby="audio-export-title">
        <div className="audio-export-mark" aria-hidden="true">{exportReady ? "✓" : "⇩"}</div>
        <div className="audio-export-copy">
          <p className="eyebrow">Export</p>
          <h2 id="audio-export-title">{exportReady ? "Das Hörmedium ist exportbereit." : "Navigierbares EPUB-3-Hörmedium"}</h2>
          <p>
            Der Export enthält Kapitel-Navigation, die freigegebenen Sprechtexte, alle MP3-Dateien und
            Media-Overlays zur Synchronisierung von Text und Audio.
          </p>
          <ul aria-label="Exportstatus">
            <li className="complete"><span aria-hidden="true">✓</span>{segments.length} Abschnitte strukturiert</li>
            <li className={audioCount === segments.length ? "complete" : ""}><span aria-hidden="true">{audioCount === segments.length ? "✓" : "○"}</span>{audioCount} von {segments.length} mit Audio</li>
            <li className={approvedCount === segments.length ? "complete" : ""}><span aria-hidden="true">{approvedCount === segments.length ? "✓" : "○"}</span>{approvedCount} von {segments.length} freigegeben</li>
          </ul>
        </div>
        <div className="audio-export-action">
          <button className="button button-primary" type="button" disabled={!exportReady || isExporting} onClick={() => void exportAudioEpub()}>
            {isExporting ? "Hörmedium wird verpackt …" : "EPUB-Hörmedium exportieren"}
          </button>
          <small>{exportReady ? "Die Datei wird direkt auf dieses Gerät geladen." : "Der Export wird nach vollständiger Audio- und Fachfreigabe aktiv."}</small>
        </div>
      </section>
      <footer className="app-footer"><span>Lesewege · Hörmedien-Modul · KI-generierte Stimme mit menschlicher Hörprüfung</span><span>Audio entsteht abschnittsweise und wird nicht dauerhaft gespeichert.</span></footer>
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </>
  );
}
