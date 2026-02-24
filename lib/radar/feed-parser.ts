// DESTINATION: lib/radar/feed-parser.ts
// WHY: Parse RSS/Atom feeds from radar sources into raw opportunity items

export interface RawFeedItem {
  title: string;
  description: string;
  link: string;
  pubDate: string | null;
  source_name: string;
  source_id: string;
}

/**
 * Fetch and parse an RSS/Atom feed URL.
 * Uses simple XML string parsing to avoid external dependencies.
 */
export async function parseFeed(
  url: string,
  sourceName: string,
  sourceId: string
): Promise<RawFeedItem[]> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "MoonDesk-Radar/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`[feed-parser] HTTP ${response.status} for ${url}`);
      return [];
    }

    const xml = await response.text();

    // Detect format: Atom uses <entry>, RSS uses <item>
    const isAtom = xml.includes("<entry>");
    const items = isAtom ? parseAtom(xml) : parseRSS(xml);

    return items.slice(0, 50).map((item) => ({
      ...item,
      source_name: sourceName,
      source_id: sourceId,
    }));
  } catch (error) {
    console.error(`[feed-parser] Error fetching ${url}:`, error);
    return [];
  }
}

// ── RSS 2.0 parser ────────────────────────────────────────────

function parseRSS(xml: string): Omit<RawFeedItem, "source_name" | "source_id">[] {
  const items: Omit<RawFeedItem, "source_name" | "source_id">[] = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    items.push({
      title: extractTag(block, "title"),
      description: stripHtml(extractTag(block, "description") || extractTag(block, "content:encoded")),
      link: extractTag(block, "link") || extractGuid(block),
      pubDate: extractTag(block, "pubDate") || extractTag(block, "dc:date"),
    });
  }

  return items;
}

// ── Atom parser ───────────────────────────────────────────────

function parseAtom(xml: string): Omit<RawFeedItem, "source_name" | "source_id">[] {
  const items: Omit<RawFeedItem, "source_name" | "source_id">[] = [];
  const entryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];
    items.push({
      title: extractTag(block, "title"),
      description: stripHtml(extractTag(block, "summary") || extractTag(block, "content")),
      link: extractAtomLink(block),
      pubDate: extractTag(block, "published") || extractTag(block, "updated"),
    });
  }

  return items;
}

// ── Helpers ───────────────────────────────────────────────────

function extractTag(block: string, tag: string): string {
  // Handle CDATA: <tag><![CDATA[content]]></tag>
  const cdataRegex = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
    "i"
  );
  const cdataMatch = cdataRegex.exec(block);
  if (cdataMatch) return cdataMatch[1].trim();

  // Handle regular: <tag>content</tag>
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = regex.exec(block);
  return match ? match[1].trim() : "";
}

function extractGuid(block: string): string {
  return extractTag(block, "guid");
}

function extractAtomLink(block: string): string {
  // <link href="..." /> or <link rel="alternate" href="..." />
  const linkRegex = /<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i;
  const match = linkRegex.exec(block);
  return match ? match[1] : "";
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000); // Cap description length
}