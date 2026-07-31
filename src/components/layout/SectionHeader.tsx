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
    <header className="mb-6 flex flex-col gap-4 border-b border-border/70 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--primary)]">
          {code}
        </div>
        <h1 className="mt-1.5 max-w-5xl text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">{purpose}</p>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}
