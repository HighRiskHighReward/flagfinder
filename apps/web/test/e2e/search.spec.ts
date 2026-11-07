import { expect, test, type Page } from "@playwright/test";

async function apiIds(page: Page, qs: string): Promise<string[]> {
  const r = await page.request.get(`/api/search?${qs}`);
  const d = await r.json();
  return d.results.map((x: { id: string }) => x.id);
}
async function listIds(page: Page): Promise<string[]> {
  return page.locator("[data-testid=result-list] [data-testid=result-card]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.eventId!));
}
async function showMap(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByTestId("view-map").click();
  await expect(page.getByTestId("map")).toHaveAttribute("data-provider", "test-dom");
}

test("journey: girls 10–12 near Plano, next 30 days (no instructions needed)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("result-count")).toContainText(/events · \d+ on map/);
  await page.getByTestId("filter-location").selectOption("plano");
  await expect(page).toHaveURL(/region=plano/);
  await page.getByTestId("chip-girls").click();
  await expect(page).toHaveURL(/chips=girls/);
  await page.getByTestId("filter-age-min").selectOption("10");
  await expect(page).toHaveURL(/ageMin=10/);
  await page.getByTestId("filter-age-max").selectOption("12");
  await expect(page).toHaveURL(/ageMax=12/);
  await page.getByTestId("filter-dates").selectOption("next30");
  await expect(page).toHaveURL(/next30/);
  await expect(page.getByTestId("result-count")).not.toContainText("Updating");
  const expected = await apiIds(page, new URL(page.url()).search.slice(1));
  expect(expected.length).toBeGreaterThan(0);
  expect((await listIds(page)).slice(0, expected.length)).toEqual(expected.slice(0, 25));
  // Every result has a girls division and starts within 30 days.
  const r = await (await page.request.get(`/api/search?${new URL(page.url()).search.slice(1)}`)).json();
  for (const x of r.results) {
    expect(x.divisionsSummary.some((d: string) => /girls/i.test(d))).toBe(true);
    expect(x.ageMatch === "definite" || x.ageMatch === "possible").toBe(true);
    expect(x.startDate <= r.resolved.to).toBe(true);
  }
  // Open an event and see the key facts above the fold.
  await page.locator("[data-testid=result-list] [data-testid=result-card] h2 a").first().click();
  await expect(page.getByTestId("key-facts")).toBeVisible();
  await expect(page.getByTestId("key-facts")).toBeInViewport();
});

test("map/list sync: pins = list items with coordinates; hover and tap link", async ({ page, isMobile }) => {
  await page.goto("/?region=dfw");
  await showMap(page, isMobile);
  const map = page.getByTestId("map");
  const mappableCards = await page.locator("[data-testid=result-list] [data-testid=result-card][data-mappable=true]").count();
  const allCards = await page.locator("[data-testid=result-list] [data-testid=result-card]").count();
  const total = Number((await page.getByTestId("result-count").innerText()).match(/(\d+) events/)![1]);
  const onMap = Number((await page.getByTestId("result-count").innerText()).match(/(\d+) on map/)![1]);
  expect(Number(await map.getAttribute("data-pin-count"))).toBe(onMap);
  if (allCards === total) expect(mappableCards).toBe(onMap);
  // pins + cluster sizes on screen account for every pin
  const pins = await page.locator("[data-testid=map-pin]").count();
  const clusters = await page.locator("[data-testid=map-cluster]").evaluateAll((els) => els.reduce((n, e) => n + Number(e.textContent), 0));
  expect(pins + clusters).toBe(onMap);
  if (!isMobile) {
    const firstPin = page.locator("[data-testid=map-pin]").first();
    const eventId = await firstPin.getAttribute("data-event-id");
    await firstPin.click();
    await expect(page.locator(`#card-${eventId}`)).toHaveAttribute("data-active", "true");
    await expect(page.locator(`#card-${eventId}`)).toBeInViewport();
    // Hover a card → its pin highlights
    const card = page.locator("[data-testid=result-list] [data-testid=result-card][data-mappable=true]").nth(1);
    const cid = await card.getAttribute("data-event-id");
    await card.hover();
    await expect(page.locator(`[data-testid=map-pin][data-event-id="${cid}"].active, [data-testid=map-cluster]`).first()).toBeVisible();
  } else {
    const firstPin = page.locator("[data-testid=map-pin]").first();
    const eventId = await firstPin.getAttribute("data-event-id");
    await firstPin.tap();
    await expect(page.getByTestId("bottom-sheet").locator(`#sheet-${eventId}`)).toHaveAttribute("data-active", "true");
  }
});

test("search this area updates both list and map; never re-queries silently on pan", async ({ page, isMobile }) => {
  await page.goto("/?region=dfw");
  await showMap(page, isMobile);
  const before = page.url();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.getByTestId("search-this-area")).toBeVisible();
  expect(page.url()).toBe(before); // no silent re-query
  await page.getByTestId("search-this-area").click();
  await expect(page).toHaveURL(/bbox=/);
  await expect(page.getByTestId("result-count")).not.toContainText("Updating");
  const txt = await page.getByTestId("result-count").innerText();
  const onMap = Number(txt.match(/(\d+) on map/)![1]);
  await expect(page.getByTestId("map")).toHaveAttribute("data-pin-count", String(onMap));
  const ids = await apiIds(page, new URL(page.url()).search.slice(1));
  expect(Number(txt.match(/(\d+) event/)![1])).toBe(ids.length);
});

test("URL state: shared URL restores identical results; back/forward/refresh preserve state", async ({ page, browser }) => {
  const url = "/?region=dfw&gender=girls&sort=nearest";
  await page.goto(url);
  const a = await listIds(page);
  const other = await browser.newPage();
  await other.goto(url);
  expect(await listIds(other)).toEqual(a);
  await other.close();
  await page.getByTestId("sort").selectOption("soonest");
  await expect(page).toHaveURL(/sort=soonest/);
  const b = await listIds(page);
  await page.goBack();
  await expect(page).toHaveURL(/sort=nearest/);
  await expect.poll(() => listIds(page)).toEqual(a);
  await page.goForward();
  await expect(page).toHaveURL(/sort=soonest/);
  await expect.poll(() => listIds(page)).toEqual(b);
  await page.reload();
  expect(await listIds(page)).toEqual(b);
  await expect(page.getByTestId("sort")).toHaveValue("soonest");
});

test("empty state offers useful next actions", async ({ page }) => {
  await page.goto("/?region=plano&gender=womens&ageMin=40&ageMax=45&chips=weekend");
  await expect(page.getByTestId("empty-state")).toBeVisible();
  await expect(page.getByTestId("empty-state").getByRole("button").first()).toBeVisible();
});

test("demo data is visibly badged", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-testid=result-list] [data-testid=demo-badge]").first()).toBeVisible();
});
