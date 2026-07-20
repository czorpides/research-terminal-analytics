import type { ReactNode } from "react";

export function SectionHeader({
  code,
  title,
  purpose,
  right,
}: {
  code: string;
  title: string;
  purpose: string;
  right?: ReactNode;
}) {
  return (
    <header className="mb-4 flex items-end justify-between gap-4 border-b border-border/70 pb-3">
      <div className="min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(var(--primary))]">
          {code}
        </div>
        <h1 className="mt-0.5 text-lg font-semibold tracking-tight">{title}</h1>
        <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">{purpose}</p>
      </div>
      {right}
    </header>
  );
}