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
 * Shared research-surface container.
 *
 * The compact view keeps dashboard grids visually consistent. The expanded
 * view gives charts, tables and narratives enough room without forcing every
 * panel on the page to grow to the height of the most detailed one.
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
        "flex min-w-0 flex-col overflow-hidden rounded-md border border-border/70 bg-card/70 shadow-sm",
        equalHeight && "h-full",
        className,
      )}
    >
      <div className="flex min-h-14 items-start justify-between gap-3 border-b border-border/55 px-3 py-2.5">
        <div className="min-w-0">
          {eyebrow && (
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--primary)]">
              {eyebrow}
            </div>
          )}
          <h2 className="text-sm font-semibold leading-tight tracking-tight">{title}</h2>
          {description && (
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {expandable && (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                  aria-label={`Expand ${title}`}
                >
                  <Maximize2 className="h-3 w-3" />
                  <span className="hidden sm:inline">Expand</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[92vh] w-[min(96vw,1180px)] max-w-none overflow-y-auto">
                <DialogHeader className="border-b border-border/55 pb-3 text-left">
                  {eyebrow && (
                    <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--primary)]">
                      {eyebrow}
                    </div>
                  )}
                  <DialogTitle>{title}</DialogTitle>
                  {description && <DialogDescription>{description}</DialogDescription>}
                </DialogHeader>
                <div className="min-w-0 pt-1">{content}</div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
      <div className={cn("min-w-0 flex-1 p-3", bodyClassName)}>{children}</div>
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
        "grid auto-rows-fr gap-3",
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
