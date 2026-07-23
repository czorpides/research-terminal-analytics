import { ResearchPanel } from "./ResearchPanel";
import type { PanelData } from "@/lib/panels/contract";

export function PanelGrid({ panels }: { panels: PanelData[] }) {
  return (
    <div className="grid auto-rows-fr gap-3 md:grid-cols-2 xl:grid-cols-3">
      {panels.map((panel) => (
        <ResearchPanel key={panel.id} data={panel} />
      ))}
    </div>
  );
}
