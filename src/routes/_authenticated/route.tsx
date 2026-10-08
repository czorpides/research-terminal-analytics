// Staging research preview: all research routes open without user credentials.
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: () => <Outlet />,
});
