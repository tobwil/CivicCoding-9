# Lesewege

**Ein Inhalt. Mehr Zugänge.**

Lesewege ist der Prototyp einer KI-gestützten Produktionsplattform für das
Deutsche Zentrum für barrierefreies Lesen. Redaktionelle Inhalte sollen einmal
strukturiert und anschließend in mehrere barrierefreie Medien überführt werden:
zunächst in qualitätsgesichertes Braille, perspektivisch auch in navigierbare
DAISY-/EPUB-Hörmedien.

Die KI ersetzt keine Fachkräfte. Sie automatisiert nachvollziehbare
Produktionsschritte, markiert Risiken und legt den Korrekturlesenden gezielt die
Stellen vor, bei denen eine menschliche Entscheidung erforderlich ist.

## Aktueller Demonstrator: Braille-Modul

- EPUB-3-Import mit Titel, Autor, Sprache, Kapiteln und Lesereihenfolge
- vollständige Verarbeitung ganzer Bücher ohne Abschnittsbegrenzung
- Struktur- und Gesamtdokumentvorschau vor der Verarbeitung
- TXT und Markdown als einfache Importalternativen
- regelbasierte Übersetzung und Rückübersetzung mit Liblouis 3.38.0
- Prüfung vorhandener Braille-Ausgaben aus PEF, BRF oder Unicode-TXT
- automatische BRF-Erkennung für deutsche und englische Braille-Profile
- optionale Schwarzschrift-Referenz für einen direkten Inhaltsvergleich
- lokale Risikoregeln und optionale zusätzliche Inhaltsprüfung mit OpenAI
- barrierefreie Korrekturansicht für Tastatur, Screenreader und Braillezeile
- lokaler Sitzungsstand und herunterladbarer Prüfbericht

## Bezug zur Challenge

Der Demonstrator adressiert den ersten Engpass aus Challenge 9: Die
Qualitätsprüfung nach der Übertragung von Schwarzschrift zu Braille soll
beschleunigt werden. Lesewege übernimmt dabei Strukturierung, Übersetzung,
Rückübersetzung und Priorisierung. Korrekturlesende konzentrieren sich auf
markierte Risikostellen und behalten die Freigabe in der Hand.

Das gemeinsame Inhaltsmodell ist zugleich die Grundlage für das zweite Modul:
die schnellere Produktion aktueller Zeitschriften als navigierbare
DAISY-/EPUB-Hörmedien.

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
TXT-/Markdown-Import, Liblouis-Übersetzung und Rückübersetzung sowie die
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
