import "server-only";
import { headers as nextHeaders } from "next/headers";
import { auth } from "./auth";

export type Role = "user" | "organizer" | "moderator" | "admin";
export interface CurrentUser { id: string; email: string; name: string; role: Role; emailVerified: boolean }

export async function currentUser(h?: Headers): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: h ?? (await nextHeaders()) }).catch(() => null);
  if (!session?.user) return null;
  const u = session.user as typeof session.user & { role?: Role };
  return { id: u.id, email: u.email, name: u.name, role: u.role ?? "user", emailVerified: u.emailVerified };
}

const RANK: Record<Role, number> = { user: 0, organizer: 1, moderator: 2, admin: 3 };
export function hasRole(u: CurrentUser | null, min: Role): boolean { return !!u && RANK[u.role] >= RANK[min]; }

/** Server-side authorization for every admin request. Returns a 401/403 Response or the user. */
export async function requireRole(req: Request | null, min: Role): Promise<CurrentUser | Response> {
  const u = await currentUser(req?.headers);
  if (!u) return Response.json({ error: "Sign in required" }, { status: 401 });
  if (!hasRole(u, min)) return Response.json({ error: "Forbidden" }, { status: 403 });
  return u;
}
