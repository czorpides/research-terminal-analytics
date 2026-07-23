import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { ensureOwnerAccount, OWNER_EMAIL } from "@/lib/auth/owner.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Research Terminal" },
      { name: "description", content: "Sign in to access your private research operating system." },
      { property: "og:title", content: "Research Terminal — Sign in" },
      { property: "og:description", content: "Private research dashboard sign-in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

async function routeAuthenticatedUser(
  navigate: ReturnType<typeof useNavigate>,
  router: ReturnType<typeof useRouter>,
) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw error ?? new Error("Sign-in completed, but no active session was found.");
  }
  await router.invalidate();
  navigate({ to: "/", replace: true });
}

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ensureOwner = useServerFn(ensureOwnerAccount);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void routeAuthenticatedUser(navigate, router);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
        void routeAuthenticatedUser(navigate, router);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // Ensure the single owner account exists with the current password.
      await ensureOwner({});
      const { error } = await supabase.auth.signInWithPassword({
        email: OWNER_EMAIL,
        password,
      });
      if (error) throw new Error("Incorrect password");
      await routeAuthenticatedUser(navigate, router);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Incorrect password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 rounded-md border border-border/70 bg-card p-6">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Research Terminal
          </div>
          <h1 className="mt-1 text-lg font-semibold text-foreground">Enter password</h1>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error ? <p className="text-xs text-[var(--negative)]">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "…" : "Enter"}
          </Button>
        </form>
      </div>
    </div>
  );
}