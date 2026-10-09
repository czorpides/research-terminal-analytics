import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { authorizeInternalJobRequest } from "@/lib/security/internal-job-auth.server";

/**
 * The isolated staging research preview does not require a user session.
 * Only GET server functions are callable anonymously. Any POST server function
 * needs the dedicated server-only internal job token; in particular, callers
 * cannot run ingestions, recompute scores, or mutate the research store.
 *
 * Do not carry this middleware into public production without a full auth review.
 */
export const stagingReadOnlyFunctions = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    if (request?.method === "GET") return next();
    if (!request || !authorizeInternalJobRequest(request)) {
      throw new Error("Research preview is read-only; administrative actions are disabled.");
    }
    return next();
  },
);
