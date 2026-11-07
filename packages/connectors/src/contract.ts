import type { CandidateInput } from "@ff/core";

/** Connector contract (§9.3). Every source — DFW or international — implements this; no special cases. */
export interface ConnectorContext {
  sourceId: string;
  sourceKey: string;
  config: Record<string, unknown>;
  http: PoliteHttp;
  log: (event: string, data?: Record<string, unknown>) => void;
  now: Date;
}

export interface DiscoveredRef { externalId: string | null; url: string; hint?: Record<string, unknown> }

export type FetchResult =
  | { kind: "ok"; url: string; status: number; contentType: string | null; body: string; etag: string | null; lastModified: string | null; fetchedAt: Date }
  | { kind: "not_modified"; url: string; fetchedAt: Date }
  | { kind: "missing"; url: string; status: number; fetchedAt: Date }
  | { kind: "rate_limited"; url: string; retryAfterMs: number | null; fetchedAt: Date }
  | { kind: "disallowed"; url: string; reason: string; fetchedAt: Date }
  | { kind: "error"; url: string; error: string; status?: number; fetchedAt: Date };

export interface ParsedRecord { externalId: string | null; url: string; raw: Record<string, unknown> }
export type NormalizedCandidate = CandidateInput;

export interface SourceHealth { ok: boolean; detail: string }

export interface SourceConnector {
  key: string;
  parserVersion: string;
  capabilities: { discovery: boolean; incremental: boolean; conditionalRequests: boolean };
  /** Listing-level refs to fetch. Feed-style connectors return the feed itself. */
  discover(ctx: ConnectorContext): AsyncIterable<DiscoveredRef>;
  fetch(ref: DiscoveredRef, ctx: ConnectorContext, conditional?: { etag?: string | null; lastModified?: string | null }): Promise<FetchResult>;
  /** Deterministic and versioned. Must not perform I/O. */
  parse(raw: Extract<FetchResult, { kind: "ok" }>, ctx: Pick<ConnectorContext, "config" | "now">): Promise<ParsedRecord[]>;
  normalize(parsed: ParsedRecord[], ctx: Pick<ConnectorContext, "config" | "now">): Promise<NormalizedCandidate[]>;
  health(ctx: ConnectorContext): Promise<SourceHealth>;
}

export interface PoliteHttp {
  get(url: string, opts?: { etag?: string | null; lastModified?: string | null; accept?: string[] }): Promise<FetchResult>;
}
