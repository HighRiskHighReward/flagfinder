import type { Metadata } from "next";
import { SubmitForm } from "@/components/submit-form";

export const metadata: Metadata = { title: "Submit an event" };

export default function SubmitPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-3xl font-bold">Submit an event</h1>
      <p className="mt-2 text-muted">Share a link to a public event page or upload a flyer. A moderator reviews every submission before it appears. We never guess details we can&apos;t read.</p>
      <SubmitForm />
      <p className="mt-6 text-sm text-muted">Organizers: want your listings kept current automatically? <a href="/organizers">Claim your organization</a>.</p>
    </div>
  );
}
