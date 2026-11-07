import { getPool, closePools } from "./client";
import { migrate } from "./migrate";

await migrate(getPool(), (m) => console.log(m));
console.log("migrations up to date");
await closePools();
