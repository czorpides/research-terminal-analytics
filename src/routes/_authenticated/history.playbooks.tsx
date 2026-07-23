import { createFileRoute } from "@tanstack/react-router";
import {
  HistoryWorkspacePage,
  historyWorkspaceQueryOptions,
} from "@/components/research/HistoryWorkspace";
export const Route = createFileRoute("/_authenticated/history/playbooks")({
  loader: ({ context }) => context.queryClient.ensureQueryData(historyWorkspaceQueryOptions),
  component: () => <HistoryWorkspacePage mode="playbooks" />,
});
