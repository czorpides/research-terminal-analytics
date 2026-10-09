import { createFileRoute } from "@tanstack/react-router";

/** Password bootstrap is disabled in the open staging research preview. */
export const Route = createFileRoute("/api/public/auth/bootstrap")({
  server: {
    handlers: {
      POST: () => new Response("Sign-in disabled in research preview", {
        status: 410,
        headers: { "cache-control": "no-store" },
      }),
    },
  },
});
