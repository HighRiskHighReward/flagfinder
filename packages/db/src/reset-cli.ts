import { loadEnv } from "@ff/config";
import { getPool, closePools } from "./client";
import { migrate, resetSchema } from "./migrate";

if (loadEnv().appEnv === "production" || process.env.NODE_ENV === "production") throw new Error("db:reset refuses to run in production");
const db = getPool();
await resetSchema(db);
await migrate(db, (m) => console.log(m));
await closePools();
