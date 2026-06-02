/** Pure indicator math — no side-effects, no imports */

export interface OHLCBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ── EMA ────────────────────────────────────────────────────────────────────

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  let prev = values[0];
  return values.map((v) => (prev = v * k + prev * (1 - k)));
}

// ── Wilder's RSI ───────────────────────────────────────────────────────────

export function rsi(closes: number[], period = 14): number[] {
  if (closes.length < period + 1) return closes.map(() => 50);
  const result: number[] = new Array(period).fill(50);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    gains += Math.max(d, 0);
    losses += Math.max(-d, 0);
  }
  let ag = gains / period;
  let al = losses / period;
  result.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
    result.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  }
  return result;
}

// ── ATR (Wilder's 14-period) ───────────────────────────────────────────────

export function atr(bars: OHLCBar[], period = 14): number[] {
  const tr = bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const pc = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
  const result: number[] = new Array(period - 1).fill(0);
  let prev = tr.slice(0, period).reduce((s, v) => s + v, 0) / period;
  result.push(prev);
  for (let i = period; i < tr.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    result.push(prev);
  }
  return result;
}

// ── MACD ───────────────────────────────────────────────────────────────────

export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9
): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const macdLine = fastEma.map((v, i) => v - slowEma[i]);
  const signalEma = ema(macdLine.slice(slow - 1), signal);
  const signalLine = [...new Array(slow - 1).fill(0), ...signalEma];
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

// ── VWAP ───────────────────────────────────────────────────────────────────

export function vwap(bars: OHLCBar[]): number[] {
  let cumPV = 0, cumV = 0;
  return bars.map((b) => {
    const tp = (b.high + b.low + b.close) / 3;
    cumPV += tp * b.volume;
    cumV += b.volume;
    return cumV > 0 ? cumPV / cumV : tp;
  });
}

// ── Swing detection ────────────────────────────────────────────────────────

export function swingHighs(bars: OHLCBar[], window = 3): (number | null)[] {
  return bars.map((b, i) => {
    const lo = Math.max(0, i - window);
    const hi = Math.min(bars.length - 1, i + window);
    for (let j = lo; j <= hi; j++) {
      if (j !== i && bars[j].high > b.high) return null;
    }
    return b.high;
  });
}

export function swingLows(bars: OHLCBar[], window = 3): (number | null)[] {
  return bars.map((b, i) => {
    const lo = Math.max(0, i - window);
    const hi = Math.min(bars.length - 1, i + window);
    for (let j = lo; j <= hi; j++) {
      if (j !== i && bars[j].low < b.low) return null;
    }
    return b.low;
  });
}

/** Nearest swing high strictly above `price`, or null */
export function nearestResistance(
  bars: OHLCBar[],
  price: number,
  window = 3
): number | null {
  const highs = swingHighs(bars, window);
  let best: number | null = null;
  for (const h of highs) {
    if (h !== null && h > price) {
      if (best === null || h < best) best = h;
    }
  }
  return best;
}

/** Nearest swing low strictly below `price`, or null */
export function nearestSupport(
  bars: OHLCBar[],
  price: number,
  window = 3
): number | null {
  const lows = swingLows(bars, window);
  let best: number | null = null;
  for (const l of lows) {
    if (l !== null && l < price) {
      if (best === null || l > best) best = l;
    }
  }
  return best;
}

/** Current bar volume vs rolling n-period average */
export function volumeRatio(bars: OHLCBar[], period = 20): number {
  if (bars.length < 2) return 1;
  const recent = bars[bars.length - 1].volume;
  const lookback = bars.slice(Math.max(0, bars.length - 1 - period), bars.length - 1);
  const avg = lookback.reduce((s, b) => s + b.volume, 0) / lookback.length;
  return avg > 0 ? recent / avg : 1;
}

// ── Bollinger Bands ────────────────────────────────────────────────────────

export function bollingerBands(
  closes: number[],
  period = 20,
  mult = 2
): { upper: number[]; mid: number[]; lower: number[] } {
  const upper: number[] = [], mid: number[] = [], lower: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = closes.slice(start, i + 1);
    const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
    const sd = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length);
    mid.push(mean);
    upper.push(mean + sd * mult);
    lower.push(mean - sd * mult);
  }
  return { upper, mid, lower };
}
