/**
 * Free-tier mode: run the job worker and the scheduler in ONE process, so a single small
 * container can host web + background work (see scripts/start-all.sh, ADR-022).
 * On paid hosting, run `pnpm worker` and `pnpm scheduler` as separate services instead.
 */
await import("./worker");
await import("./scheduler");
export {};
