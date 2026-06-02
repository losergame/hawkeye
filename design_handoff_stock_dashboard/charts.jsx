// Charts - SVG, brutalist style
// Exports to window: PriceChart, VolumeChart, OscChart

function PriceChart({ bars, mode, overlays, height }) {
  const [hover, setHover] = React.useState(null);
  const ref = React.useRef(null);
  const W = 1000;
  const H = height || 360;
  const padL = 8, padR = 56, padT = 8, padB = 18;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // Compute price range incl overlays
  const allVals = React.useMemo(() => {
    const v = [];
    bars.forEach(b => { v.push(b.h, b.l); });
    if (overlays.vwap) bars.forEach((b, i) => v.push(b.c)); // approx — vwap close
    return v;
  }, [bars, overlays]);

  const minP = Math.min(...allVals);
  const maxP = Math.max(...allVals);
  const padPx = (maxP - minP) * 0.06;
  const lo = minP - padPx;
  const hi = maxP + padPx;
  const yScale = (p) => padT + innerH - ((p - lo) / (hi - lo)) * innerH;
  const xScale = (i) => padL + (i / (bars.length - 1)) * innerW;

  // Build path for line
  const linePath = bars.map((b, i) =>
    `${i === 0 ? "M" : "L"}${xScale(i).toFixed(2)},${yScale(b.c).toFixed(2)}`
  ).join("");
  const areaPath = linePath + ` L${xScale(bars.length - 1).toFixed(2)},${padT + innerH} L${xScale(0).toFixed(2)},${padT + innerH} Z`;

  // EMAs (rolling)
  const ema = (period) => {
    const k = 2 / (period + 1);
    let prev = bars[0].c;
    return bars.map(b => (prev = b.c * k + prev * (1 - k)));
  };
  const ema20 = React.useMemo(() => ema(20), [bars]);
  const ema50 = React.useMemo(() => ema(50), [bars]);
  const ema200 = React.useMemo(() => ema(200), [bars]);
  const vwap = React.useMemo(() => {
    let cumPV = 0, cumV = 0;
    return bars.map(b => {
      const tp = (b.h + b.l + b.c) / 3;
      cumPV += tp * b.v; cumV += b.v;
      return cumPV / cumV;
    });
  }, [bars]);

  const overlayPath = (arr) => arr.map((v, i) =>
    `${i === 0 ? "M" : "L"}${xScale(i).toFixed(2)},${yScale(v).toFixed(2)}`
  ).join("");

  // Bollinger (20 period)
  const bollinger = React.useMemo(() => {
    const period = 20;
    return bars.map((_, i) => {
      const start = Math.max(0, i - period + 1);
      const window = bars.slice(start, i + 1);
      const mean = window.reduce((s, b) => s + b.c, 0) / window.length;
      const variance = window.reduce((s, b) => s + (b.c - mean) ** 2, 0) / window.length;
      const sd = Math.sqrt(variance);
      return { mean, upper: mean + sd * 2, lower: mean - sd * 2 };
    });
  }, [bars]);

  // Y-axis ticks
  const yTicks = React.useMemo(() => {
    const ticks = [];
    for (let i = 0; i <= 4; i++) ticks.push(lo + (hi - lo) * (i / 4));
    return ticks;
  }, [lo, hi]);

  // Pointer move handler
  function onMove(e) {
    const rect = ref.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width * W;
    const i = Math.round(((relX - padL) / innerW) * (bars.length - 1));
    if (i < 0 || i >= bars.length) { setHover(null); return; }
    setHover(i);
  }

  const last = bars[bars.length - 1];

  return (
    <div className="chart-host" ref={ref}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {/* horizontal grid lines */}
        {yTicks.map((t, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={yScale(t)} y2={yScale(t)}
            stroke="var(--grid-line)" strokeWidth="1" shapeRendering="crispEdges" />
        ))}
        {/* Bollinger bands */}
        {overlays.boll && (
          <g>
            <path d={overlayPath(bollinger.map(b => b.upper))}
              fill="none" stroke="var(--muted-foreground)" strokeWidth="0.8" strokeDasharray="2 3" opacity="0.7" />
            <path d={overlayPath(bollinger.map(b => b.lower))}
              fill="none" stroke="var(--muted-foreground)" strokeWidth="0.8" strokeDasharray="2 3" opacity="0.7" />
          </g>
        )}
        {mode === "line" && (
          <g>
            <path d={areaPath} fill="var(--foreground)" opacity="0.05" />
            <path d={linePath} fill="none" stroke="var(--foreground)" strokeWidth="1.4" shapeRendering="geometricPrecision" />
          </g>
        )}
        {mode === "candle" && (
          <g shapeRendering="crispEdges">
            {bars.map((b, i) => {
              const x = xScale(i);
              const w = Math.max(3, innerW / bars.length * 0.62);
              const up = b.c >= b.o;
              const color = up ? "var(--positive)" : "var(--destructive)";
              return (
                <g key={i}>
                  <line x1={x} x2={x} y1={yScale(b.h)} y2={yScale(b.l)} stroke={color} strokeWidth="0.8" />
                  <rect
                    x={x - w / 2}
                    y={yScale(Math.max(b.o, b.c))}
                    width={w}
                    height={Math.max(1, Math.abs(yScale(b.o) - yScale(b.c)))}
                    fill={color}
                    stroke={color}
                    strokeWidth="0.9"
                  />
                </g>
              );
            })}
          </g>
        )}
        {/* Overlays — dimmed in candle mode so wicks/bodies stay legible */}
        {overlays.vwap && (
          <path d={overlayPath(vwap)} fill="none" stroke="var(--foreground)" strokeWidth="0.8"
            strokeDasharray="4 3" opacity={mode === "candle" ? 0.35 : 0.55} />
        )}
        {overlays.ema20 && (
          <path d={overlayPath(ema20)} fill="none" stroke="var(--foreground)" strokeWidth="0.8"
            opacity={mode === "candle" ? 0.3 : 0.45} />
        )}
        {overlays.ema50 && (
          <path d={overlayPath(ema50)} fill="none" stroke="var(--foreground)" strokeWidth="0.8"
            opacity={mode === "candle" ? 0.45 : 0.65} strokeDasharray="6 2" />
        )}
        {overlays.ema200 && (
          <path d={overlayPath(ema200)} fill="none" stroke="var(--foreground)" strokeWidth="0.8"
            opacity={mode === "candle" ? 0.55 : 0.85} strokeDasharray="2 2" />
        )}
        {/* Last price line (badge rendered as HTML overlay below) */}
        <line x1={padL} x2={W - padR} y1={yScale(last.c)} y2={yScale(last.c)}
          stroke="var(--foreground)" strokeWidth="0.6" strokeDasharray="2 2" opacity="0.5" />
        {/* Crosshair */}
        {hover !== null && (
          <g shapeRendering="crispEdges">
            <line x1={xScale(hover)} x2={xScale(hover)} y1={padT} y2={padT + innerH}
              stroke="var(--foreground)" strokeWidth="0.6" strokeDasharray="2 2" opacity="0.7" />
            <line x1={padL} x2={W - padR} y1={yScale(bars[hover].c)} y2={yScale(bars[hover].c)}
              stroke="var(--foreground)" strokeWidth="0.6" strokeDasharray="2 2" opacity="0.7" />
            <circle cx={xScale(hover)} cy={yScale(bars[hover].c)} r="2.5" fill="var(--foreground)" />
          </g>
        )}
      </svg>
      {/* Y-axis labels rendered as HTML so they stay crisp regardless of SVG scaling */}
      <div className="y-axis">
        {yTicks.map((tick, i) => {
          const top = (yScale(tick) / H) * 100;
          if (Math.abs(yScale(tick) - yScale(last.c)) < 12) return null;
          return (
            <div key={i} className="y-tick" style={{ top: `${top}%` }}>
              {tick.toFixed(tick > 100 ? 1 : 2)}
            </div>
          );
        })}
        <div className="y-badge" style={{ top: `${(yScale(last.c) / H) * 100}%` }}>
          {last.c.toFixed(2)}
        </div>
      </div>
      {hover !== null && (
        <div className="chart-crosshair" style={{ left: `${(xScale(hover) / W) * 100}%`, transform: xScale(hover) / W > 0.7 ? "translateX(-105%)" : "translateX(8px)" }}>
          <div><span className="label">Bar</span>{hover + 1} / {bars.length}</div>
          <div><span className="label">O</span>{bars[hover].o.toFixed(2)}</div>
          <div><span className="label">H</span>{bars[hover].h.toFixed(2)}</div>
          <div><span className="label">L</span>{bars[hover].l.toFixed(2)}</div>
          <div><span className="label">C</span>{bars[hover].c.toFixed(2)}</div>
          <div><span className="label">Vol</span>{window.formatVol(bars[hover].v)}</div>
        </div>
      )}
    </div>
  );
}

function VolumeChart({ bars }) {
  const W = 1000;
  const H = 80;
  const padL = 8, padR = 56, padT = 6, padB = 4;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxV = Math.max(...bars.map(b => b.v));
  return (
    <div className="volume-host">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
        {bars.map((b, i) => {
          const x = padL + (i / (bars.length - 1)) * innerW;
          const w = Math.max(2, innerW / bars.length * 0.7);
          const h = (b.v / maxV) * (innerH - 8);
          const up = b.c >= b.o;
          return (
            <rect key={i}
              x={x - w / 2}
              y={H - padB - h}
              width={w}
              height={h}
              fill={up ? "var(--foreground)" : "var(--destructive)"}
              opacity="0.4"
              shapeRendering="crispEdges"
            />
          );
        })}
      </svg>
      <div className="volume-label">VOLUME</div>
    </div>
  );
}

function OscChart({ values, type, current }) {
  const W = 400;
  const H = 48;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const lo = type === "rsi" ? 0 : min - (max - min) * 0.1;
  const hi = type === "rsi" ? 100 : max + (max - min) * 0.1;
  const x = (i) => (i / (values.length - 1)) * W;
  const y = (v) => H - ((v - lo) / (hi - lo)) * H;
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("");
  return (
    <div className="osc-host">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {type === "rsi" && (
          <g>
            <line x1="0" x2={W} y1={y(70)} y2={y(70)} stroke="var(--destructive)" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.6" />
            <line x1="0" x2={W} y1={y(30)} y2={y(30)} stroke="var(--foreground)" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.4" />
            <line x1="0" x2={W} y1={y(50)} y2={y(50)} stroke="var(--grid-line)" strokeWidth="1" />
          </g>
        )}
        {type === "macd" && (
          <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--muted-foreground)" strokeWidth="0.5" />
        )}
        <path d={path} fill="none" stroke="var(--foreground)" strokeWidth="1" />
      </svg>
    </div>
  );
}

window.PriceChart = PriceChart;
window.VolumeChart = VolumeChart;
window.OscChart = OscChart;
