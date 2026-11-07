/**
 * robots.txt evaluation (RFC 9309): pick the most specific matching user-agent group, then the
 * longest matching rule; Allow wins ties. Missing robots (4xx) = allowed; 5xx/unreachable = disallowed.
 */
export interface RobotsRules { groups: { agents: string[]; rules: { allow: boolean; path: string }[]; crawlDelay: number | null }[] }

export function parseRobots(txt: string): RobotsRules {
  const groups: RobotsRules["groups"] = [];
  let cur: RobotsRules["groups"][number] | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [], crawlDelay: null }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "allow" || key === "disallow") { if (val || key === "allow") cur.rules.push({ allow: key === "allow", path: val }); }
    else if (key === "crawl-delay") { const n = Number(val); if (Number.isFinite(n)) cur.crawlDelay = n; }
  }
  return { groups };
}

function matches(pattern: string, path: string): boolean {
  if (!pattern) return false;
  const re = new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
  return re.test(path);
}

export function robotsVerdict(rules: RobotsRules, userAgent: string, pathAndQuery: string): { allowed: boolean; crawlDelay: number | null } {
  const ua = userAgent.toLowerCase();
  const token = ua.split("/")[0]!;
  const specific = rules.groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  const group = specific.length ? { rules: specific.flatMap((g) => g.rules), crawlDelay: specific[0]!.crawlDelay } : rules.groups.find((g) => g.agents.includes("*"));
  if (!group) return { allowed: true, crawlDelay: null };
  let best: { allow: boolean; len: number } | null = null;
  for (const r of group.rules) {
    if (!matches(r.path, pathAndQuery)) continue;
    const len = r.path.length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
  }
  return { allowed: best ? best.allow : true, crawlDelay: group.crawlDelay };
}
