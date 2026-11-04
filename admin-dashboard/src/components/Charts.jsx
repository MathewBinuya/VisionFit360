import { useRef, useState, useLayoutEffect } from "react";
import { shortDate } from "../lib/format";

// Measure the container's pixel width so SVG marks (dots, bars) stay undistorted
// and the chart reflows from phone to desktop.
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const ACCENT = "var(--chart)";

// ---- Line / area chart over time (single series) ----
export function LineChart({ data, height = 190 }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);

  const padL = 34, padR = 24, padT = 12, padB = 24;
  const innerW = Math.max(w - padL - padR, 10);
  const innerH = height - padT - padB;

  const max = Math.max(1, ...data.map((d) => d.count));
  const n = data.length;
  const x = (i) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v) => padT + innerH - (v / max) * innerH;

  const linePath = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.count)}`).join(" ");
  const areaPath =
    n > 0
      ? `${linePath} L${x(n - 1)},${padT + innerH} L${x(0)},${padT + innerH} Z`
      : "";

  // y ticks: 0, mid, max
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(i) - px);
      if (d < bestD) { bestD = d; best = i; }
    }
    setHover(best);
  };

  return (
    <div ref={ref} className="chart-wrap" style={{ position: "relative" }}>
      {w > 0 && (
        <svg width={w} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} className="chart-grid" />
              <text x={padL - 6} y={y(t) + 3} textAnchor="end" className="chart-tick">{t}</text>
            </g>
          ))}
          {areaPath && <path d={areaPath} fill={ACCENT} fillOpacity="0.06" />}
          <path d={linePath} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {hover != null && data[hover] && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} className="chart-crosshair" />
              <circle cx={x(hover)} cy={y(data[hover].count)} r="4" fill={ACCENT} stroke="var(--cards)" strokeWidth="2" />
            </>
          )}
          {/* sparse x labels: first, middle, last */}
          {[0, Math.floor((n - 1) / 2), n - 1]
            .filter((v, i, a) => v >= 0 && a.indexOf(v) === i)
            .map((i) => (
              <text key={i} x={x(i)} y={height - 6} textAnchor="middle" className="chart-tick">
                {shortDate(data[i].date)}
              </text>
            ))}
        </svg>
      )}
      {hover != null && data[hover] && w > 0 && (
        <div
          className="chart-tooltip"
          style={{
            left: Math.min(Math.max(x(hover), 60), w - 60),
            top: 4,
          }}
        >
          <strong>{data[hover].count}</strong> {data[hover].count === 1 ? "entry" : "entries"}
          <div className="chart-tooltip-sub">{shortDate(data[hover].date)}</div>
        </div>
      )}
    </div>
  );
}

// ---- Vertical column chart (single series over a few labelled categories) ----
// Used for the monthly (by week) and yearly (by month) analytics. One measure
// per chart on one axis — two measures (e.g. new users vs sessions) go in two
// separate charts, never a dual axis.
export function ColumnChart({ data, height = 200, unit = "" }) {
  // data: [{ label, value }]
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);

  const padL = 34, padR = 12, padT = 14, padB = 28;
  const innerW = Math.max(w - padL - padR, 10);
  const innerH = height - padT - padB;

  const n = data.length;
  const max = Math.max(1, ...data.map((d) => d.value));
  const band = n > 0 ? innerW / n : innerW;
  const barW = Math.min(44, band * 0.6);
  const cx = (i) => padL + band * i + band / 2;        // centre of each band
  const barH = (v) => (v / max) * innerH;
  const baseY = padT + innerH;
  const y0 = (v) => padT + innerH - (v / max) * innerH; // y pixel for a gridline value

  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div ref={ref} className="chart-wrap" style={{ position: "relative" }}>
      {w > 0 && (
        <svg width={w} height={height} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={y0(t)} y2={y0(t)} className="chart-grid" />
              <text x={padL - 6} y={y0(t) + 3} textAnchor="end" className="chart-tick">{t}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const h = barH(d.value);
            return (
              <g key={i}>
                {/* full-height hit target so the whole column catches the hover */}
                <rect
                  x={cx(i) - band / 2} y={padT} width={band} height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
                <rect
                  x={cx(i) - barW / 2} y={baseY - h} width={barW} height={Math.max(h, 0)}
                  rx="3" fill={ACCENT}
                  fillOpacity={hover == null || hover === i ? 1 : 0.35}
                  style={{ transition: "fill-opacity 0.12s" }}
                  pointerEvents="none"
                />
                <text x={cx(i)} y={height - 8} textAnchor="middle" className="chart-tick">
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {hover != null && data[hover] && w > 0 && (
        <div
          className="chart-tooltip"
          style={{ left: Math.min(Math.max(cx(hover), 48), w - 48), top: 4 }}
        >
          <strong>{data[hover].value}</strong>{unit ? ` ${unit}` : ""}
          <div className="chart-tooltip-sub">{data[hover].label}</div>
        </div>
      )}
    </div>
  );
}

// ---- Horizontal bar chart (ranked categories, single series) ----
export function BarChart({ data, valueSuffix = "" }) {
  // data: [{ label, value, sub }]
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="hbar-list">
      {data.map((d, i) => (
        <div className="hbar-row" key={i} title={`${d.label}: ${d.value}${valueSuffix}`}>
          <div className="hbar-label" title={d.label}>{d.label}</div>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <div className="hbar-value">
            {d.value}
            {d.sub ? <span className="hbar-sub"> · {d.sub}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
