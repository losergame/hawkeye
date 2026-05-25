import { NextResponse } from "next/server";

import { getFallbackMarketSummary } from "@/lib/market-data";

interface OpenAiResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
    }>;
  }>;
}

function extractOutputText(response: OpenAiResponse) {
  if (response.output_text) {
    return response.output_text;
  }

  return response.output
    ?.flatMap((item) => item.content ?? [])
    .map((item) => item.text)
    .find((text): text is string => Boolean(text));
}

export async function GET() {
  const fallback = getFallbackMarketSummary();
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-5.5";

  if (!apiKey) {
    return NextResponse.json({ ...fallback, provider: "demo", model: "mock" });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        instructions:
          "You write concise daily market summaries for an equity dashboard. Return JSON with a summary string and three highlight strings. Avoid personalized financial advice.",
        input: "Summarize today's US equity market setup using broad risk appetite, sector leadership, rates pressure, and options activity.",
        text: {
          format: {
            type: "json_schema",
            name: "market_summary",
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["summary", "highlights"],
              properties: {
                summary: { type: "string" },
                highlights: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } }
              }
            },
            strict: true
          }
        }
      })
    });

    if (!response.ok) {
      return NextResponse.json({ ...fallback, provider: "demo", model });
    }

    const data = (await response.json()) as OpenAiResponse;
    const output = extractOutputText(data);
    if (!output) {
      return NextResponse.json({ ...fallback, provider: "demo", model });
    }

    return NextResponse.json({ ...JSON.parse(output), news: fallback.news, provider: "openai", model });
  } catch {
    return NextResponse.json({ ...fallback, provider: "demo", model });
  }
}
