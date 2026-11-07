/** Every admin action. The authorization test iterates this list (non-admins → 403). */
export const ADMIN_ACTIONS = [
  "publish", "reject", "edit", "merge", "unmerge", "dedup-distinct", "resolve-review", "resolve-conflict",
  "correction", "claim", "source-update", "budget", "dead-letter-resolve", "set-role", "reparse",
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];
/** Actions only full admins (not moderators) may take. */
export const ADMIN_ONLY: readonly AdminAction[] = ["source-update", "budget", "set-role", "reparse", "dead-letter-resolve"];
