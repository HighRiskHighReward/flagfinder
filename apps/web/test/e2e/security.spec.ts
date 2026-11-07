import { expect, test } from "@playwright/test";
import { ADMIN_ACTIONS } from "../../src/lib/admin-actions";

const ORIGIN = { origin: "http://localhost:3000" };

test.describe("authorization: admin routes are server-authorized", () => {
  test("anonymous: 401 on every admin action and the admin page", async ({ request }) => {
    for (const a of ADMIN_ACTIONS) {
      const r = await request.post(`/api/admin/${a}`, { data: {}, headers: ORIGIN });
      expect(r.status(), a).toBe(401);
    }
    expect((await request.get("/admin")).status()).toBe(401);
  });

  test("signed-in non-admin: 403 on every admin action and the admin page", async ({ request }) => {
    const email = `user${Date.now()}${Math.floor(Math.random() * 1e6)}@example.test`;
    const s = await request.post("/api/auth/sign-up/email", { data: { email, password: "correct-horse-battery", name: "Test Parent" }, headers: ORIGIN });
    expect(s.ok()).toBe(true);
    for (const a of ADMIN_ACTIONS) {
      const r = await request.post(`/api/admin/${a}`, { data: { eventId: "00000000-0000-0000-0000-000000000000" }, headers: ORIGIN });
      expect(r.status(), a).toBe(403);
    }
    const page = await request.get("/admin");
    expect(page.status()).toBe(403);
    expect(await page.text()).not.toContain("Source registry");
  });
});

test("public forms reject cross-origin posts", async ({ request }) => {
  const r = await request.post("/api/corrections", { data: { eventId: "00000000-0000-0000-0000-000000000000", field: "x", message: "hello there world" }, headers: { origin: "https://evil.example" } });
  expect(r.status()).toBe(403);
});

test("submissions reject non-http URLs and malicious upload types", async ({ request }) => {
  const r1 = await request.post("/api/submissions", { headers: ORIGIN, multipart: { url: "javascript:alert(1)", noChildData: "on" } });
  expect(r1.status()).toBe(400);
  const r2 = await request.post("/api/submissions", { headers: ORIGIN, multipart: { noChildData: "on", flyer: { name: "flyer.png", mimeType: "image/png", buffer: Buffer.from("<svg onload=alert(1)></svg>") } } });
  expect(r2.status()).toBe(400);
  expect((await r2.json()).error).toMatch(/unsupported file type/);
});
