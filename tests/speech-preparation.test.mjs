import assert from "node:assert/strict";
import test from "node:test";

test("prepares German abbreviations, units, percentages, and decimal commas for speech", async () => {
  const { prepareSpokenText } = await import(
    `../lib/speech-preparation.ts?speech=${Date.now()}`
  );

  assert.equal(
    prepareSpokenText("Dr. Müller fährt z. B. 12,5 km mit 25 % Rabatt."),
    "Doktor Müller fährt zum Beispiel 12 Komma 5 Kilometer mit 25 Prozent Rabatt.",
  );
  assert.equal(
    prepareSpokenText("Die Fläche beträgt 3 m² & 2 cm²."),
    "Die Fläche beträgt 3 Quadratmeter und 2 Quadratzentimeter.",
  );
});

test("keeps every imported book block as an editable speech segment", async () => {
  const { createSpeechSegments } = await import(
    `../lib/speech-preparation.ts?segments=${Date.now()}`
  );
  const blocks = Array.from({ length: 620 }, (_, index) => ({
    id: `chapter-1-${index + 1}`,
    chapterId: "chapter-1",
    chapterTitle: "Kapitel 1",
    kind: "paragraph",
    text: `Abschnitt ${index + 1}.`,
  }));

  const segments = createSpeechSegments(blocks);
  assert.equal(segments.length, 620);
  assert.equal(segments[619].spoken, "Abschnitt 620.");
});
