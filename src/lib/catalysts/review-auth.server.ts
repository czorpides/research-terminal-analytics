import { timingSafeEqual } from "node:crypto";

/**
 * Independent reviewer token. Ingestion jobs must NEVER be able to approve
 * their own candidate events. Missing/malformed token fails closed.
 */
export function authorizeCatalystReviewRequest(request: Request): boolean {
  const secret=process.env.CATALYST_REVIEW_TOKEN;
  if(!secret||Buffer.byteLength(secret,"utf8")<32)return false;
  const header=request.headers.get("authorization");
  if(!header?.startsWith("Bearer "))return false;
  const expected=Buffer.from(secret,"utf8");
  const supplied=Buffer.from(header.slice(7),"utf8");
  return supplied.length===expected.length && timingSafeEqual(supplied,expected);
}
