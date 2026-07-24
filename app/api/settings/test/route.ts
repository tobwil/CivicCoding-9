import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (process.env.OPENAI_API_KEY) {
    return NextResponse.json({ valid: true, source: "server" });
  }

  const apiKey = request.headers.get("x-openai-api-key")?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { valid: false, error: "Bitte geben Sie einen API-Schlüssel ein." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { valid: false, error: "Der API-Schlüssel konnte nicht bestätigt werden." },
        { status: 401 },
      );
    }

    return NextResponse.json({ valid: true, source: "session" });
  } catch {
    return NextResponse.json(
      { valid: false, error: "Die Verbindung zu OpenAI konnte nicht hergestellt werden." },
      { status: 503 },
    );
  }
}
