import { getPool, closePools } from "./client";
import { assertSeedAllowed, seedSynthetic } from "./seed";

assertSeedAllowed();
const n = await seedSynthetic(getPool());
console.log(`seeded ${n} SYNTHETIC demo events (is_synthetic=true, DEMO DATA badge)`);
await closePools();
