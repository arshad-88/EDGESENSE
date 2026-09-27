import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // add other tables here

    // Trained EdgeSense baseline models (one Isolation Forest per sensor).
    edgesenseModels: defineTable({
      trainedAt: v.number(),
      sampleCount: v.number(),
      featureNames: v.array(v.string()),
      machineMode: v.string(),
      contamination: v.number(),
      windowSeconds: v.number(),
      thresholds: v.record(v.string(), v.number()),
      // Opaque serialized forest payload produced by the core serializer.
      payload: v.string(),
    }),

    // Persisted fused anomaly events for history / audit.
    edgesenseEvents: defineTable({
      sessionId: v.string(),
      timestamp: v.number(), // pipeline time (seconds since session start)
      wallClock: v.number(), // Date.now() when recorded
      state: v.string(),
      decision: v.string(),
      vibrationIndicator: v.number(),
      acousticIndicator: v.number(),
      sensorAgreement: v.number(),
      machineMode: v.string(),
      simulated: v.boolean(),
      headline: v.optional(v.string()),
      narrative: v.optional(v.string()),
    })
      .index("by_session", ["sessionId", "timestamp"])
      .index("by_wallclock", ["wallClock"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
