import type { SourceConnector } from "./contract";
import { icalConnector } from "./connectors/ical";
import { jsonLdConnector } from "./connectors/jsonld";

/** All connectors share one contract; DFW and international sources use the same code paths. */
export const connectors: Record<string, SourceConnector> = {
  [icalConnector.key]: icalConnector,
  [jsonLdConnector.key]: jsonLdConnector,
};

export function getConnector(key: string): SourceConnector | null { return connectors[key] ?? null; }
