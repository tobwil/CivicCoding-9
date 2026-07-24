# Braille QA Copilot

Barrierefreier Produktionsprototyp für die KI-gestützte Qualitätssicherung
deutscher Braille-Publikationen.

## Funktionen

- EPUB-3-Import anhand von Container, Manifest und Spine-Lesereihenfolge
- Übernahme von Titel, Autor, Sprache, Kapiteln, Absätzen, Listen und Tabellen
- Strukturvorschau vor der Analyse
- TXT- und Markdown-Import als Fallback
- echte Übersetzung und Rückübersetzung mit Liblouis 3.38.0
- zweiter Workflow für vorhandenes Braille aus PEF, BRF oder Unicode-TXT
- optionale Schwarzschrift-Referenz für den direkten Braille-Vergleich
- sichere Braille-Prüfung ohne Referenz: keine automatische Inhaltsfreigabe
- deutsche Tabelle `de-g0-detailed.utb`
- lokale Risikoregeln und optionale semantische OpenAI-Prüfung
- tastatur- und screenreader-bedienbare Korrekturansicht
- lokaler Sitzungsstand und herunterladbarer Prüfbericht

## Lokale Entwicklung

Voraussetzung ist Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Der Start- und Buildprozess stellt den gepinnten offiziellen
Liblouis-JavaScript-Build automatisch als statisches Browser-Asset bereit.

## Prüfung

```bash
npm run lint
npm test
```

Die Tests decken EPUB-, PEF-, BRF- und Unicode-Braille-Import,
TXT-/Markdown-Fallback, Liblouis-Übersetzung und Rückübersetzung sowie die
Serverrouten ab.

## OpenAI-Verbindung

Produktiv kann `OPENAI_API_KEY` als serverseitiges Secret gesetzt werden.
Fehlt es, lässt sich im Einstellungsmenü ein Schlüssel ausschließlich für den
aktuellen Browser-Tab hinterlegen. Ein serverseitiger Schlüssel hat Vorrang.

## Fachliche Grenze

Die verwendete Liblouis-Tabelle ist eine echte regelbasierte Übersetzung, muss
vor einem Produktionseinsatz aber gemeinsam mit dem dzb lesen gegen das aktuelle
deutsche Braille-Regelwerk und die dort eingesetzten Produktionstabellen
validiert werden.
