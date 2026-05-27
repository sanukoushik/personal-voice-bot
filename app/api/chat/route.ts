import { SYSTEM_PROMPT } from "@/lib/persona";

export const runtime = "edge";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "The interview bot is not configured yet. Add GROQ_API_KEY to start talking." },
      { status: 503 },
    );
  }

  let messages: ChatMessage[];
  try {
    const payload = (await request.json()) as { messages?: ChatMessage[] };
    messages = (payload.messages ?? [])
      .filter(
        (message): message is ChatMessage =>
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string" &&
          message.content.trim().length > 0,
      )
      .slice(-10);
  } catch {
    return Response.json({ error: "Invalid chat request." }, { status: 400 });
  }

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "Please ask a question first." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
        max_completion_tokens: 280,
        stream: true,
      }),
    });
  } catch (error) {
    console.error("Groq connection error:", error);
    return Response.json(
      { error: "I couldn't connect right now. Please try that question again." },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const reason = await upstream.text();
    console.error("Groq response error:", upstream.status, reason);
    return Response.json(
      { error: "I had trouble finding my words. Please try that question again." },
      { status: 502 },
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            const dataLine = event
              .split("\n")
              .find((line) => line.startsWith("data: "));
            if (!dataLine) continue;

            const data = dataLine.slice(6);
            if (data === "[DONE]") continue;

            let parsed: { choices?: Array<{ delta?: { content?: string | null } }> };
            try {
              parsed = JSON.parse(data) as {
                choices?: Array<{ delta?: { content?: string | null } }>;
              };
            } catch {
              continue;
            }
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              controller.enqueue(encoder.encode(delta));
            }
          }
        }
      } catch (error) {
        console.error("Streaming error:", error);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
