import { NextResponse } from "next/server";

import { findStock } from "@/lib/mock-data";
import { getFallbackRecommendation } from "@/lib/market-data";
import type { AiRecommendationResponse } from "@/lib/types";

interface OpenAiResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
}

const recommendationSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "action",
    "riskScore",
    "bullishConfidence",
    "bearishConfidence",
    "shortTermTrend",
    "reasoning",
    "swingTradeIdea",
    "earningsPlay",
    "unusualOptionsActivity"
  ],
  properties: {
    action: { type: "string", enum: ["Buy", "Hold", "Sell"] },
    riskScore: { type: "integer", minimum: 1, maximum: 10 },
    bullishConfidence: { type: "integer", minimum: 0, maximum: 100 },
    bearishConfidence: { type: "integer", minimum: 0, maximum: 100 },
    shortTermTrend: { type: "string" },
    swingTradeIdea: { type: "string" },
    earningsPlay: { type: "string" },
    unusualOptionsActivity: { type: "string" },
    reasoning: {
      type: "array",
      minItems: 6,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "stance", "score", "summary"],
        properties: {
          label: {
            type: "string",
            enum: ["Valuation", "Momentum", "News sentiment", "Earnings performance", "Technical analysis", "Analyst sentiment"]
          },
          stance: { type: "string", enum: ["bullish", "neutral", "bearish"] },
          score: { type: "integer", minimum: 0, maximum: 100 },
          summary: { type: "string" }
        }
      }
    }
  }
};

function extractOutputText(response: OpenAiResponse) {
  if (response.output_text) {
    return response.output_text;
  }

  return response.output
    ?.flatMap((item) => item.content ?? [])
    .map((item) => item.text)
    .find((text): text is string => Boolean(text));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { symbol?: string };
  const symbol = body.symbol?.trim().toUpperCase() || "NVDA";
  const stock = findStock(symbol);
  const fallback = getFallbackRecommendation(symbol);
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
          "You are a cautious equity research assistant. Return educational stock analysis only, not personalized financial advice. Use concise reasoning grounded in valuation, momentum, news sentiment, earnings, technicals, and analyst sentiment.",
        input: JSON.stringify({
          symbol: stock.symbol,
          company: stock.name,
          sector: stock.sector,
          price: stock.price,
          changePercent: stock.changePercent,
          peRatio: stock.peRatio,
          beta: stock.beta,
          analystRating: stock.analystRating,
          news: stock.news,
          currentModelRecommendation: fallback
        }),
        text: {
          format: {
            type: "json_schema",
            name: "stock_recommendation",
            schema: recommendationSchema,
            strict: true
          }
        }
      })
    });

    if (!response.ok) {
      return NextResponse.json({ ...fallback, provider: "demo", model, error: "OpenAI request failed" }, { status: 200 });
    }

    const data = (await response.json()) as OpenAiResponse;
    const output = extractOutputText(data);

    if (!output) {
      return NextResponse.json({ ...fallback, provider: "demo", model, error: "OpenAI response had no text output" }, { status: 200 });
    }

    const parsed = JSON.parse(output) as AiRecommendationResponse;
    return NextResponse.json({ ...parsed, provider: "openai", model });
  } catch {
    return NextResponse.json({ ...fallback, provider: "demo", model, error: "OpenAI fallback used" }, { status: 200 });
  }
}
