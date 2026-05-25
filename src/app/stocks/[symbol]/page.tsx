import type { Metadata } from "next";

import { StockDetailClient } from "@/components/stock-detail-client";
import { findStock } from "@/lib/mock-data";

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  const { symbol } = await params;
  const stock = findStock(symbol);

  return {
    title: `${stock.symbol} Analysis | SignalForge AI`,
    description: `${stock.name} AI recommendation, technicals, news, and risk score.`
  };
}

export default async function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return <StockDetailClient symbol={symbol.toUpperCase()} />;
}
