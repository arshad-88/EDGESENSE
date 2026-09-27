import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * EdgeSense event history.
 *
 * Fused results are persisted per session so the dashboard can show recent
 * anomaly history and the demo can be audited after the fact.
 */
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
      wallClock: Date.now(),
    });

    // Retain at most 500 events overall (bounded storage).
    const all = await ctx.db
      .query("edgesenseEvents")
      .withIndex("by_wallclock")
      .order("desc")
      .collect();
    if (all.length > 500) {
      for (const old of all.slice(500)) {
        await ctx.db.delete(old._id);
      }
    }

    return id;
  },
});

/** Recent events for a session, newest first. */
export const getSessionEvents = query({
  args: { sessionId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
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
    const events = await ctx.db.query("edgesenseEvents").collect();
    const total = events.length;
    const corroborated = events.filter(
      (e) => e.state === "corroborated-anomaly",
    ).length;
    const suspicious = events.filter((e) => e.state === "suspicious").length;
    return { total, corroborated, suspicious };
  },
});
