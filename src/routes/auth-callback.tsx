import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth-callback")({
  head: () => ({
    meta: [
      { title: "Completing sign-in — Research Terminal" },
      { name: "description", content: "Completing secure sign-in for Research Terminal." },
      { property: "og:title", content: "Research Terminal — Completing sign-in" },
      { property: "og:description", content: "Secure sign-in callback for Research Terminal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthCallbackPage,
});

function collectOAuthParams() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  hash.forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });
  return params;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForAuthenticatedUser() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) return data.user;
    await delay(200);
  }
  return null;
}

function AuthCallbackPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function completeSignIn() {
      try {
        const params = collectOAuthParams();
        const oauthError = params.get("error_description") ?? params.get("error");
        if (oauthError) throw new Error(oauthError);

        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const code = params.get("code");

        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
        } else if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else {
          const { data } = await supabase.auth.getSession();
          if (!data.session) await delay(400);
        }

        const user = await waitForAuthenticatedUser();
        if (!user) throw new Error("Sign-in completed, but no active session was created.");
        if (cancelled) return;

        window.history.replaceState(null, "", "/auth/callback");
        await router.invalidate();
        navigate({ to: "/", replace: true });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Google sign-in failed");
      }
    }

    void completeSignIn();
    return () => {
      cancelled = true;
    };
  }, [navigate, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-4 rounded-md border border-border/70 bg-card p-6 text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Research Terminal
        </div>
        <h1 className="text-lg font-semibold text-foreground">
          {error ? "Sign-in failed" : "Completing sign-in"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {error ?? "Securing your session before opening the terminal."}
        </p>
        {error ? (
          <Button type="button" className="w-full" onClick={() => navigate({ to: "/auth", replace: true })}>
            Back to sign in
          </Button>
        ) : null}
      </div>
    </div>
  );
}