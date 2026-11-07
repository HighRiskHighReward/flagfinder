import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const csp = [
  "default-src 'self'",
  // Map SDKs are loaded only when configured. 'unsafe-inline' is limited to the theme bootstrap script.
  "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://cdn.apple-mapkit.com" + (isProd ? "" : " 'unsafe-eval'"),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.apple-mapkit.com https://*.apple.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://maps.googleapis.com https://*.apple-mapkit.com https://*.apple.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const config: NextConfig = {
  transpilePackages: ["@ff/core", "@ff/db", "@ff/config", "@ff/providers"],
  serverExternalPackages: ["pg", "pg-boss"],
  poweredByHeader: false,
  typedRoutes: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    }];
  },
};
export default config;
