import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * EdgeSense model persistence.
 *
 * Trained baseline models (per-sensor Isolation Forests + baseline statistics
 * + PCA for visualization) are stored here so the learned "normal behaviour"
 * survives reloads and can be reloaded by any client.
 */

/** Store a newly trained baseline model, superseding previous ones. */
export const saveModel = mutation({
  args: {
    trainedAt: v.number(),
    sampleCount: v.number(),
    featureNames: v.array(v.string()),
    machineMode: v.string(),
    contamination: v.number(),
    windowSeconds: v.number(),
    thresholds: v.record(v.string(), v.number()),
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    // Keep only the latest model (single-machine demo semantics).
    const existing = await ctx.db.query("edgesenseModels").collect();
    for (const m of existing) {
      await ctx.db.delete(m._id);
    }
    return await ctx.db.insert("edgesenseModels", args);
  },
});

/** Latest persisted model, or null if none trained yet. */
export const getLatestModel = query({
  args: {},
  handler: async (ctx) => {
    const models = await ctx.db
      .query("edgesenseModels")
      .withIndex("by_creation_time")
      .order("desc")
      .take(1);
    return models[0] ?? null;
  },
});

/** Delete the persisted model (used by "reset baseline"). */
export const deleteModel = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("edgesenseModels").collect();
    for (const m of existing) {
      await ctx.db.delete(m._id);
    }
  },
});
