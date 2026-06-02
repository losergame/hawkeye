"use client";

import { useEffect, useState, type PointerEvent, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import type { CandlePoint, ChartIndicator, MacdPoint, SectorPerformance, TimePoint } from "@/lib/types";

const compact = new Intl.NumberFormat("en-US", { notation: "compact" });
const wholeDollar = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const candleChartInset = { top: 8, right: 12, bottom: 28, left: 48 } as const;

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--foreground)",
  borderRadius: 0,
  boxShadow: "none",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  padding: "6px 10px",
};

function useChartReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => window.requestAnimationFrame(() => setReady(true)));
    return () => window.cancelAnimationFrame(id);
  }, []);
  return ready;
}

function ChartBox({ children, className }: { children: ReactNode; className: string }) {
  const ready = useChartReady();
  return (
    <div className={`${className} min-w-0`} tabIndex={-1}>
      {ready ? children : <div className="h-full w-full animate-pulse bg-muted" />}
    </div>
  );
}

function formatSessionLabel(label: string) {
  if (label === "Latest") return "Latest quote";
  if (label === "9:30 AM") return "9:30 AM ET open";
  if (label === "4:00 PM") return "4:00 PM ET close";
  return `${label} ET`;
}

function formatPortfolioAxis(value: number) {
  const abs = Math.abs(value);
  if (abs < 1000) return wholeDollar.format(value);
  if (abs < 1_000_000) return `$${Number(value / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `$${Number(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
}



export function PortfolioPerformanceChart({ data }: { data: TimePoint[] }) {
  return (
    <ChartBox className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="portfolioGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="var(--foreground)" stopOpacity={0.12} />
              <stop offset="95%" stopColor="var(--foreground)" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatPortfolioAxis(Number(v))} />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "2 2", strokeWidth: 0.8 }}
            contentStyle={tooltipStyle}
            labelStyle={{ color: "var(--muted-foreground)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em" }}
            itemStyle={{ color: "var(--foreground)", fontWeight: 700 }}
            formatter={(value) => [`$${Number(value).toLocaleString()}`, "Value"]}
          />
          <Area type="monotone" dataKey="value" stroke="var(--foreground)" strokeWidth={1.4} fill="url(#portfolioGradient)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

export function PriceAreaChart({ data }: { data: TimePoint[] }) {
  return (
    <ChartBox className="h-72 w-full min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="priceGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="var(--foreground)" stopOpacity={0.07} />
              <stop offset="95%" stopColor="var(--foreground)" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} domain={["dataMin - 4", "dataMax + 4"]} tickFormatter={(v) => Number(v).toFixed(2)} />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "2 2", strokeWidth: 0.8 }}
            contentStyle={tooltipStyle}
            labelStyle={{ color: "var(--muted-foreground)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em" }}
            itemStyle={{ color: "var(--foreground)", fontWeight: 700 }}
            labelFormatter={(label) => formatSessionLabel(String(label))}
            formatter={(value) => [`$${Number(value).toFixed(2)}`, "Price"]}
          />
          <Area type="monotone" dataKey="value" stroke="var(--foreground)" strokeWidth={1.4} fill="url(#priceGradient)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

export function MiniSparkline({ data, positive = true }: { data: TimePoint[]; positive?: boolean }) {
  return (
    <ChartBox className="h-14 w-28">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <Area
            type="monotone"
            dataKey="value"
            stroke={positive ? "var(--positive)" : "var(--destructive)"}
            strokeWidth={1.4}
            fill="none"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

export function SectorPerformanceChart({ data }: { data: SectorPerformance[] }) {
  return (
    <ChartBox className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 12 }}>
          <CartesianGrid stroke="var(--border)" horizontal={false} />
          <XAxis type="number" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
          <YAxis type="category" dataKey="sector" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} width={112} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={tooltipStyle}
            labelStyle={{ color: "var(--muted-foreground)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em" }}
            itemStyle={{ color: "var(--foreground)", fontWeight: 700 }}
            formatter={(v) => [`${Number(v).toFixed(2)}%`, "Change"]}
          />
          <Bar dataKey="changePercent" radius={0}>
            {data.map((entry) => (
              <Cell key={entry.sector} fill={entry.changePercent >= 0 ? "var(--positive)" : "var(--destructive)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

export function TechnicalOverlayChart({ data }: { data: CandlePoint[] }) {
  return (
    <ChartBox className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} domain={["dataMin - 6", "dataMax + 6"]} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: "var(--muted-foreground)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em" }}
            itemStyle={{ color: "var(--foreground)", fontWeight: 700 }}
            formatter={(value, name) => [`$${Number(value).toFixed(2)}`, String(name).toUpperCase()]}
          />
          <Line type="monotone" dataKey="close" dot={false} stroke="var(--foreground)" strokeWidth={1.4} />
          <Line type="monotone" dataKey="vwap" dot={false} stroke="var(--muted-foreground)" strokeDasharray="4 3" strokeWidth={1} />
          <Line type="monotone" dataKey="ema50" dot={false} stroke="var(--muted-foreground)" strokeDasharray="6 2" strokeWidth={1} />
          <Line type="monotone" dataKey="ema200" dot={false} stroke="var(--muted-foreground)" strokeDasharray="2 2" strokeWidth={1} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

export function RsiChart({ data }: { data: TimePoint[] }) {
  return (
    <ChartBox className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} domain={[20, 85]} />
          <ReferenceLine y={70} stroke="var(--destructive)" strokeDasharray="2 2" strokeWidth={0.8} />
          <ReferenceLine y={30} stroke="var(--muted-foreground)" strokeDasharray="2 2" strokeWidth={0.8} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: "var(--muted-foreground)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em" }}
            itemStyle={{ color: "var(--foreground)", fontWeight: 700 }}
            formatter={(v) => [Number(v).toFixed(1), "RSI"]}
          />
          <Area type="monotone" dataKey="value" stroke="var(--foreground)" fill="none" strokeWidth={1.4} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

export function MacdChart({ data }: { data: MacdPoint[] }) {
  return (
    <ChartBox className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} />
          <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: "var(--muted-foreground)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em" }}
            itemStyle={{ color: "var(--foreground)", fontWeight: 700 }}
            formatter={(value, name) => [Number(value).toFixed(2), String(name).toUpperCase()]}
          />
          <Bar dataKey="histogram" radius={0}>
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.histogram >= 0 ? "var(--foreground)" : "var(--destructive)"} opacity={0.5} />
            ))}
          </Bar>
          <Line type="monotone" dataKey="macd" dot={false} stroke="var(--foreground)" strokeWidth={1.4} />
          <Line type="monotone" dataKey="signal" dot={false} stroke="var(--muted-foreground)" strokeDasharray="4 2" strokeWidth={1} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

export function VolumeAnalysisChart({ data }: { data: CandlePoint[] }) {
  const avg = data.reduce((t, p) => t + p.volume, 0) / data.length;
  return (
    <ChartBox className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000)}M`} />
          <ReferenceLine y={avg} stroke="var(--muted-foreground)" strokeDasharray="2 2" strokeWidth={0.8} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: "var(--muted-foreground)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em" }}
            itemStyle={{ color: "var(--foreground)", fontWeight: 700 }}
            formatter={(v) => [`${(Number(v) / 1_000_000).toFixed(1)}M`, "Volume"]}
          />
          <Bar dataKey="volume" radius={0}>
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.close >= entry.open ? "var(--positive)" : "var(--destructive)"} opacity={0.7} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

/* ── Candlestick Chart — brutalist SVG ── */
export function CandlestickChart({ data, indicators = [] }: { data: CandlePoint[]; indicators?: ChartIndicator[] }) {
  const [activeCandle, setActiveCandle] = useState<{
    point: CandlePoint; x: number; y: number;
    candleX: number; priceY: number; chartWidth: number; chartHeight: number;
  } | null>(null);

  const W = 900, H = 288;
  const padL = candleChartInset.left;
  const padR = candleChartInset.right;
  const padT = candleChartInset.top;
  const plotL = padL, plotR = W - padR, plotW = plotR - plotL;
  const volTop = H - 58, chartBot = volTop - 10;
  const chartH = chartBot - padT;
  const volH = 34;

  if (!data.length) {
    return (
      <ChartBox className="h-72 w-full min-h-0">
        <div className="h-full w-full animate-pulse bg-muted" />
      </ChartBox>
    );
  }

  const indicatorVals = data.flatMap(p => [
    indicators.includes("vwap") ? p.vwap : undefined,
    indicators.includes("ema20") ? p.ema20 : undefined,
    indicators.includes("ema50") ? p.ema50 : undefined,
    indicators.includes("ema200") ? p.ema200 : undefined,
    indicators.includes("bollinger") ? p.bollingerUpper : undefined,
    indicators.includes("bollinger") ? p.bollingerLower : undefined,
  ]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const rawMin = Math.min(...data.map(p => p.low), ...indicatorVals);
  const rawMax = Math.max(...data.map(p => p.high), ...indicatorVals);
  const maxVol = Math.max(...data.map(p => p.volume), 1);
  const pad = Math.max((rawMax - rawMin) * 0.08, rawMax * 0.001, 0.05);
  const lo = rawMin - pad, hi = rawMax + pad;
  const range = Math.max(hi - lo, 1);
  const scaleY = (v: number) => chartBot - ((v - lo) / range) * chartH;
  const step = plotW / data.length;
  const bw = Math.max(5, Math.min(12, step * 0.62));
  const cx = (i: number) => plotL + i * step + step / 2;

  const iPath = (key: keyof Pick<CandlePoint, "vwap"|"ema20"|"ema50"|"ema200"|"bollingerUpper"|"bollingerLower">) =>
    data.map((p, i) => `${i === 0 ? "M" : "L"} ${cx(i).toFixed(1)} ${scaleY(p[key]).toFixed(1)}`).join(" ");

  const gridTicks = Array.from({ length: 5 }, (_, i) => ({
    y: padT + (chartH / 4) * i,
    val: hi - (range / 4) * i,
  }));

  const lastClose = data[data.length - 1].close;
  const lastPriceY = scaleY(lastClose);

  const onMove = (point: CandlePoint, index: number, e: PointerEvent<SVGGElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const b = svg.getBoundingClientRect();
    setActiveCandle({
      point, x: e.clientX - b.left, y: e.clientY - b.top,
      candleX: cx(index), priceY: scaleY(point.close),
      chartWidth: b.width, chartHeight: b.height,
    });
  };

  const tipL = activeCandle
    ? activeCandle.x + 188 > activeCandle.chartWidth
      ? Math.max(activeCandle.x - 188, 12)
      : activeCandle.x + 12
    : 0;
  const tipT = activeCandle
    ? Math.min(Math.max(activeCandle.y - 76, 12), Math.max(12, activeCandle.chartHeight - 154))
    : 0;

  return (
    <ChartBox className="h-72 w-full min-h-0">
      <div
        className="relative h-full w-full overflow-hidden"
        onPointerLeave={() => setActiveCandle(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-full w-full outline-none"
          aria-label="Candlestick chart"
        >
          {/* Grid lines */}
          {gridTicks.map(t => (
            <g key={t.y} pointerEvents="none">
              <line x1={plotL} x2={plotR} y1={t.y} y2={t.y} stroke="var(--border)" strokeWidth="1" shapeRendering="crispEdges" />
            </g>
          ))}

          {/* Bollinger */}
          {indicators.includes("bollinger") && (
            <>
              <path pointerEvents="none" d={iPath("bollingerUpper")} fill="none" stroke="var(--muted-foreground)" strokeDasharray="2 3" strokeWidth="0.8" opacity="0.7" />
              <path pointerEvents="none" d={iPath("bollingerLower")} fill="none" stroke="var(--muted-foreground)" strokeDasharray="2 3" strokeWidth="0.8" opacity="0.7" />
            </>
          )}

          {/* Candles */}
          {data.map((p, i) => {
            const x = cx(i);
            const up = p.close >= p.open;
            const yO = scaleY(p.open), yC = scaleY(p.close);
            const bodyY = Math.min(yO, yC);
            const bodyH = Math.max(1, Math.abs(yO - yC));
            const volBarH = Math.max(2, (p.volume / maxVol) * volH);
            return (
              <g key={`${p.label}-${i}`} className="cursor-crosshair"
                onPointerEnter={e => onMove(p, i, e)}
                onPointerMove={e => onMove(p, i, e)}
              >
                {/* Hover target */}
                <rect x={x - step / 2} y={padT} width={step} height={chartH} fill="transparent" />
                {/* Volume bar */}
                <rect pointerEvents="none"
                  x={x - bw / 2} y={volTop + volH - volBarH}
                  width={bw} height={volBarH}
                  fill={up ? "var(--foreground)" : "var(--destructive)"}
                  opacity="0.35"
                  shapeRendering="crispEdges"
                />
                {/* Wick */}
                <line x1={x} x2={x} y1={scaleY(p.high)} y2={scaleY(p.low)}
                  stroke={up ? "var(--positive)" : "var(--destructive)"}
                  strokeWidth="0.8"
                  shapeRendering="crispEdges"
                />
                {/* Body */}
                <rect pointerEvents="none"
                  x={x - bw / 2} y={bodyY}
                  width={bw} height={bodyH}
                  fill={up ? "var(--positive)" : "var(--destructive)"}
                  stroke={up ? "var(--positive)" : "var(--destructive)"}
                  strokeWidth="0.9"
                  shapeRendering="crispEdges"
                />
              </g>
            );
          })}

          {/* Overlay lines */}
          {indicators.includes("vwap") && (
            <path pointerEvents="none" d={iPath("vwap")} fill="none" stroke="var(--foreground)" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.55" />
          )}
          {indicators.includes("ema20") && (
            <path pointerEvents="none" d={iPath("ema20")} fill="none" stroke="var(--foreground)" strokeWidth="0.8" opacity="0.45" />
          )}
          {indicators.includes("ema50") && (
            <path pointerEvents="none" d={iPath("ema50")} fill="none" stroke="var(--foreground)" strokeWidth="0.8" strokeDasharray="6 2" opacity="0.65" />
          )}
          {indicators.includes("ema200") && (
            <path pointerEvents="none" d={iPath("ema200")} fill="none" stroke="var(--foreground)" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.85" />
          )}

          {/* Last price dashed line */}
          <line pointerEvents="none"
            x1={plotL} x2={plotR} y1={lastPriceY} y2={lastPriceY}
            stroke="var(--foreground)" strokeWidth="0.6" strokeDasharray="2 2" opacity="0.5"
          />

          {/* Crosshair */}
          {activeCandle && (
            <g pointerEvents="none" shapeRendering="crispEdges">
              <line x1={activeCandle.candleX} x2={activeCandle.candleX} y1={padT} y2={chartBot}
                stroke="var(--foreground)" strokeWidth="0.6" strokeDasharray="2 2" opacity="0.7" />
              <line x1={plotL} x2={plotR} y1={activeCandle.priceY} y2={activeCandle.priceY}
                stroke="var(--foreground)" strokeWidth="0.6" strokeDasharray="2 2" opacity="0.7" />
              <circle cx={activeCandle.candleX} cy={activeCandle.priceY} r="2.5" fill="var(--foreground)" />
            </g>
          )}

          {/* Y-axis labels — rendered in SVG but will distort less since we use padR gutter */}
          {gridTicks.map(t => {
            if (activeCandle && Math.abs(t.y - lastPriceY) < 10) return null;
            return (
              <text key={`y-${t.y}`} pointerEvents="none"
                x={plotR + 6} y={t.y + 4}
                fill="var(--muted-foreground)" fontSize="10" textAnchor="start"
              >
                {t.val.toFixed(t.val > 100 ? 1 : 2)}
              </text>
            );
          })}

          {/* Last price badge */}
          <rect pointerEvents="none"
            x={plotR + 2} y={lastPriceY - 8}
            width={padR - 4} height={16}
            fill="var(--foreground)"
          />
          <text pointerEvents="none"
            x={plotR + padR / 2} y={lastPriceY + 4}
            fill="var(--background)" fontSize="10" fontWeight="700" textAnchor="middle"
          >
            {lastClose.toFixed(2)}
          </text>

          {/* Footer labels */}
          <text pointerEvents="none" x={plotL} y={H - 9} fill="var(--muted-foreground)" fontSize="10">
            30 sessions · volume
          </text>
          <text pointerEvents="none" x={plotR} y={H - 9} fill="var(--muted-foreground)" fontSize="10" textAnchor="end">
            H {rawMax.toFixed(2)} · L {rawMin.toFixed(2)}
          </text>
        </svg>

        {/* Crosshair tooltip */}
        {activeCandle && (
          <div
            className="pointer-events-none absolute z-10 border border-foreground bg-popover p-2.5 text-[11px] whitespace-nowrap"
            style={{ left: tipL, top: tipT }}
          >
            <div className="mb-1.5 flex items-center justify-between gap-4">
              <span className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Bar {activeCandle.point.label}</span>
              <span className={activeCandle.point.close >= activeCandle.point.open ? "text-positive font-bold" : "text-destructive font-bold"}>
                {activeCandle.point.close >= activeCandle.point.open ? "▲ Up" : "▼ Down"}
              </span>
            </div>
            <div className="grid gap-y-0.5" style={{ gridTemplateColumns: "36px 1fr" }}>
              {[
                ["O", activeCandle.point.open.toFixed(2)],
                ["H", activeCandle.point.high.toFixed(2)],
                ["L", activeCandle.point.low.toFixed(2)],
                ["C", activeCandle.point.close.toFixed(2)],
                ["Vol", compact.format(activeCandle.point.volume)],
              ].map(([label, val]) => (
                <>
                  <span key={`l-${label}`} className="text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
                  <span key={`v-${label}`} className="font-bold tabular-nums text-right">{val}</span>
                </>
              ))}
            </div>
          </div>
        )}
      </div>
    </ChartBox>
  );
}
