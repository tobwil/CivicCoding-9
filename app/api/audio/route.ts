import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";

const SpeechSchema = z.object({
  text: z.string().trim().min(1).max(4096),
  voice: z.enum(["alloy", "echo", "fable", "nova", "onyx", "shimmer"]),
});

export async function POST(request: Request) {
  try {
    const parsed = SpeechSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Der Sprechtext ist leer oder länger als 4.096 Zeichen." },
        { status: 400 },
      );
    }

    const sessionApiKey = request.headers.get("x-openai-api-key")?.trim();
    const apiKey = process.env.OPENAI_API_KEY || sessionApiKey;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Für die Sprachausgabe muss OpenAI in den Einstellungen verbunden sein." },
        { status: 400 },
      );
    }

    const client = new OpenAI({ apiKey });
    const speech = await client.audio.speech.create({
      model: process.env.OPENAI_TTS_MODEL || "tts-1-hd",
      voice: parsed.data.voice,
      input: parsed.data.text,
      response_format: "mp3",
      speed: 1,
    });

    return new Response(await speech.arrayBuffer(), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Audio generation failed", error);
    return NextResponse.json(
      { error: "Die Sprachausgabe konnte nicht erzeugt werden." },
      { status: 503 },
    );
  }
}
