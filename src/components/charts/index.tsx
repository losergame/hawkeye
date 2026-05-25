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

const grid = "rgba(148, 163, 184, 0.13)";
const axis = { fill: "#94a3b8", fontSize: 11 };
const compact = new Intl.NumberFormat("en-US", { notation: "compact" });
const wholeDollar = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Candlestick-only insets (line chart uses Recharts’ own layout). */
const candleChartInset = { top: 8, right: 12, bottom: 28, left: 48 } as const;

function useChartReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const firstFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setReady(true));
    });

    return () => window.cancelAnimationFrame(firstFrame);
  }, []);

  return ready;
}

function ChartBox({ children, className }: { children: ReactNode; className: string }) {
  const ready = useChartReady();

  return (
    <div className={`${className} min-w-0`} tabIndex={-1}>
      {ready ? children : <div className="h-full w-full animate-pulse rounded-lg bg-white/[0.06]" />}
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
  const absoluteValue = Math.abs(value);
  if (absoluteValue < 1000) return wholeDollar.format(value);
  if (absoluteValue < 1_000_000) return `$${Number(value / 1000).toFixed(absoluteValue >= 10_000 ? 0 : 1)}k`;
  return `$${Number(value / 1_000_000).toFixed(absoluteValue >= 10_000_000 ? 0 : 1)}M`;
}

export function PortfolioPerformanceChart({ data }: { data: TimePoint[] }) {
  return (
    <ChartBox className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="portfolioGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#34d399" stopOpacity={0.42} />
              <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(value) => formatPortfolioAxis(Number(value))} />
          <Tooltip
            cursor={{ stroke: "rgba(125, 211, 252, 0.35)" }}
            contentStyle={{ background: "#07111f", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8 }}
            formatter={(value) => [`$${Number(value).toLocaleString()}`, "Value"]}
          />
          <Area type="monotone" dataKey="value" stroke="#34d399" strokeWidth={3} fill="url(#portfolioGradient)" />
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
              <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.38} />
              <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} domain={["dataMin - 4", "dataMax + 4"]} tickFormatter={(value) => Number(value).toFixed(2)} />
          <Tooltip
            cursor={{ stroke: "rgba(34, 211, 238, 0.35)" }}
            contentStyle={{ background: "#07111f", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8 }}
            labelFormatter={(label) => formatSessionLabel(String(label))}
            formatter={(value) => [`$${Number(value).toFixed(2)}`, "Price"]}
          />
          <Area type="monotone" dataKey="value" stroke="#22d3ee" strokeWidth={3} fill="url(#priceGradient)" />
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
            stroke={positive ? "#34d399" : "#fb7185"}
            strokeWidth={2}
            fill={positive ? "rgba(52,211,153,0.16)" : "rgba(251,113,133,0.16)"}
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
          <CartesianGrid stroke={grid} horizontal={false} />
          <XAxis type="number" tick={axis} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
          <YAxis type="category" dataKey="sector" tick={axis} tickLine={false} axisLine={false} width={112} />
          <Tooltip
            cursor={{ fill: "rgba(34, 211, 238, 0.08)" }}
            contentStyle={{ background: "#07111f", border: "1px solid rgba(34,211,238,0.18)", borderRadius: 8, color: "#e2e8f0" }}
            itemStyle={{ color: "#e2e8f0" }}
            labelStyle={{ color: "#f8fafc", fontWeight: 600 }}
            formatter={(value) => [`${Number(value).toFixed(2)}%`, "Change"]}
          />
          <Bar dataKey="changePercent" radius={[4, 4, 4, 4]}>
            {data.map((entry) => (
              <Cell key={entry.sector} fill={entry.changePercent >= 0 ? "#34d399" : "#fb7185"} />
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
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} domain={["dataMin - 6", "dataMax + 6"]} />
          <Tooltip
            contentStyle={{ background: "#07111f", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8 }}
            formatter={(value, name) => [`$${Number(value).toFixed(2)}`, String(name).toUpperCase()]}
          />
          <Line type="monotone" dataKey="close" dot={false} stroke="#f8fafc" strokeWidth={2.4} />
          <Line type="monotone" dataKey="vwap" dot={false} stroke="#22d3ee" strokeDasharray="5 5" strokeWidth={1.8} />
          <Line type="monotone" dataKey="ema50" dot={false} stroke="#fbbf24" strokeWidth={1.8} />
          <Line type="monotone" dataKey="ema200" dot={false} stroke="#a78bfa" strokeWidth={1.8} />
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
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} domain={[20, 85]} />
          <ReferenceLine y={70} stroke="#fb7185" strokeDasharray="5 5" />
          <ReferenceLine y={30} stroke="#34d399" strokeDasharray="5 5" />
          <Tooltip
            contentStyle={{ background: "#07111f", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8 }}
            formatter={(value) => [Number(value).toFixed(1), "RSI"]}
          />
          <Area type="monotone" dataKey="value" stroke="#fbbf24" fill="rgba(251,191,36,0.16)" strokeWidth={2} />
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
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} />
          <ReferenceLine y={0} stroke="rgba(226,232,240,0.35)" />
          <Tooltip
            contentStyle={{ background: "#07111f", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8 }}
            formatter={(value, name) => [Number(value).toFixed(2), String(name).toUpperCase()]}
          />
          <Bar dataKey="histogram" radius={[3, 3, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.histogram >= 0 ? "#34d399" : "#fb7185"} />
            ))}
          </Bar>
          <Line type="monotone" dataKey="macd" dot={false} stroke="#22d3ee" strokeWidth={2} />
          <Line type="monotone" dataKey="signal" dot={false} stroke="#fbbf24" strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

export function VolumeAnalysisChart({ data }: { data: CandlePoint[] }) {
  const average = data.reduce((total, point) => total + point.volume, 0) / data.length;

  return (
    <ChartBox className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(Number(value) / 1_000_000)}M`} />
          <ReferenceLine y={average} stroke="#22d3ee" strokeDasharray="5 5" />
          <Tooltip
            contentStyle={{ background: "#07111f", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8 }}
            formatter={(value) => [`${(Number(value) / 1_000_000).toFixed(1)}M`, "Volume"]}
          />
          <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.close >= entry.open ? "#34d399" : "#fb7185"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartBox>
  );
}

export function CandlestickChart({ data, indicators = [] }: { data: CandlePoint[]; indicators?: ChartIndicator[] }) {
  const [activeCandle, setActiveCandle] = useState<{ point: CandlePoint; x: number; y: number; candleX: number; priceY: number; chartWidth: number; chartHeight: number } | null>(null);
  const width = 900;
  const height = 288;
  const paddingLeft = candleChartInset.left;
  const paddingRight = candleChartInset.right;
  const paddingTop = candleChartInset.top;
  const plotLeft = paddingLeft;
  const plotRight = width - paddingRight;
  const plotWidth = plotRight - plotLeft;
  const volumeTop = height - 58;
  const chartBottom = volumeTop - 10;
  const chartHeight = chartBottom - paddingTop;
  const volumeHeight = 34;

  if (!data.length) {
    return (
      <ChartBox className="h-72 w-full min-h-0">
        <div className="h-full w-full animate-pulse rounded-lg bg-white/[0.06]" />
      </ChartBox>
    );
  }

  const indicatorValues = data.flatMap((point) => [
    indicators.includes("vwap") ? point.vwap : undefined,
    indicators.includes("ema20") ? point.ema20 : undefined,
    indicators.includes("ema50") ? point.ema50 : undefined,
    indicators.includes("ema200") ? point.ema200 : undefined,
    indicators.includes("bollinger") ? point.bollingerUpper : undefined,
    indicators.includes("bollinger") ? point.bollingerLower : undefined
  ]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const rawMin = Math.min(...data.map((point) => point.low), ...indicatorValues);
  const rawMax = Math.max(...data.map((point) => point.high), ...indicatorValues);
  const maxVolume = Math.max(...data.map((point) => point.volume), 1);
  const pricePadding = Math.max((rawMax - rawMin) * 0.08, rawMax * 0.001, 0.05);
  const min = rawMin - pricePadding;
  const max = rawMax + pricePadding;
  const priceRange = Math.max(max - min, 1);
  const scaleY = (value: number) => chartBottom - ((value - min) / priceRange) * chartHeight;
  const step = plotWidth / data.length;
  const bodyWidth = Math.max(5, Math.min(12, step * 0.36));
  const candleXForIndex = (index: number) => plotLeft + index * step + step / 2;
  const closePath = data.map((point, index) => `${index === 0 ? "M" : "L"} ${candleXForIndex(index)} ${scaleY(point.close)}`).join(" ");
  const closeAreaPath = `${closePath} L ${candleXForIndex(data.length - 1)} ${chartBottom} L ${candleXForIndex(0)} ${chartBottom} Z`;
  const indicatorPath = (key: keyof Pick<CandlePoint, "vwap" | "ema20" | "ema50" | "ema200" | "bollingerUpper" | "bollingerLower">) =>
    data.map((point, index) => `${index === 0 ? "M" : "L"} ${candleXForIndex(index)} ${scaleY(point[key])}`).join(" ");
  const gridTicks = Array.from({ length: 4 }, (_, index) => ({
    y: paddingTop + (chartHeight / 3) * index,
    value: max - (priceRange / 3) * index
  }));
  const moveTooltip = (point: CandlePoint, index: number, event: PointerEvent<SVGGElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;

    const bounds = svg.getBoundingClientRect();

    setActiveCandle({
      point,
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      candleX: candleXForIndex(index),
      priceY: scaleY(point.close),
      chartWidth: bounds.width,
      chartHeight: bounds.height
    });
  };
  const tooltipLeft = activeCandle
    ? activeCandle.x + 188 > activeCandle.chartWidth
      ? Math.max(activeCandle.x - 188, 12)
      : activeCandle.x + 12
    : 0;
  const tooltipTop = activeCandle ? Math.min(Math.max(activeCandle.y - 76, 12), Math.max(12, activeCandle.chartHeight - 154)) : 0;

  return (
    <ChartBox className="h-72 w-full min-h-0">
      <div
        className="relative h-full min-h-0 w-full overflow-hidden rounded-lg"
        onPointerLeave={() => setActiveCandle(null)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setActiveCandle(null);
          }
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="block h-full w-full outline-none"
          role="img"
          aria-label="Candlestick chart"
        >
          <defs>
            <linearGradient id="candleCloseGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.2" />
              <stop offset="80%" stopColor="#22d3ee" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
            </linearGradient>
            <filter id="candleGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect
            pointerEvents="none"
            x={plotLeft}
            y={paddingTop}
            width={plotWidth}
            height={chartHeight}
            rx="8"
            fill="rgba(8, 47, 73, 0.08)"
          />
          {gridTicks.map((tick) => (
            <g key={tick.y} pointerEvents="none">
              <line x1={plotLeft} x2={plotRight} y1={tick.y} y2={tick.y} stroke="rgba(148, 163, 184, 0.14)" />
              <text x={plotLeft - 10} y={tick.y + 4} fill="#94a3b8" fontSize="11" textAnchor="end">
                {tick.value.toFixed(2)}
              </text>
            </g>
          ))}
          <path pointerEvents="none" d={closeAreaPath} fill="url(#candleCloseGradient)" />
          <path
            pointerEvents="none"
            d={closePath}
            fill="none"
            stroke="rgba(34, 211, 238, 0.48)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#candleGlow)"
          />
          {data.map((point, index) => {
            const x = candleXForIndex(index);
            const positive = point.close >= point.open;
            const yOpen = scaleY(point.open);
            const yClose = scaleY(point.close);
            const bodyY = Math.min(yOpen, yClose);
            const bodyHeight = Math.max(2, Math.abs(yOpen - yClose));
            const color = positive ? "#34d399" : "#fb7185";
            const wickColor = positive ? "rgba(52, 211, 153, 0.78)" : "rgba(251, 113, 133, 0.78)";
            const volumeHeightForPoint = Math.max(3, (point.volume / maxVolume) * volumeHeight);

            return (
              <g
                key={`${point.label}-${index}`}
                className="cursor-crosshair"
                onPointerEnter={(event) => moveTooltip(point, index, event)}
                onPointerMove={(event) => moveTooltip(point, index, event)}
              >
                <rect x={x - step / 2} y={paddingTop} width={step} height={chartHeight} fill="transparent" />
                <rect
                  pointerEvents="none"
                  x={x - bodyWidth / 2}
                  y={volumeTop + volumeHeight - volumeHeightForPoint}
                  width={bodyWidth}
                  height={volumeHeightForPoint}
                  rx="2"
                  fill={positive ? "rgba(52, 211, 153, 0.28)" : "rgba(251, 113, 133, 0.28)"}
                />
                <line x1={x} x2={x} y1={scaleY(point.high)} y2={scaleY(point.low)} stroke={wickColor} strokeWidth="1.8" strokeLinecap="round" />
                <rect x={x - bodyWidth / 2} y={bodyY} width={bodyWidth} height={bodyHeight} rx="3" fill={color} opacity="0.86" />
              </g>
            );
          })}
        {indicators.includes("bollinger") ? (
          <>
            <path pointerEvents="none" d={indicatorPath("bollingerUpper")} fill="none" stroke="rgba(125, 211, 252, 0.46)" strokeDasharray="5 5" strokeWidth="1.5" />
            <path pointerEvents="none" d={indicatorPath("bollingerLower")} fill="none" stroke="rgba(125, 211, 252, 0.46)" strokeDasharray="5 5" strokeWidth="1.5" />
          </>
        ) : null}
        {indicators.includes("vwap") ? <path pointerEvents="none" d={indicatorPath("vwap")} fill="none" stroke="#22d3ee" strokeWidth="1.8" /> : null}
        {indicators.includes("ema20") ? <path pointerEvents="none" d={indicatorPath("ema20")} fill="none" stroke="#34d399" strokeWidth="1.6" /> : null}
        {indicators.includes("ema50") ? <path pointerEvents="none" d={indicatorPath("ema50")} fill="none" stroke="#fbbf24" strokeWidth="1.6" /> : null}
        {indicators.includes("ema200") ? <path pointerEvents="none" d={indicatorPath("ema200")} fill="none" stroke="#a78bfa" strokeWidth="1.6" /> : null}
        {activeCandle ? (
          <g pointerEvents="none">
            <line
              x1={activeCandle.candleX}
              x2={activeCandle.candleX}
              y1={paddingTop}
              y2={chartBottom}
              stroke="rgba(248, 250, 252, 0.56)"
              strokeWidth="1"
            />
            <line
              x1={plotLeft}
              x2={plotRight}
              y1={activeCandle.priceY}
              y2={activeCandle.priceY}
              stroke="rgba(34, 211, 238, 0.32)"
              strokeDasharray="5 5"
              strokeWidth="1"
            />
            <circle cx={activeCandle.candleX} cy={activeCandle.priceY} r="5" fill="#07111f" stroke="#f8fafc" strokeWidth="1.7" />
            <circle cx={activeCandle.candleX} cy={activeCandle.priceY} r="2.4" fill={activeCandle.point.close >= activeCandle.point.open ? "#34d399" : "#fb7185"} />
          </g>
        ) : null}
        <text pointerEvents="none" x={plotLeft} y={height - 9} fill="#94a3b8" fontSize="12">
          30 sessions / volume
        </text>
        <text pointerEvents="none" x={plotRight} y={height - 9} fill="#94a3b8" fontSize="12" textAnchor="end">
          High ${rawMax.toFixed(2)} / Low ${rawMin.toFixed(2)}
        </text>
      </svg>
      {activeCandle ? (
        <div
          className="pointer-events-none absolute z-10 w-44 rounded-lg border border-white/10 bg-[#07111f]/94 p-3 text-xs text-slate-300 shadow-2xl shadow-black/35 backdrop-blur-xl"
          style={{
            left: tooltipLeft,
            top: tooltipTop
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="font-semibold text-white">Session {activeCandle.point.label}</span>
            <span className={activeCandle.point.close >= activeCandle.point.open ? "text-emerald-300" : "text-rose-300"}>
              {activeCandle.point.close >= activeCandle.point.open ? "Up" : "Down"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <span>Open</span>
            <span className="text-right text-white">${activeCandle.point.open.toFixed(2)}</span>
            <span>High</span>
            <span className="text-right text-white">${activeCandle.point.high.toFixed(2)}</span>
            <span>Low</span>
            <span className="text-right text-white">${activeCandle.point.low.toFixed(2)}</span>
            <span>Close</span>
            <span className="text-right text-white">${activeCandle.point.close.toFixed(2)}</span>
            <span>Volume</span>
            <span className="text-right text-white">{compact.format(activeCandle.point.volume)}</span>
            <span>VWAP</span>
            <span className="text-right text-white">${activeCandle.point.vwap.toFixed(2)}</span>
          </div>
        </div>
      ) : null}
    </div>
    </ChartBox>
  );
}
