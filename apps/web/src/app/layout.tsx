import type { Metadata, Viewport } from "next";
import { brand } from "@ff/config/brand";
import { themeCss } from "@/design/tokens";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${brand.name} — ${brand.shortTagline}`, template: `%s · ${brand.name}` },
  description: brand.tagline,
  metadataBase: new URL(process.env.APP_BASE_URL ?? "http://localhost:3000"),
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#FFFFFF" }, { media: "(prefers-color-scheme: dark)", color: "#090D0B" }],
};

// Runs before paint: applies persisted theme override to avoid a flash.
const themeBoot = `(function(){try{var t=localStorage.getItem('ff-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className="min-h-dvh antialiased">
        <a href="#main" className="skip-link">Skip to main content</a>
        <SiteHeader />
        <main id="main" tabIndex={-1} className="outline-none">{children}</main>
      </body>
    </html>
  );
}
