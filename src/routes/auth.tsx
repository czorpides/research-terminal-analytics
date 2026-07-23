import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
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
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      const fn =
        mode === "signin"
          ? supabase.auth.signInWithPassword({ email, password })
          : supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: window.location.origin },
            });
      const { error } = await fn;
      if (error) throw error;
      await routeAuthenticatedUser(navigate, router);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError(null);
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        // Full-page OAuth returns before the helper can set the session, so
        // always land on a public callback route that completes the exchange.
        redirect_uri: `${window.location.origin}/auth-callback`,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      await routeAuthenticatedUser(navigate, router);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed");
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
          <h1 className="mt-1 text-lg font-semibold text-foreground">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h1>
        </div>

        <Button type="button" variant="outline" className="w-full" onClick={onGoogle} disabled={busy}>
          {busy ? "Signing in…" : "Continue with Google"}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/70" /></div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
            <span className="bg-card px-2 text-muted-foreground">or email</span>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
          </div>
          {error ? <p className="text-xs text-[var(--negative)]">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => { setError(null); setMode(mode === "signin" ? "signup" : "signin"); }}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "No account? Create one" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}