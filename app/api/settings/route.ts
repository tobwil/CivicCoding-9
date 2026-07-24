import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    serverKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    speechModel: process.env.OPENAI_TTS_MODEL || "tts-1-hd",
  });
}
