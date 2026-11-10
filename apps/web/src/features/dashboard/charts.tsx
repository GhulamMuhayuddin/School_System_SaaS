import { useId, useState } from 'react';
import { buildAreaPath, scalePoints, smoothPath } from './chart-utils';

const cleanId = (raw: string): string => raw.replace(/[^a-zA-Z0-9_-]/g, '');

/** Tiny trend line used inside the stat cards. Decorative, so hidden from screen readers. */
export function Sparkline({ values, color, className }: { values: readonly number[]; color: string; className?: string }) {
  const gradientId = cleanId(useId());
  const points = scalePoints([...values], 100, 36, Math.min(...values), Math.max(...values), 2, 5);
  return (
    <svg viewBox="0 0 100 36" preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={buildAreaPath(points, 36)} fill={`url(#${gradientId})`} />
      <path d={smoothPath(points)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export interface ChartSeries {
  key: string;
  name: string;
  color: string;
  values: readonly number[];
}

interface LineChartProps {
  labels: string[];
  series: ChartSeries[];
  ariaLabel: string;
}

const W = 640;
const H = 260;
const PAD = { left: 44, right: 16, top: 14, bottom: 30 };
const TICKS = [0, 25, 50, 75, 100];

/** Percentage line chart (0-100%) with hover tooltip and a hidden data table for screen readers. */
export function LineChart({ labels, series, ariaLabel }: LineChartProps) {
  const gradientId = cleanId(useId());
  const [hover, setHover] = useState<number | null>(null);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const lines = series.map((s) => ({ ...s, points: scalePoints([...s.values], plotW, plotH, 0, 100) }));
  const columnW = labels.length > 1 ? plotW / (labels.length - 1) : plotW;
  const hoverX = hover !== null && lines[0] ? lines[0].points[hover]?.x : undefined;
  const tooltipLeft = hoverX === undefined ? 0 : Math.min(86, Math.max(14, ((PAD.left + hoverX) / W) * 100));

  return (
    <div dir="ltr" onMouseLeave={() => setHover(null)}>
      <ul className="mb-2 flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs font-semibold text-muted">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
            {s.name}
          </li>
        ))}
      </ul>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="h-auto w-full">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={series[0]?.color ?? '#2F62E8'} stopOpacity="0.18" />
              <stop offset="100%" stopColor={series[0]?.color ?? '#2F62E8'} stopOpacity="0" />
            </linearGradient>
          </defs>
          <g transform={`translate(${PAD.left},${PAD.top})`}>
            {TICKS.map((tick) => {
              const y = (1 - tick / 100) * plotH;
              return (
                <g key={tick}>
                  <line x1={0} x2={plotW} y1={y} y2={y} stroke="#E2E8F3" strokeDasharray="4 4" />
                  <text x={-10} y={y + 4} textAnchor="end" fontSize="12" fill="#5B6781">{tick}%</text>
                </g>
              );
            })}
            {labels.map((label, i) => (
              <text key={label} x={lines[0]?.points[i]?.x ?? 0} y={plotH + 20} textAnchor="middle" fontSize="12" fill="#5B6781">{label}</text>
            ))}
            {hoverX !== undefined && <line x1={hoverX} x2={hoverX} y1={0} y2={plotH} stroke="#BCD0FF" strokeWidth="1.5" />}
            {lines[0] && <path d={buildAreaPath(lines[0].points, plotH)} fill={`url(#${gradientId})`} />}
            {lines.map((line) => (
              <g key={line.key}>
                <path d={smoothPath(line.points)} fill="none" stroke={line.color} strokeWidth="2.5" strokeLinecap="round" />
                {line.points.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={hover === i ? 6 : 4} fill="#fff" stroke={line.color} strokeWidth="2.5" />
                ))}
              </g>
            ))}
            {labels.map((label, i) => (
              <rect
                key={label}
                x={(lines[0]?.points[i]?.x ?? 0) - columnW / 2}
                y={0}
                width={columnW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onTouchStart={() => setHover(i)}
              />
            ))}
          </g>
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-control bg-navy-900 px-3 py-2 text-xs text-white shadow-pop"
            style={{ left: `${tooltipLeft}%` }}
          >
            <p className="mb-1 font-bold">{labels[hover]}</p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                {s.name}: <span className="font-semibold">{s.values[hover]}%</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col" />
            {series.map((s) => <th key={s.key} scope="col">{s.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, i) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {series.map((s) => <td key={s.key}>{s.values[i]}%</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface DonutProps {
  percent: number;
  label: string;
  ariaLabel: string;
  color: string;
  trackColor: string;
}

/** Progress ring with the percentage in the middle. */
export function DonutChart({ percent, label, ariaLabel, color, trackColor }: DonutProps) {
  const size = 168;
  const stroke = 20;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={ariaLabel}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold text-navy-900">{pct}%</span>
        <span className="text-sm text-muted">{label}</span>
      </div>
    </div>
  );
}
