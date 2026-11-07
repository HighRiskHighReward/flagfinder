import { expect, test } from "@playwright/test";
import pg from "pg";

/** Scraped text containing markup must render as inert text. Uses a SYNTHETIC record. */
test("XSS payload in scraped text is rendered inert", async ({ page }) => {
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://flagfinder:flagfinder@localhost:5432/flagfinder" });
  const slug = `demo-xss-${Date.now()}`;
  const ev = (await db.query(`INSERT INTO events (slug, name, timezone, sport_scope, publish_state, is_synthetic, start_date, end_date, date_precision, description)
     VALUES ($1, $2, 'America/Chicago', 'flag', 'published', true, current_date + 5, current_date + 5, 'day', $3) RETURNING id`,
    [slug, `DEMO <img src=x onerror="window.__xss=1"> Cup`, `<script>window.__xss=2</script>`])).rows[0].id;
  try {
    await page.goto(`/events/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("<img src=x onerror=");
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(await page.locator("img[src=x]").count()).toBe(0);
  } finally {
    await db.query(`DELETE FROM events WHERE id=$1`, [ev]);
    await db.end();
  }
});
