import { getPool, closePools } from "./client";
import { audit } from "./admin";

/** Usage: pnpm --filter @ff/db grant-role <email> <user|organizer|moderator|admin> */
const [email, role] = process.argv.slice(2);
if (!email || !["user", "organizer", "moderator", "admin"].includes(role ?? "")) { console.error("usage: grant-role <email> <user|organizer|moderator|admin>"); process.exit(1); }
const db = getPool();
const r = await db.query(`UPDATE "user" SET role=$2 WHERE lower(email)=lower($1) RETURNING id`, [email, role]);
if (!r.rowCount) { console.error(`no user with email ${email} (sign up first)`); process.exit(1); }
await audit(db, "cli", "set_role", "user", r.rows[0].id, { role });
console.log(`${email} is now ${role}`);
await closePools();
