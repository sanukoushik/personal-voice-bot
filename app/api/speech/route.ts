export const runtime = "edge";

const MAX_INPUT_LENGTH = 200;

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Speech is not configured." }, { status: 503 });
  }

  let input: string;
  try {
    const payload = (await request.json()) as { input?: unknown };
    input = typeof payload.input === "string" ? payload.input.trim() : "";
  } catch {
    return Response.json({ error: "Invalid speech request." }, { status: 400 });
  }

  if (!input || input.length > MAX_INPUT_LENGTH) {
    return Response.json(
      { error: `Speech text must be between 1 and ${MAX_INPUT_LENGTH} characters.` },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch("https://api.groq.com/openai/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_TTS_MODEL || "canopylabs/orpheus-v1-english",
        voice: process.env.GROQ_TTS_VOICE || "austin",
        input,
        response_format: "wav",
      }),
    });
  } catch (error) {
    console.error("Groq speech connection error:", error);
    return Response.json({ error: "Speech generation is unavailable." }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const reason = await upstream.text();
    console.error("Groq speech response error:", upstream.status, reason);
    return Response.json({ error: "Speech generation failed." }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "no-store",
    },
  });
}
