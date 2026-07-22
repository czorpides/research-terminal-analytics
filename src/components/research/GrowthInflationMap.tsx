import type { GrowthInflationMapData } from "@/lib/panels/inflation.functions";

function quadrantLabel(value: string): string {
  return value.replaceAll("_", " ");
}

/**
 * Directional Growth × Inflation map.
 *
 * X is a dimensionless composite of direction-adjusted, rolling-z-scored
 * Growth Engine Kalman slopes. Y is the three-month change in core CPI YoY,
 * measured in percentage points. Inflation level is shown separately so a
 * falling but still-elevated rate is not labelled as full Goldilocks.
 */
export function GrowthInflationMap({ data }: { data: GrowthInflationMapData }) {
  const w = 480, h = 320, pad = 36;
  const xs = data.trail.map((point) => point.growth);
  const ys = data.trail.map((point) => point.inflation);
  const xAbs = Math.max(1, ...xs.map((value) => Math.abs(value)));
  const yAbs = Math.max(0.5, ...ys.map((value) => Math.abs(value)));
  const xMin = -xAbs, xMax = xAbs;
  const yMin = -yAbs, yMax = yAbs;
  const sx = (value: number) => pad + ((value - xMin) / (xMax - xMin || 1)) * (w - 2 * pad);
  const sy = (value: number) => h - pad - ((value - yMin) / (yMax - yMin || 1)) * (h - 2 * pad);

  return (
    <div className="rounded border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">MA · Growth × Inflation Direction Map (US)</div>
          <div className="text-[11px] text-muted-foreground">Growth: dimensionless composite · Inflation: 3-month change in core CPI YoY</div>
        </div>
        <div className="text-[11px] text-muted-foreground">Trail: last 36 months</div>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full">
        <rect x={pad} y={pad} width={sx(0) - pad} height={sy(0) - pad} fill="hsl(var(--destructive))" opacity="0.09" />
        <rect x={sx(0)} y={pad} width={w - pad - sx(0)} height={sy(0) - pad} fill="hsl(var(--destructive))" opacity="0.06" />
        <rect x={pad} y={sy(0)} width={sx(0) - pad} height={h - pad - sy(0)} fill="hsl(var(--muted))" opacity="0.12" />
        <rect x={sx(0)} y={sy(0)} width={w - pad - sx(0)} height={h - pad - sy(0)} fill="hsl(var(--primary))" opacity="0.10" />
        <line x1={sx(0)} y1={pad} x2={sx(0)} y2={h - pad} stroke="hsl(var(--border))" />
        <line x1={pad} y1={sy(0)} x2={w - pad} y2={sy(0)} stroke="hsl(var(--border))" strokeDasharray="3 3" />

        <text x={pad + 4} y={pad + 12} className="fill-muted-foreground text-[8px]">Weakening growth · rising inflation</text>
        <text x={w - pad - 145} y={pad + 12} className="fill-muted-foreground text-[8px]">Improving growth · rising inflation</text>
        <text x={pad + 4} y={h - pad - 4} className="fill-muted-foreground text-[8px]">Weakening growth · falling inflation</text>
        <text x={w - pad - 148} y={h - pad - 4} className="fill-muted-foreground text-[8px]">Improving growth · falling inflation</text>

        {data.trail.map((point, index) => (
          <circle
            key={point.date}
            cx={sx(point.growth)}
            cy={sy(point.inflation)}
            r={2}
            fill="hsl(var(--primary))"
            opacity={0.15 + (0.75 * index) / Math.max(1, data.trail.length - 1)}
          />
        ))}
        {data.latest && (
          <>
            <circle cx={sx(data.latest.growth)} cy={sy(data.latest.inflation)} r={5} fill="hsl(var(--primary))" />
            <text x={sx(data.latest.growth) + 8} y={sy(data.latest.inflation) - 6} className="fill-foreground text-[9px]">
              {data.latest.date}
            </text>
          </>
        )}
      </svg>

      {data.latest && (
        <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-4">
          <div><span className="text-muted-foreground">Growth direction</span><div className="font-mono">{data.latest.growth.toFixed(2)}</div></div>
          <div><span className="text-muted-foreground">Inflation direction</span><div className="font-mono">{data.latest.inflation.toFixed(2)} pp / 3m</div></div>
          <div><span className="text-muted-foreground">Core CPI level</span><div className="font-mono">{data.latest.inflationLevel.toFixed(2)}% YoY</div></div>
          <div><span className="text-muted-foreground">Coverage</span><div className="font-mono">{data.latest.confidence.toFixed(0)}%</div></div>
        </div>
      )}

      {data.latest && (
        <div className="mt-2 rounded bg-muted/40 p-2 text-[11px]">
          <div className="font-medium">{data.latest.tendency}</div>
          <div className="capitalize text-muted-foreground">Directional quadrant: {quadrantLabel(data.latest.directionalQuadrant)}</div>
        </div>
      )}

      {data.growthContributions.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            Growth composite contribution ledger · {data.growthCompositeVersion}
          </div>
          <div className="grid gap-1 text-[10px]">
            {data.growthContributions.map((contribution) => (
              <div key={contribution.conceptCode} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-border/40 py-1 last:border-b-0">
                <span>{contribution.conceptCode.replaceAll("_", " ")}</span>
                <span className="font-mono text-muted-foreground">z {contribution.standardisedSlope.toFixed(2)} · w {(contribution.effectiveWeight * 100).toFixed(0)}%</span>
                <span className="font-mono">{contribution.weightedContribution >= 0 ? "+" : ""}{contribution.weightedContribution.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2 text-[11px] text-muted-foreground">{data.interpretation}</div>
    </div>
  );
}
