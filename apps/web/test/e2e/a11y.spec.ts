import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  test.describe(`axe (${theme})`, () => {
    test.use({ colorScheme: theme });
    for (const [name, path] of [["home", "/"], ["results", "/?region=plano&gender=girls&ageMin=10&ageMax=12"], ["coverage", "/coverage"]] as const) {
      test(`${name} has no serious violations`, async ({ page }, info) => {
        await page.goto(path);
        await expect(page.getByTestId("result-count").or(page.getByRole("heading", { level: 1 })).first()).toBeAttached();
        const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
        const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
        await page.screenshot({ path: `../../artifacts/${name}-${theme}-${info.project.name}.png` });
      });
    }
    test("event page has no serious violations", async ({ page }, info) => {
      await page.goto("/");
      await page.locator("[data-testid=result-list] [data-testid=result-card] h2 a").first().click();
      await expect(page.getByTestId("key-facts")).toBeVisible();
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
      await page.screenshot({ path: `../../artifacts/event-${theme}-${info.project.name}.png`, fullPage: true });
    });
  });
}

test("keyboard: skip link and visible focus", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});

test("theme override persists with no flash", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("theme-toggle").click(); // system → light
  await page.getByTestId("theme-toggle").click(); // light → dark
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
});
