// DESTINATION: lib/radar/classifier.ts
// WHY: AI classification engine — uses Claude API to score and categorize opportunities

import type { RawFeedItem } from "./feed-parser";

// ── Tek4All Mission Profile (used for scoring) ────────────────

const MISSION_PROFILE = `
Organisation: Tek4All Foundation
Type: NGO / Non-profit
Location: Nigeria (headquarters), operates across West Africa and Africa
Registration: Registered NGO in Nigeria

Mission: Empowering communities through technology, digital skills training, and innovation.

Core Focus Areas:
- Digital skills and technology education for youth and underserved communities
- STEM education and coding bootcamps
- Youth development and empowerment
- Innovation hubs and tech entrepreneurship
- Capacity building for NGOs and community organisations
- Women and girls in technology
- AI literacy and responsible AI adoption

Target Beneficiaries:
- Youth (ages 15-35) in Nigeria and West Africa
- Women and girls in underserved communities
- Small NGOs seeking digital transformation
- Community-based organisations

Geographic Focus:
- Primary: Nigeria (all states, with focus on underserved areas)
- Secondary: West Africa (Ghana, Senegal, Cameroon, Sierra Leone)
- Tertiary: Sub-Saharan Africa broadly

Experience:
- 3+ years operational experience
- Track record of programme delivery in digital skills
- Partnerships with schools, government agencies, and international organisations

Budget Range: Typically applies for grants between $10,000 — $500,000
`.trim();

// ── Classification types ──────────────────────────────────────

export interface ClassifiedOpportunity {
  title: string;
  type: "grant" | "partnership" | "corporate_training" | "rfp" | "award" | "fellowship" | "other";
  funder_org: string | null;
  summary: string;
  eligibility: string | null;
  amount_min: number | null;
  amount_max: number | null;
  currency: string;
  deadline: string | null;
  region: string[];
  sector: string[];
  mission_alignment: "high" | "medium" | "low";
  qualification_status: "likely_qualify" | "partial_match" | "unlikely";
  confidence: number; // 0.0 - 1.0
  source_url: string;
  source: string;
  source_id: string;
}

// ── Classify a batch of feed items ────────────────────────────

export async function classifyBatch(
  items: RawFeedItem[],
  apiKey: string
): Promise<ClassifiedOpportunity[]> {
  if (items.length === 0) return [];

  // Process in chunks of 8 to stay within token limits
  const chunks = chunkArray(items, 8);
  const results: ClassifiedOpportunity[] = [];

  for (const chunk of chunks) {
    try {
      const classified = await classifyChunk(chunk, apiKey);
      results.push(...classified);
    } catch (error) {
      console.error("[classifier] Chunk classification failed:", error);
      // Continue with next chunk
    }
  }

  return results;
}

// ── Classify a single chunk ───────────────────────────────────

async function classifyChunk(
  items: RawFeedItem[],
  apiKey: string
): Promise<ClassifiedOpportunity[]> {
  const itemsPayload = items.map((item, i) => ({
    index: i,
    title: item.title.slice(0, 300),
    description: item.description.slice(0, 1500),
    link: item.link,
    pub_date: item.pubDate,
    source_name: item.source_name,
  }));

  const prompt = `You are an opportunity classification engine for ${MISSION_PROFILE}

Analyse each feed item below and classify it as a funding/partnership opportunity.

For EACH item, return a JSON object with these fields:
- index: (number) the item index
- is_opportunity: (boolean) true if this is a genuine funding/partnership opportunity, false if it's news/blog/irrelevant
- type: "grant" | "partnership" | "corporate_training" | "rfp" | "award" | "fellowship" | "other"
- funder_org: (string|null) the funding organisation name
- summary: (string) 1-2 sentence summary of the opportunity
- eligibility: (string|null) who can apply
- amount_min: (number|null) minimum funding amount in USD (estimate if given in another currency)
- amount_max: (number|null) maximum funding amount in USD
- currency: (string) original currency code, default "USD"
- deadline: (string|null) ISO date YYYY-MM-DD if mentioned, null if not
- region: (string[]) target geographic regions
- sector: (string[]) relevant sector tags (2-5 tags like "education", "technology", "youth", "health")
- mission_alignment: "high" | "medium" | "low" — how well this matches Tek4All's mission
- qualification_status: "likely_qualify" | "partial_match" | "unlikely" — whether Tek4All would likely qualify
- confidence: (number) 0.0-1.0 how confident you are in this classification

IMPORTANT:
- Only mark is_opportunity=true for actual calls for proposals, grant opportunities, partnership opportunities, awards, or fellowships
- News articles, blog posts, success stories, and event announcements are NOT opportunities
- Be conservative with mission_alignment — "high" means directly relevant to digital skills/youth/Africa
- If amount is not mentioned, use null for both min and max
- For deadline, only include if explicitly stated

Return ONLY a JSON array. No markdown, no explanation.

ITEMS TO CLASSIFY:
${JSON.stringify(itemsPayload, null, 2)}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || "[]";

  // Parse JSON response — strip markdown fences if present
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  let parsed: Array<{
    index: number;
    is_opportunity: boolean;
    type: string;
    funder_org: string | null;
    summary: string;
    eligibility: string | null;
    amount_min: number | null;
    amount_max: number | null;
    currency: string;
    deadline: string | null;
    region: string[];
    sector: string[];
    mission_alignment: string;
    qualification_status: string;
    confidence: number;
  }>;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("[classifier] Failed to parse JSON:", cleaned.slice(0, 500));
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  // Map back to classified opportunities
  return parsed
    .filter((r) => r.is_opportunity === true)
    .map((r) => {
      const item = items[r.index];
      if (!item) return null;

      return {
        title: item.title || r.summary?.slice(0, 100) || "Untitled",
        type: validateType(r.type),
        funder_org: r.funder_org || null,
        summary: r.summary || "",
        eligibility: r.eligibility || null,
        amount_min: r.amount_min && r.amount_min > 0 ? r.amount_min : null,
        amount_max: r.amount_max && r.amount_max > 0 ? r.amount_max : null,
        currency: r.currency || "USD",
        deadline: validateDate(r.deadline),
        region: Array.isArray(r.region) ? r.region.slice(0, 5) : [],
        sector: Array.isArray(r.sector) ? r.sector.slice(0, 5).map((s) => s.toLowerCase()) : [],
        mission_alignment: validateAlignment(r.mission_alignment),
        qualification_status: validateQualification(r.qualification_status),
        confidence: Math.min(1, Math.max(0, r.confidence || 0.5)),
        source_url: item.link,
        source: item.source_name,
        source_id: item.source_id,
      } as ClassifiedOpportunity;
    })
    .filter(Boolean) as ClassifiedOpportunity[];
}

// ── Validators ────────────────────────────────────────────────

const VALID_TYPES = ["grant", "partnership", "corporate_training", "rfp", "award", "fellowship", "other"] as const;
function validateType(t: string): typeof VALID_TYPES[number] {
  return VALID_TYPES.includes(t as typeof VALID_TYPES[number])
    ? (t as typeof VALID_TYPES[number])
    : "other";
}

function validateAlignment(a: string): "high" | "medium" | "low" {
  if (a === "high" || a === "medium" || a === "low") return a;
  return "medium";
}

function validateQualification(q: string): "likely_qualify" | "partial_match" | "unlikely" {
  if (q === "likely_qualify" || q === "partial_match" || q === "unlikely") return q;
  return "partial_match";
}

function validateDate(d: string | null): string | null {
  if (!d) return null;
  const match = /^\d{4}-\d{2}-\d{2}/.exec(d);
  return match ? match[0] : null;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}