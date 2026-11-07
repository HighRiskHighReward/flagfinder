import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/account", "/planner", "/compare", "/calendar"] }], sitemap: `${base}/sitemap.xml` };
}
