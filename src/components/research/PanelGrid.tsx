import { ResearchPanel } from "./ResearchPanel";
import type { PanelData } from "@/lib/panels/contract";

export function PanelGrid({ panels }: { panels: PanelData[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {panels.map((p) => <ResearchPanel key={p.id} data={p} />)}
    </div>
  );
}