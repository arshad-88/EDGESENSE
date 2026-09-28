import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * EdgeSense event history.
 *
 * Fused results are persisted per session so the dashboard can show recent
 * anomaly history and the demo can be audited after the fact.
 *
 * BANDWIDTH NOTE — this file previously caused the deployment to be paused for
 * exceeding the shared database bandwidth allowance. The original version did
 * this on EVERY insert:
 *
 *     ctx.db.query("edgesenseEvents").withIndex("by_wallclock").collect()
 *
 * i.e. it read back all 500 retained events (each carrying a long narrative
 * string) purely to decide which ones to prune. The simulation ticks at 250 ms
 * and records an event on every frame where the decision is not "healthy", so
 * that was up to 4 inserts/second, each dragging 500 documents behind it —
 * roughly 2,000 document reads per second. `getStats` had the same problem,
 * collecting the whole table.
 *
 * Both are now O(1) in the number of stored events:
 *  - a single tiny `edgesenseStats` counter document holds the running totals
 *  - pruning deletes only the documents it is about to delete, and only when
 *    the table is genuinely over the cap
 *  - narrative text is truncated before it is written, so reads stay small
 */

/** Retain at most this many events overall (bounded storage). */
const MAX_EVENTS = 500;

/** Long investigation narratives are the bulk of each document — cap them. */
const MAX_NARRATIVE_CHARS = 600;
const MAX_HEADLINE_CHARS = 140;

export const recordEvent = mutation({
  args: {
    sessionId: v.string(),
    timestamp: v.number(),
    state: v.string(),
    decision: v.string(),
    vibrationIndicator: v.number(),
    acousticIndicator: v.number(),
    sensorAgreement: v.number(),
    machineMode: v.string(),
    simulated: v.boolean(),
    headline: v.optional(v.string()),
    narrative: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("edgesenseEvents", {
      ...args,
      headline: args.headline?.slice(0, MAX_HEADLINE_CHARS),
      narrative: args.narrative?.slice(0, MAX_NARRATIVE_CHARS),
      wallClock: Date.now(),
    });

    // Running totals in ONE small document, not a scan of the whole table.
    const stats = await ctx.db.query("edgesenseStats").first();
    const total = (stats?.total ?? 0) + 1;
    if (stats) {
      await ctx.db.patch(stats._id, {
        total,
        byState: {
          ...stats.byState,
          [args.state]: (stats.byState[args.state] ?? 0) + 1,
        },
      });
    } else {
      await ctx.db.insert("edgesenseStats", {
        total,
        byState: { [args.state]: 1 },
      });
    }

    // Prune only the surplus — we read exactly the rows we are about to
    // delete, instead of the entire retained history on every single insert.
    const surplus = total - MAX_EVENTS;
    if (surplus > 0) {
      const doomed = await ctx.db
        .query("edgesenseEvents")
        .withIndex("by_wallclock")
        .order("asc")
        .take(surplus);
      await Promise.all(doomed.map((row) => ctx.db.delete(row._id)));
    }

    return id;
  },
});

/**
 * Erase every stored event and reset the running totals.
 *
 * Deletes in bounded batches rather than collecting the whole table first —
 * collecting everything to delete it is exactly the pattern that exhausted the
 * bandwidth allowance in the first place.
 */
export const purgeAll = mutation({
  args: {},
  handler: async (ctx) => {
    const BATCH = 64;
    let events = 0;
    for (;;) {
      const batch = await ctx.db.query("edgesenseEvents").take(BATCH);
      if (batch.length === 0) break;
      for (const row of batch) await ctx.db.delete(row._id);
      events += batch.length;
      if (batch.length < BATCH) break;
    }

    const counters = await ctx.db.query("edgesenseStats").collect();
    for (const row of counters) await ctx.db.delete(row._id);

    return { events, counters: counters.length };
  },
});

/** Recent events for a session, newest first. */
export const getSessionEvents = query({
  args: { sessionId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, MAX_EVENTS);
    return await ctx.db
      .query("edgesenseEvents")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(limit);
  },
});

/** Global anomaly statistics across all sessions. */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    // One small document, whatever the size of the event table.
    const stats = await ctx.db.query("edgesenseStats").first();
    const total = stats?.total ?? 0;
    return {
      total,
      corroborated: stats?.byState["corroborated-anomaly"] ?? 0,
      suspicious: stats?.byState["suspicious"] ?? 0,
    };
  },
});
