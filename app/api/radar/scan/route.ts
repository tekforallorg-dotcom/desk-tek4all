// DESTINATION: app/api/radar/scan/route.ts
// WHY: Opportunity Radar scan engine — cron + manual trigger

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseFeed } from "@/lib/radar/feed-parser";
import { classifyBatch } from "@/lib/radar/classifier";
import type { ClassifiedOpportunity } from "@/lib/radar/classifier";

// Use service role for server-side operations (bypasses RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── POST handler (manual trigger) ─────────────────────────────

export async function POST(request: Request) {
  try {
    // Verify auth — check for valid session or cron secret
    const authHeader = request.headers.get("authorization");
    const cronSecret = request.headers.get("x-cron-secret");
    const isCron = cronSecret === process.env.CRON_SECRET;

    if (!isCron) {
      // Validate user session for manual triggers
      const token = authHeader?.replace("Bearer ", "");
      if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { createClient: createAuthClient } = await import("@supabase/supabase-js");
      const authSupabase = createAuthClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: { user }, error: authError } = await authSupabase.auth.getUser(token);
      if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Check user is admin/super_admin or radar admin
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

      if (!isAdmin) {
        const { data: radarMember } = await supabase
          .from("radar_group_members")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .single();

        if (!radarMember) {
          return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
        }
      }
    }

    const result = await runScan();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[radar/scan] Error:", error);
    return NextResponse.json(
      { error: "Scan failed", details: String(error) },
      { status: 500 }
    );
  }
}

// ── GET handler (Vercel cron) ─────────────────────────────────

export async function GET(request: Request) {
  // Verify cron secret for scheduled runs
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runScan();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[radar/scan] Cron error:", error);
    return NextResponse.json(
      { error: "Scan failed", details: String(error) },
      { status: 500 }
    );
  }
}

// ── Main scan logic ───────────────────────────────────────────

async function runScan() {
  const startTime = Date.now();
  const log: string[] = [];

  log.push(`[scan] Started at ${new Date().toISOString()}`);

  // 1. Fetch active sources
  const { data: sources, error: srcError } = await supabase
    .from("radar_sources")
    .select("*")
    .eq("is_active", true);

  if (srcError || !sources?.length) {
    log.push("[scan] No active sources found");
    return { success: true, log, stats: { sources: 0, fetched: 0, new: 0, classified: 0 } };
  }

  log.push(`[scan] Found ${sources.length} active source(s)`);

  // 2. Fetch and parse all feeds
  const allItems = [];

  for (const source of sources) {
    if (!source.url) {
      log.push(`[scan] Skipping "${source.name}" — no URL`);
      continue;
    }

    log.push(`[scan] Fetching "${source.name}" (${source.url})`);
    const items = await parseFeed(source.url, source.name, source.id);
    log.push(`[scan]   → ${items.length} items parsed`);
    allItems.push(...items);

    // Update source last_fetched_at
    await supabase
      .from("radar_sources")
      .update({ last_fetched_at: new Date().toISOString(), error_count: 0, last_error: null })
      .eq("id", source.id);
  }

  if (allItems.length === 0) {
    log.push("[scan] No items found across all sources");
    return {
      success: true,
      log,
      stats: { sources: sources.length, fetched: 0, new: 0, classified: 0 },
    };
  }

  log.push(`[scan] Total raw items: ${allItems.length}`);

  // 3. Deduplicate against existing opportunities
  const { data: existing } = await supabase
    .from("opportunities")
    .select("title, source_url");

  const existingTitles = new Set((existing || []).map((e) => e.title?.toLowerCase().trim()));
  const existingUrls = new Set((existing || []).map((e) => e.source_url).filter(Boolean));

  const newItems = allItems.filter((item) => {
    const titleNorm = item.title?.toLowerCase().trim();
    if (!titleNorm) return false;
    if (existingTitles.has(titleNorm)) return false;
    if (item.link && existingUrls.has(item.link)) return false;
    return true;
  });

  log.push(`[scan] After dedup: ${newItems.length} new items (${allItems.length - newItems.length} duplicates skipped)`);

  if (newItems.length === 0) {
    return {
      success: true,
      log,
      stats: {
        sources: sources.length,
        fetched: allItems.length,
        new: 0,
        classified: 0,
        duration_ms: Date.now() - startTime,
      },
    };
  }

  // 4. Classify via Claude API
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    log.push("[scan] ERROR: ANTHROPIC_API_KEY not set — skipping classification");
    return {
      success: false,
      error: "ANTHROPIC_API_KEY not configured",
      log,
      stats: { sources: sources.length, fetched: allItems.length, new: newItems.length, classified: 0 },
    };
  }

  log.push(`[scan] Classifying ${newItems.length} items via Claude API...`);
  const classified = await classifyBatch(newItems, apiKey);
  log.push(`[scan] Classification complete: ${classified.length} opportunities identified`);

  // 5. Insert classified opportunities
  let insertedCount = 0;
  const errors: string[] = [];

  for (const opp of classified) {
    const { error: insertError } = await supabase.from("opportunities").insert({
      title: opp.title,
      type: opp.type,
      stage: "new",
      source: opp.source,
      source_url: opp.source_url,
      funder_org: opp.funder_org,
      summary: opp.summary,
      eligibility: opp.eligibility,
      amount_min: opp.amount_min,
      amount_max: opp.amount_max,
      currency: opp.currency,
      deadline: opp.deadline,
      region: opp.region,
      sector: opp.sector,
      mission_alignment: opp.mission_alignment,
      qualification_status: opp.qualification_status,
      confidence: opp.confidence,
    });

    if (insertError) {
      errors.push(`Failed to insert "${opp.title}": ${insertError.message}`);
      log.push(`[scan] ERROR inserting "${opp.title}": ${insertError.message}`);
    } else {
      insertedCount++;
    }
  }

  const duration = Date.now() - startTime;
  log.push(`[scan] Complete in ${duration}ms — ${insertedCount} opportunities added`);

  if (errors.length > 0) {
    log.push(`[scan] ${errors.length} insert error(s)`);
  }

  return {
    success: true,
    log,
    stats: {
      sources: sources.length,
      fetched: allItems.length,
      new: newItems.length,
      classified: classified.length,
      inserted: insertedCount,
      errors: errors.length,
      duration_ms: duration,
    },
  };
}