import { createFileRoute } from "@tanstack/react-router";
import {
  AltDataWorkspacePage,
  altDataWorkspaceQueryOptions,
} from "@/components/research/AltDataWorkspace";
export const Route = createFileRoute("/_authenticated/alt-data/model-health")({
  loader: ({ context }) => context.queryClient.ensureQueryData(altDataWorkspaceQueryOptions),
  component: () => <AltDataWorkspacePage mode="model-health" />,
});
