import { Maximize2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface DashboardPanelProps {
  title: string;
  description?: string;
  eyebrow?: string;
  children: ReactNode;
  expandedChildren?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  equalHeight?: boolean;
  expandable?: boolean;
}

/**
 * Shared research-surface container. The visual hierarchy deliberately keeps
 * the digital terminal identity while giving headings, summaries and evidence
 * enough breathing room to be read at a glance.
 */
export function DashboardPanel({
  title,
  description,
  eyebrow,
  children,
  expandedChildren,
  actions,
  className,
  bodyClassName,
  equalHeight = true,
  expandable = true,
}: DashboardPanelProps) {
  const content = expandedChildren ?? children;

  return (
    <section
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card/65 shadow-sm",
        equalHeight && "h-full",
        className,
      )}
    >
      <div className="flex min-h-16 items-start justify-between gap-4 border-b border-border/55 px-4 py-3.5">
        <div className="min-w-0">
          {eyebrow && (
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--primary)]">
              {eyebrow}
            </div>
          )}
          <h2 className="mt-0.5 text-base font-semibold leading-tight tracking-tight">{title}</h2>
          {description && (
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {actions}
          {expandable && (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                  aria-label={`Expand ${title}`}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Expand</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[92vh] w-[min(96vw,1280px)] max-w-none overflow-y-auto">
                <DialogHeader className="border-b border-border/55 pb-4 text-left">
                  {eyebrow && (
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--primary)]">
                      {eyebrow}
                    </div>
                  )}
                  <DialogTitle className="text-xl">{title}</DialogTitle>
                  {description && <DialogDescription className="text-sm leading-6">{description}</DialogDescription>}
                </DialogHeader>
                <div className="min-w-0 pt-2">{content}</div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
      <div className={cn("min-w-0 flex-1 p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function DashboardGrid({
  children,
  columns = 3,
  className,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid auto-rows-fr gap-4",
        columns === 2 && "md:grid-cols-2",
        columns === 3 && "md:grid-cols-2 xl:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
