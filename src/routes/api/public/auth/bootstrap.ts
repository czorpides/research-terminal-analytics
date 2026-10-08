import { createFileRoute } from "@tanstack/react-router";

/** Initial owner creation, guarded by the configured password; never resets it. */
export const Route = createFileRoute("/api/public/auth/bootstrap")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json: unknown = await request.json().catch(() => null);
        const candidate =
          json && typeof json === "object" && "password" in json
            ? (json as { password: unknown }).password
            : undefined;

        try {
          const { bootstrapOwnerIfMissing } = await import("@/lib/auth/owner.server");
          if (!(await bootstrapOwnerIfMissing(candidate))) {
            return new Response("Incorrect password", {
              status: 401,
              headers: { "cache-control": "no-store" },
            });
          }
          return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          console.error("[owner-bootstrap] Unable to initialise owner", error);
          return new Response("Owner account not available", {
            status: 503,
            headers: { "cache-control": "no-store" },
          });
        }
      },
    },
  },
});
