import { Link } from "@tanstack/react-router";
import { Crosshair, Radar } from "lucide-react";
import { cn } from "@/lib/utils";

/** Persistent two-way navigation across the separate research pages. */
export function RadarModeTabs({ current }: { current: "opportunity" | "swing" }) {
  const tabs = [
    { key: "opportunity", to: "/radar", label: "Opportunity Radar", Icon: Radar },
    { key: "swing", to: "/swing-trades", label: "Swing Radar", Icon: Crosshair },
  ] as const;

  return (
    <nav aria-label="Switch research radar" className="sticky top-14 z-20 mb-5 flex w-full gap-1 rounded-xl border border-border/70 bg-background/95 p-1.5 shadow-sm backdrop-blur md:static md:w-fit">
      {tabs.map(({ key, to, label, Icon }) => (
        <Link
          key={key}
          to={to}
          aria-current={current === key ? "page" : undefined}
          className={cn(
            "inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors md:min-w-[170px]",
            current === key
              ? "bg-primary/15 text-primary ring-1 ring-primary/30"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
