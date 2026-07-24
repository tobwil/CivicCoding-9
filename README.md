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

## Aktueller Demonstrator

### Braille-Modul

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

### Hörmedien-Modul

- eigener, gleichwertiger Produktionsbereich neben Braille
- EPUB-3-, TXT- und Markdown-Import mit vollständiger Kapitelstruktur
- automatisch vorbereitete und vor der Ausgabe editierbare Sprechfassung
- verständliche Auflösung häufiger Abkürzungen, Einheiten und Dezimalzahlen
- abschnittsweise OpenAI-Sprachausgabe mit auswählbarer Stimme
- direkter Audioplayer und menschliche Hörfreigabe pro Abschnitt
- Mehrfachauswahl zum gemeinsamen Vertonen und Freigeben
- bewusste Option zur Freigabe aller Audiofassungen
- EPUB-3-Export mit Kapitel-Navigation, MP3-Dateien und Media-Overlays
- transparente Kennzeichnung der KI-generierten Stimme
- Sammelerzeugung bleibt eine ausdrücklich ausgelöste, sichtbare Aktion

## Bezug zur Challenge

Der Demonstrator adressiert den ersten Engpass aus Challenge 9: Die
Qualitätsprüfung nach der Übertragung von Schwarzschrift zu Braille soll
beschleunigt werden. Lesewege übernimmt dabei Strukturierung, Übersetzung,
Rückübersetzung und Priorisierung. Korrekturlesende konzentrieren sich auf
markierte Risikostellen und behalten die Freigabe in der Hand.

Das gemeinsame Inhaltsmodell trägt nun auch das zweite Modul: Es bereitet
Schwarzschrift als editierbaren Sprechtext vor, erzeugt abschnittsweise oder
für eine bewusst gewählte Auswahl Audio und führt Fachkräfte durch die
Hörprüfung. Freigegebene Bücher lassen sich anschließend als navigierbares
EPUB-3-Hörmedium mit synchronisiertem Text und Audio exportieren.

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
TXT-/Markdown-Import, Sprechtextvorbereitung, Liblouis-Übersetzung und
Rückübersetzung sowie die Serverrouten ab.

## OpenAI-Verbindung

Produktiv kann `OPENAI_API_KEY` als serverseitiges Secret gesetzt werden.
Fehlt es, lässt sich im Einstellungsmenü ein Schlüssel ausschließlich für den
aktuellen Browser-Tab hinterlegen. Ein serverseitiger Schlüssel hat Vorrang.
Für die Sprachausgabe kann `OPENAI_TTS_MODEL` gesetzt werden; ohne Angabe nutzt
Lesewege `tts-1-hd`.

## Fachliche Grenze

Die verwendete Liblouis-Tabelle ist eine echte regelbasierte Übersetzung, muss
vor einem Produktionseinsatz aber gemeinsam mit dem dzb lesen gegen das aktuelle
deutsche Braille-Regelwerk und die dort eingesetzten Produktionstabellen
validiert werden.
