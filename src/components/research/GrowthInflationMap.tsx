import type { GrowthInflationMapData } from "@/lib/panels/inflation.functions";

/**
 * Four-quadrant Growth × Inflation map. Growth on the x-axis (composite
 * Kalman slope), inflation on the y-axis (core CPI YoY, %). The latest
 * point is highlighted; the trailing 36 months are shown as a fading trail.
 */
export function GrowthInflationMap({ data }: { data: GrowthInflationMapData }) {
  const w = 480, h = 320, pad = 32;
  const xs = data.trail.map((p) => p.growth); const ys = data.trail.map((p) => p.inflation);
  const xMin = Math.min(-1, ...xs), xMax = Math.max(1, ...xs);
  const yMin = Math.min(0, ...ys),  yMax = Math.max(6, ...ys);
  const sx = (v: number) => pad + ((v - xMin) / (xMax - xMin || 1)) * (w - 2 * pad);
  const sy = (v: number) => h - pad - ((v - yMin) / (yMax - yMin || 1)) * (h - 2 * pad);

  return (
    <div className="rounded border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">MA · Growth × Inflation Map (US)</div>
        <div className="text-[11px] text-muted-foreground">Trail: last 36 months</div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
        <rect x={pad} y={pad} width={sx(0) - pad} height={sy(3) - pad} fill="hsl(var(--muted))" opacity="0.15" />
        <rect x={sx(0)} y={pad} width={w - pad - sx(0)} height={sy(3) - pad} fill="hsl(var(--destructive))" opacity="0.12" />
        <rect x={pad} y={sy(3)} width={sx(0) - pad} height={h - pad - sy(3)} fill="hsl(var(--muted))" opacity="0.10" />
        <rect x={sx(0)} y={sy(3)} width={w - pad - sx(0)} height={h - pad - sy(3)} fill="hsl(var(--primary))" opacity="0.10" />
        <line x1={sx(0)} y1={pad} x2={sx(0)} y2={h - pad} stroke="hsl(var(--border))" />
        <line x1={pad} y1={sy(3)} x2={w - pad} y2={sy(3)} stroke="hsl(var(--border))" strokeDasharray="3 3" />
        <text x={pad + 4} y={pad + 12} className="text-[9px] fill-muted-foreground">Deflation</text>
        <text x={w - pad - 60} y={pad + 12} className="text-[9px] fill-muted-foreground">Stagflation</text>
        <text x={pad + 4} y={h - pad - 4} className="text-[9px] fill-muted-foreground">Slowdown</text>
        <text x={w - pad - 60} y={h - pad - 4} className="text-[9px] fill-muted-foreground">Reflation / Goldilocks</text>
        {data.trail.map((p, i) => (
          <circle key={p.date} cx={sx(p.growth)} cy={sy(p.inflation)} r={2}
            fill="hsl(var(--primary))" opacity={0.15 + (0.75 * i) / Math.max(1, data.trail.length - 1)} />
        ))}
        {data.latest && (
          <>
            <circle cx={sx(data.latest.growth)} cy={sy(data.latest.inflation)} r={5} fill="hsl(var(--primary))" />
            <text x={sx(data.latest.growth) + 8} y={sy(data.latest.inflation) - 6} className="text-[10px] fill-foreground">
              {data.latest.quadrant} · {data.latest.date}
            </text>
          </>
        )}
      </svg>
      <div className="mt-2 text-[11px] text-muted-foreground">{data.interpretation}</div>
    </div>
  );
}