import Link from "next/link";
import { brand } from "@ff/config/brand";
import { ThemeToggle } from "./theme-toggle";
import { AccountLink } from "./account-link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4">
        <Link href="/" className="tap flex items-center gap-2 font-bold tracking-tight text-fg no-underline" aria-label={`${brand.name} home`}>
          <svg aria-hidden="true" width="26" height="26" viewBox="0 0 26 26"><rect width="26" height="26" rx="7" fill="var(--c-primary)" /><path d="M8 19V7h9l-2 3 2 3H10" fill="none" stroke="var(--c-accent)" strokeWidth="2.4" strokeLinejoin="round" /></svg>
          <span className="text-lg">{brand.name}</span>
        </Link>
        <nav aria-label="Primary" className="ml-auto flex items-center gap-1 text-sm">
          <Link className="tap hidden items-center rounded-md px-3 text-fg no-underline hover:bg-surface sm:flex" href="/calendar">Calendar</Link>
          <Link className="tap hidden items-center rounded-md px-3 text-fg no-underline hover:bg-surface sm:flex" href="/submit">Submit an event</Link>
          <Link className="tap hidden items-center rounded-md px-3 text-fg no-underline hover:bg-surface md:flex" href="/coverage">Coverage</Link>
          <AccountLink />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
