// Brutalist Stock Dashboard - main shell

const { useState, useEffect, useMemo, useRef } = React;

function App() {
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "theme": "light",
    "density": "comfortable",
    "upColor": "green",
    "chartMode": "line",
    "timeframe": "1D"
  }/*EDITMODE-END*/;
  const [tweaks, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  // Apply theme class
  useEffect(() => {
    document.documentElement.classList.toggle("dark", tweaks.theme === "dark");
  }, [tweaks.theme]);

  // Apply positive color override
  useEffect(() => {
    const r = document.documentElement;
    if (tweaks.upColor === "green") {
      r.style.setProperty("--positive", tweaks.theme === "dark" ? "oklch(0.74 0.14 145)" : "oklch(0.55 0.14 145)");
    } else {
      r.style.removeProperty("--positive");
    }
  }, [tweaks.upColor, tweaks.theme]);

  const [selected, setSelected] = useState(window.STOCKS[0]);
  const [watchlist, setWatchlist] = useState(["NVDA", "MSFT", "AAPL", "META", "AMD", "TSLA", "MU", "GOOGL"]);
  const [overlays, setOverlays] = useState({ vwap: true, ema20: false, ema50: true, ema200: false, boll: false });
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const bars = useMemo(() =>
    tweaks.timeframe === "1D"
      ? window.buildIntraday(selected)
      : window.buildExtended(selected, tweaks.timeframe),
    [selected, tweaks.timeframe]);

  const rsiSeries = useMemo(() => {
    // simple RSI estimate from bars
    const period = 14;
    let gains = 0, losses = 0;
    const rsi = [];
    for (let i = 1; i < bars.length; i++) {
      const diff = bars[i].c - bars[i - 1].c;
      if (i <= period) {
        if (diff >= 0) gains += diff; else losses -= diff;
        rsi.push(50);
      } else {
        const avgG = gains / period;
        const avgL = losses / period;
        const rs = avgL === 0 ? 100 : avgG / avgL;
        rsi.push(100 - 100 / (1 + rs));
        // smooth
        if (diff >= 0) { gains = (gains * (period - 1) + diff) / period; losses = losses * (period - 1) / period; }
        else { losses = (losses * (period - 1) - diff) / period; gains = gains * (period - 1) / period; }
      }
    }
    return rsi;
  }, [bars]);

  const macdSeries = useMemo(() => {
    const ema = (period, src) => {
      const k = 2 / (period + 1);
      let prev = src[0];
      return src.map(v => (prev = v * k + prev * (1 - k)));
    };
    const closes = bars.map(b => b.c);
    const e12 = ema(12, closes);
    const e26 = ema(26, closes);
    return e12.map((v, i) => v - e26[i]);
  }, [bars]);

  // Keyboard: cmd/ctrl + k focuses search
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filteredSuggestions = useMemo(() => {
    if (!search) return window.STOCKS.slice(0, 6);
    const q = search.toUpperCase();
    return window.STOCKS.filter(s =>
      s.symbol.includes(q) || s.name.toUpperCase().includes(q)
    ).slice(0, 6);
  }, [search]);

  function selectStock(stock) {
    setSelected(stock);
    setSearch("");
    setSearchOpen(false);
  }

  const watchStocks = watchlist.map(sym => window.STOCKS.find(s => s.symbol === sym)).filter(Boolean);
  const gainers = [...window.STOCKS].sort((a, b) => b.changePct - a.changePct).slice(0, 4);
  const losers = [...window.STOCKS].sort((a, b) => a.changePct - b.changePct).slice(0, 3);

  const fmtTime = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const fmtDate = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  // Determine market session
  const etHour = parseInt(now.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }), 10);
  const etMin = parseInt(now.toLocaleTimeString("en-US", { timeZone: "America/New_York", minute: "2-digit" }), 10);
  const etMins = etHour * 60 + etMin;
  const session = etMins >= 9 * 60 + 30 && etMins < 16 * 60 ? "OPEN" : etMins >= 4 * 60 && etMins < 9 * 60 + 30 ? "PRE-MARKET" : etMins >= 16 * 60 && etMins < 20 * 60 ? "AFTER-HOURS" : "CLOSED";

  const tapeItems = useMemo(() => {
    const items = [...window.INDICES];
    return [...items, ...items]; // doubled for seamless loop
  }, []);

  return (
    <div className={"app " + (tweaks.density === "compact" ? "compact" : "")} data-screen-label="01 Dashboard">
      {/* Status bar */}
      <div className="statusbar">
        <div className="group">
          <span><span className={"dot " + (session === "OPEN" ? "live" : "")}></span>NYSE {session}</span>
          <span>{fmtDate}</span>
          <span>{fmtTime} LOCAL</span>
        </div>
        <div className="group">
          <span>FEED: DEMO</span>
          <span>LAT 12ms</span>
          <span>BAR 5m</span>
          <span className="down">VIX 14.21</span>
        </div>
      </div>

      {/* Header */}
      <header className="header">
        <div className="brand">
          <span className="brand-mark"></span>
          HAWKEYE / DESK
        </div>
        <nav>
          <a href="#" className="active">Dashboard</a>
          <a href="#">Scanner</a>
          <a href="#">Portfolio</a>
          <a href="#">Alerts</a>
        </nav>
        <div className="search">
          <span className="icon">⌕</span>
          <input
            id="global-search"
            value={search}
            onChange={e => { setSearch(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            placeholder="Search symbol or company"
          />
          <span className="kbd">⌘K</span>
          {searchOpen && filteredSuggestions.length > 0 && (
            <div className="suggestions">
              {filteredSuggestions.map(s => (
                <button key={s.symbol} onMouseDown={(e) => { e.preventDefault(); selectStock(s); }}>
                  <span className="sym">{s.symbol}</span>
                  &nbsp;&nbsp;<span className="name">{s.name}</span>
                  <span style={{float: "right", fontSize: 11}}>${s.price.toFixed(2)} <span className={s.changePct >= 0 ? "muted" : ""} style={{color: s.changePct >= 0 ? "var(--positive)" : "var(--destructive)"}}>{window.formatPct(s.changePct)}</span></span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Ticker tape */}
      <div className="tape">
        <div className="tape-track">
          {tapeItems.map((item, i) => (
            <div className="tape-item" key={i}>
              <span className="sym">{item.sym}</span>
              <span>{item.val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span>
              <span className={"pct " + (item.pct >= 0 ? "up" : "down")}>{window.formatPct(item.pct)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main 3-col layout */}
      <div className="main">
        {/* Left rail: watchlist */}
        <aside className="rail">
          <div className="rail-section">
            <div className="rail-head">
              <span>Watchlist · {watchStocks.length}</span>
              <button className="add" title="Add">+</button>
            </div>
            {watchStocks.map(s => (
              <button
                key={s.symbol}
                className={"watch-row " + (s.symbol === selected.symbol ? "active" : "")}
                onClick={() => setSelected(s)}
              >
                <div>
                  <div className="sym">{s.symbol}</div>
                  <div className="name">{s.industry}</div>
                </div>
                <div>
                  <div className="price">{s.price.toFixed(2)}</div>
                  <div className={"pct " + (s.changePct >= 0 ? "" : "down")}>
                    {window.formatPct(s.changePct)}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="rail-section" style={{flex: 1, overflowY: "auto"}}>
            <div className="rail-head">Top Picks · AI</div>
            {window.TOP_PICKS.map(p => {
              const s = window.STOCKS.find(x => x.symbol === p.sym);
              if (!s) return null;
              return (
                <button key={p.sym} className="watch-row" onClick={() => setSelected(s)} style={{display: "block"}}>
                  <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4}}>
                    <span className="sym">{p.sym}</span>
                    <span style={{fontSize: 10, fontWeight: 700, padding: "1px 6px", border: "1px solid var(--foreground)"}}>{p.action}</span>
                  </div>
                  <div className="name" style={{fontSize: 10, lineHeight: 1.4, marginBottom: 2}}>{p.thesis}</div>
                  <div className="name" style={{fontSize: 9}}>RISK {p.risk}/10</div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Center: chart + price */}
        <section className="center">
          {/* Ticker bar */}
          <div className="ticker-bar">
            <div>
              <div className="sym">{selected.symbol}</div>
            </div>
            <div className="meta">
              <div className="name">{selected.name}</div>
              <div className="tags">
                <span className="tag">{selected.sector}</span>
                <span className="tag">{selected.industry}</span>
                <span className="tag">NASDAQ</span>
              </div>
            </div>
            <div></div>
            <div className="price-block">
              <div className="price">{selected.price.toFixed(2)}</div>
              <div className={"change " + (selected.changePct >= 0 ? "up" : "down")}>
                {window.formatChange(selected.change)} ({window.formatPct(selected.changePct)})
              </div>
            </div>
          </div>

          {/* Chart controls */}
          <div className="chart-controls">
            <div className="seg">
              {["1D", "1W", "1M", "3M", "YTD", "1Y"].map(tf => (
                <button key={tf}
                  className={tweaks.timeframe === tf ? "active" : ""}
                  onClick={() => setTweak("timeframe", tf)}>{tf}</button>
              ))}
            </div>
            <div className="seg">
              {[["line","Line"],["candle","Candle"]].map(([id, label]) => (
                <button key={id}
                  className={tweaks.chartMode === id ? "active" : ""}
                  onClick={() => setTweak("chartMode", id)}>{label}</button>
              ))}
            </div>
            <div className="ovl">
              <span className="label">Overlays</span>
              {[["vwap","VWAP"],["ema20","EMA 20"],["ema50","EMA 50"],["ema200","EMA 200"],["boll","Bollinger"]].map(([id, label]) => (
                <label key={id} className={overlays[id] ? "on" : ""}>
                  <input type="checkbox" checked={overlays[id]} onChange={() => setOverlays(o => ({...o, [id]: !o[id]}))} style={{display: "none"}} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Chart + volume */}
          <div className="chart-wrap">
            <window.PriceChart bars={bars} mode={tweaks.chartMode} overlays={overlays} />
            <window.VolumeChart bars={bars} />
          </div>

          {/* Stats row */}
          <div className="stats">
            <div className="stat">
              <span className="label">Open</span>
              <span className="val">{selected.open.toFixed(2)}</span>
              <span className="sub">Prev {selected.prevClose.toFixed(2)}</span>
            </div>
            <div className="stat">
              <span className="label">Day Range</span>
              <span className="val">{selected.dayLow.toFixed(2)} – {selected.dayHigh.toFixed(2)}</span>
              <span className="sub">Range {((selected.dayHigh - selected.dayLow) / selected.prevClose * 100).toFixed(2)}%</span>
            </div>
            <div className="stat">
              <span className="label">52-Week</span>
              <span className="val">{selected.low52.toFixed(2)} – {selected.high52.toFixed(2)}</span>
              <span className="sub">{((selected.price - selected.low52) / (selected.high52 - selected.low52) * 100).toFixed(0)}% of range</span>
            </div>
            <div className="stat">
              <span className="label">Volume</span>
              <span className="val">{window.formatVol(selected.volume)}</span>
              <span className={"sub " + (selected.volume >= selected.avgVolume ? "up" : "down")}>
                {(selected.volume / selected.avgVolume * 100).toFixed(0)}% of avg
              </span>
            </div>
            <div className="stat">
              <span className="label">Market Cap</span>
              <span className="val">${selected.marketCap}</span>
              <span className="sub">P/E {selected.peRatio.toFixed(1)}</span>
            </div>
            <div className="stat">
              <span className="label">Beta · Yield</span>
              <span className="val">{selected.beta.toFixed(2)} · {selected.divYield.toFixed(2)}%</span>
              <span className="sub">EPS {selected.eps.toFixed(2)} · ER {selected.nextEarnings}</span>
            </div>
          </div>

          {/* RSI/MACD strip */}
          <div className="osc-strip">
            <div className="osc">
              <div className="osc-head">
                <span>RSI (14)</span>
                <span className="osc-val">{selected.rsi.toFixed(1)}
                  <span className="muted" style={{marginLeft: 8, fontWeight: 400}}>
                    {selected.rsi > 70 ? "OVERBOUGHT" : selected.rsi < 30 ? "OVERSOLD" : "NEUTRAL"}
                  </span>
                </span>
              </div>
              <window.OscChart values={rsiSeries} type="rsi" />
            </div>
            <div className="osc">
              <div className="osc-head">
                <span>MACD (12,26,9)</span>
                <span className="osc-val">{selected.macd.toFixed(2)}
                  <span className="muted" style={{marginLeft: 8, fontWeight: 400}}>
                    {selected.macd > 0 ? "BULLISH" : "BEARISH"}
                  </span>
                </span>
              </div>
              <window.OscChart values={macdSeries} type="macd" />
            </div>
          </div>
        </section>

        {/* Right rail: AI */}
        <aside className="rrail">
          {/* AI Verdict */}
          <div className="rsection">
            <h3>
              <span>AI Recommendation</span>
              <span className="badge">MODEL v3.4</span>
            </h3>
            <div className="verdict">
              <div>
                <div className="action">{selected.rec}</div>
                <div className="upper muted" style={{marginTop: 4}}>{selected.rec === "BUY" ? "Strong signal" : selected.rec === "SELL" ? "Weak signal" : "Mixed signal"}</div>
              </div>
              <div>
                <div className="conf">{selected.bull}%</div>
                <div className="conf-lbl">Bull confidence</div>
              </div>
            </div>
            <div className="verdict-bar">
              <div className="fill" style={{width: selected.bull + "%"}}></div>
              <div className="empty"></div>
            </div>
            <p className="verdict-summary">{selected.thesis}</p>
            <div className="divider"></div>
            <div className="cbars">
              <div className="cbar">
                <div className="top"><span>Bullish</span><span className="v">{selected.bull}%</span></div>
                <div className="track"><div className="fill" style={{width: selected.bull + "%"}}></div></div>
              </div>
              <div className="cbar">
                <div className="top"><span>Bearish</span><span className="v">{selected.bear}%</span></div>
                <div className="track"><div className="fill" style={{width: selected.bear + "%", background: "var(--destructive)"}}></div></div>
              </div>
            </div>
            <div className="divider"></div>
            <div className="risk">
              <span className="label">Risk</span>
              <div className="scale">
                {Array.from({length: 10}, (_, i) => (
                  <span key={i} className={i < selected.risk ? "on" : ""}></span>
                ))}
              </div>
              <span className="score">{selected.risk}/10</span>
            </div>
          </div>

          {/* Reasoning */}
          <div className="rsection">
            <h3><span>Signal Decomposition</span><span className="badge">6 FACTORS</span></h3>
            {selected.reasoning.map(r => (
              <div key={r.label} className="reason">
                <span className={"marker " + r.stance}></span>
                <div>
                  <div className="name">{r.label}</div>
                  <div className="desc">{r.note}</div>
                </div>
                <div className="score">{r.score}/100</div>
              </div>
            ))}
          </div>

          {/* Trade ideas */}
          <div className="rsection">
            <h3><span>Trade Plan</span></h3>
            <div className="kvrow"><span className="k">Action</span><span>{selected.rec}</span></div>
            <div className="kvrow"><span className="k">Earnings</span><span>{selected.nextEarnings}</span></div>
            <div className="kvrow"><span className="k">VWAP</span><span>{selected.vwap.toFixed(2)}</span></div>
            <div className="kvrow"><span className="k">EMA 50</span><span>{selected.ema50.toFixed(2)}</span></div>
            <div className="kvrow"><span className="k">EMA 200</span><span>{selected.ema200.toFixed(2)}</span></div>
            <div className="divider"></div>
            <div className="upper muted" style={{marginBottom: 4}}>Swing idea</div>
            <p style={{margin: "0 0 12px", fontSize: 12, lineHeight: 1.5}}>{selected.swingIdea}</p>
            <div className="upper muted" style={{marginBottom: 4}}>Options flow</div>
            <p style={{margin: 0, fontSize: 12, lineHeight: 1.5}}>{selected.options}</p>
          </div>

          {/* News for selected */}
          <div className="rsection">
            <h3><span>{selected.symbol} News</span><span className="badge">{selected.news.length}</span></h3>
            {selected.news.map((n, i) => (
              <div key={i} className="news-item">
                <div className="meta">
                  <span>{n.src}</span>
                  <span>{n.time} AGO</span>
                </div>
                <div>
                  <span className={"stance " + n.stance}></span>
                  <span className="headline">{n.text}</span>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* Bottom strip */}
      <div className="bottom">
        <section>
          <h4><span>Movers</span><span>SESSION</span></h4>
          <div className="mover-section-head">▲ GAINERS</div>
          {gainers.map(s => (
            <div key={s.symbol} className="mover" onClick={() => setSelected(s)}>
              <span className="sym">{s.symbol}</span>
              <span className="px">{s.price.toFixed(2)}</span>
              <span className={"pct " + (s.changePct >= 0 ? "up" : "down")}>{window.formatPct(s.changePct)}</span>
            </div>
          ))}
          <div className="mover-section-head">▼ LOSERS</div>
          {losers.map(s => (
            <div key={s.symbol} className="mover" onClick={() => setSelected(s)}>
              <span className="sym">{s.symbol}</span>
              <span className="px">{s.price.toFixed(2)}</span>
              <span className={"pct " + (s.changePct >= 0 ? "up" : "down")}>{window.formatPct(s.changePct)}</span>
            </div>
          ))}
        </section>

        <section>
          <h4><span>Heatmap · S&P weighted</span><span>BY MCAP</span></h4>
          <div className="heatmap">
            {window.HEATMAP.map(h => {
              const intensity = Math.min(0.45, Math.abs(h.pct) / 6);
              const stock = window.STOCKS.find(s => s.symbol === h.sym);
              return (
                <button
                  key={h.sym}
                  className={"cell " + (h.pct >= 0 ? "up" : "down")}
                  onClick={() => stock && setSelected(stock)}
                  style={{"--intensity": intensity}}
                >
                  <div className="sym">{h.sym}</div>
                  <div className={"pct " + (h.pct >= 0 ? "up" : "down")}>{window.formatPct(h.pct)}</div>
                </button>
              );
            })}
          </div>
          <div className="divider"></div>
          <h4 style={{marginBottom: 6}}><span>Sectors</span></h4>
          {window.SECTORS.map(s => {
            const pctAbs = Math.min(Math.abs(s.pct) / 3, 1) * 50;
            return (
              <div key={s.name} className="sector-row">
                <span className="name">{s.name}</span>
                <div className="bar">
                  <div className={"fill " + (s.pct >= 0 ? "" : "down")}
                    style={s.pct >= 0
                      ? { left: "50%", width: pctAbs + "%" }
                      : { right: "50%", width: pctAbs + "%" }}>
                  </div>
                </div>
                <span className={"pct " + (s.pct >= 0 ? "up" : "down")}>{window.formatPct(s.pct)}</span>
              </div>
            );
          })}
        </section>

        <section>
          <h4><span>AI Market Brief</span><span>0930 ET</span></h4>
          <p style={{margin: "0 0 12px", fontSize: 12, lineHeight: 1.5}}>{window.MARKET_BRIEF}</p>
          <div className="divider"></div>
          <div className="upper muted" style={{marginBottom: 6}}>Fear & Greed</div>
          <div style={{display: "flex", alignItems: "center", gap: 12, marginBottom: 12}}>
            <div style={{
              fontSize: 32, fontWeight: 700, lineHeight: 1,
              borderRight: "1px solid var(--border)", paddingRight: 12
            }}>63</div>
            <div style={{flex: 1}}>
              <div style={{display: "flex", height: 10, border: "1px solid var(--border)"}}>
                <div style={{flex: "0 0 25%", background: "var(--destructive)", opacity: 0.5}}></div>
                <div style={{flex: "0 0 25%", background: "var(--destructive)", opacity: 0.25}}></div>
                <div style={{flex: "0 0 25%", background: "var(--foreground)", opacity: 0.25}}></div>
                <div style={{flex: "0 0 25%", background: "var(--foreground)", opacity: 0.55}}></div>
              </div>
              <div style={{position: "relative", height: 0}}>
                <div style={{
                  position: "absolute", left: "63%", top: -12,
                  width: 0, height: 0,
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderTop: "6px solid var(--foreground)",
                  transform: "translateX(-5px)"
                }}></div>
              </div>
              <div className="upper muted" style={{display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9}}>
                <span>FEAR</span><span>NEUTRAL</span><span>GREED</span>
              </div>
            </div>
          </div>
          <p style={{margin: 0, fontSize: 11, lineHeight: 1.5, color: "var(--muted-foreground)"}}>
            Momentum and options demand are supportive. Rates remain the main pressure point.
          </p>
        </section>

        <section>
          <h4><span>Market News</span><span>LIVE</span></h4>
          {window.MARKET_NEWS.map((n, i) => (
            <div key={i} className="news-item">
              <div className="meta">
                <span>{n.src}</span>
                <span>{n.time} AGO</span>
              </div>
              <div>
                <span className={"stance " + n.stance}></span>
                <span className="headline">{n.text}</span>
              </div>
            </div>
          ))}
        </section>
      </div>

      {/* Footer */}
      <div className="foot">
        <div>HAWKEYE / DESK · Demo feed · Not financial advice</div>
        <div>Session {session} · {fmtTime} LOCAL</div>
      </div>

      {/* Tweaks */}
      <window.TweaksPanel title="Tweaks">
        <window.TweakSection label="Appearance">
          <window.TweakRadio
            label="Theme"
            value={tweaks.theme}
            options={[{value: "light", label: "Light"}, {value: "dark", label: "Dark"}]}
            onChange={(v) => setTweak("theme", v)}
          />
          <window.TweakRadio
            label="Density"
            value={tweaks.density}
            options={[{value: "comfortable", label: "Default"}, {value: "compact", label: "Compact"}]}
            onChange={(v) => setTweak("density", v)}
          />
          <window.TweakRadio
            label="Gains color"
            value={tweaks.upColor}
            options={[{value: "neutral", label: "Mono"}, {value: "green", label: "Green"}]}
            onChange={(v) => setTweak("upColor", v)}
          />
        </window.TweakSection>
      </window.TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
