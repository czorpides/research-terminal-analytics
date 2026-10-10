/** Pure bearer parsing; never confuses publishable keys with user JWTs. */
export const OWNER_AUTH_EMAIL = "owner@research.local";
export function extractBearerToken(header: string | null): string | null {
  if (!header || !/^Bearer [A-Za-z0-9_.-]+$/.test(header)) return null;
  const token = header.slice(7);
  return token.split(".").length === 3 ? token : null;
}
export function isOwnerAuthEmail(email: string | null | undefined): boolean {
  return email?.toLowerCase() === OWNER_AUTH_EMAIL;
}
