/**
 * Cloudflare Workers supports redirect: "manual" and "follow", NOT "error".
 * Use manual to prevent following redirects to arbitrary hosts with provider
 * API tokens/User-Agent headers. Never include a private URL in errors.
 */
export function forceManualRedirect(options: RequestInit = {}): RequestInit {
  return { ...options, redirect: "manual" };
}

export function requireNonRedirectResponse(
  response: Pick<Response, "status" | "type">,
  provider: "SEC EDGAR" | "EODHD",
): void {
  // Opaque redirects can occur on browser/worker fetch implementations.
  if (
    (response.status >= 300 && response.status < 400) ||
    response.type === "opaqueredirect"
  ) {
    throw new Error(
      provider + " unexpectedly redirected the request; redirect refused to protect provider credentials",
    );
  }
}
