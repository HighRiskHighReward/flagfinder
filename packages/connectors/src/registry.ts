import type { SourceConnector } from "./contract";
import { icalConnector } from "./connectors/ical";
import { jsonLdConnector } from "./connectors/jsonld";
import { iflagConnector } from "./connectors/iflag";

/** All connectors share one contract; DFW and international sources use the same code paths. */
export const connectors: Record<string, SourceConnector> = {
  [icalConnector.key]: icalConnector,
  [jsonLdConnector.key]: jsonLdConnector,
  [iflagConnector.key]: iflagConnector,
};

export function getConnector(key: string): SourceConnector | null { return connectors[key] ?? null; }
