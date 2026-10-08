import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

/** Legacy /auth address stays 200 for the Railway health check. */
export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Research Terminal — Open Preview" }] }),
  component: OpenPreview,
});

function OpenPreview() {
  const navigate = useNavigate();
  useEffect(() => { void navigate({ to: "/", replace: true }); }, [navigate]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="space-y-3 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Research Terminal · Staging Preview</p>
        <h1 className="text-xl font-semibold">Opening Research Terminal…</h1>
        <Link to="/" className="text-sm underline">Open dashboard</Link>
      </div>
    </main>
  );
}
