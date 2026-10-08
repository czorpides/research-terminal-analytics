import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { authorizeInternalJobRequest } from "@/lib/security/internal-job-auth.server";

const STAGING_ORIGIN = "https://research-terminal-web-staging.up.railway.app";

/**
 * Temporary credential-free development access only for the isolated Railway
 * staging environment. Research reads and on-page writes can run without a
 * Supabase login. Direct privileged HTTP job endpoints retain their own token.
 *
 * Origin and fetch metadata guard accidental CSRF, NOT anonymous attackers:
 * origin headers can be forged by non-browser clients. Do not deploy publicly
 * as a production access-control scheme or use with sensitive user information.
 */
export const stagingReadOnlyFunctions = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    if (!request) throw new Error("Missing request");
    if (request.method === "GET") return next();
    if (authorizeInternalJobRequest(request)) return next();

    const isStaging = process.env.RAILWAY_ENVIRONMENT_NAME === "staging";
    const sameOrigin =
      request.headers.get("origin") === STAGING_ORIGIN &&
      request.headers.get("sec-fetch-site") === "same-origin" &&
      new URL(request.url).pathname.startsWith("/_serverFn/");

    if (isStaging && request.method === "POST" && sameOrigin) return next();
    throw new Error("This action is only available in the staging research interface.");
  },
);
