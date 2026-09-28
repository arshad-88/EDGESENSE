/**
 * Adaptive edge-assisted data transmission.
 *
 * ── The problem this solves ────────────────────────────────────────────
 * The usual approach to remote machine monitoring is to stream the raw
 * waveform to a server and do the analysis there. A single 1-second window of
 * this machine is thousands of float32 samples across two modalities; shipping
 * every one of them continuously is expensive in bandwidth, power and storage,
 * and the server spends its time throwing away 99% of those samples once the
 * features have been computed.
 *
 * ── The approach ───────────────────────────────────────────────────────
 * Feature extraction happens at the edge and the raw samples never leave the
 * device. On top of that, the transmitter decides *per window* how much to put
 * on the link, using three signals:
 *
 *  1. NOVELTY — has anything actually changed since the last frame we sent?
 *     A window that is statistically identical to the previous one carries no
 *     new information, so it is dropped entirely.
 *  2. BUDGET  — a rolling link budget. When the link is close to its byte
 *     allowance the transmitter drops to summaries; when there is headroom it
 *     spends more and sends full feature vectors. The level therefore adapts
 *     to load rather than being fixed.
 *  3. ESCALATION — an anomaly is never dropped and never summarised away.
 *     The moment the fused decision leaves "healthy" the packet is promoted to
 *     full features, and to features + evidence at high confidence. Budget
 *     pressure cannot suppress the thing the system exists to report.
 *
 * This is a real policy operating on real frames, not a decorative counter:
 * `sentBytes` is measured by serialising the actual packets, and `rawBytes`
 * is measured from the actual sample counts in the frame.
 */
import type {
  FeatureName,
  FusionDecision,
  MachineMode,
  SensorId,
} from "./types";
import type { PipelineFrame } from "./pipeline";

/** How much of a window is put on the link. */
export type DetailLevel = "silent" | "summary" | "features" | "critical";

export const DETAIL_RANK: Record<DetailLevel, number> = {
  silent: 0,
  summary: 1,
  features: 2,
  critical: 3,
};

/** One packet as it would go over the link, or null when nothing is sent. */
export interface WirePacket {
  level: DetailLevel;
  timestamp: number;
  machineMode: MachineMode;
  decision: FusionDecision;
  /** Fused 0–1 indicator. */
  score: number;
  /** Sent at `summary` and above. */
  indicators?: { vibration: number; acoustic: number };
  /** Sent at `features` and above. */
  features?: {
    vibration: Record<FeatureName, number>;
    acoustic: Record<FeatureName, number>;
  };
  /** Sent at `critical` only — the explainability payload. */
  evidence?: {
    sensor: SensorId;
    feature: FeatureName;
    deviation: number;
  }[];
}

export interface LedgerEntry {
  timestamp: number;
  level: DetailLevel;
  bytes: number;
  rawBytes: number;
  novelty: number;
  load: number;
}

export interface LinkLedger {
  /** Windows offered to the transmitter. */
  windows: number;
  /** Packets actually put on the link. */
  transmitted: number;
  /** Windows dropped as redundant. */
  suppressed: number;
  /** Bytes the packet occupied (real JSON payload size). */
  sentBytes: number;
  /** Bytes the same window would have cost as a raw float32 stream. */
  rawBytes: number;
  /** Current adaptive detail level. */
  level: DetailLevel;
  /** Link utilisation 0–1 over the rolling window. */
  load: number;
  /** Most recent windows, newest last. */
  history: LedgerEntry[];
}

export interface TransmitterConfig {
  /** Rolling link allowance, bytes per second. */
  budgetBytesPerSecond: number;
  /** Length of the rolling budget window, seconds. */
  windowSeconds: number;
  /** Mean relative feature change below which a window counts as redundant. */
  noveltyEpsilon: number;
  /** Fuse score at or above which packets carry evidence. */
  criticalScore: number;
  /** Ledger entries retained for the UI. */
  historyLimit: number;
}

export const DEFAULT_TRANSMITTER_CONFIG: TransmitterConfig = {
  budgetBytesPerSecond: 700,
  windowSeconds: 5,
  noveltyEpsilon: 0.015,
  criticalScore: 0.7,
  historyLimit: 90,
};

const RAW_BYTES_PER_SAMPLE = 4; // float32
const FEATURE_KEYS: FeatureName[] = [
  "rms",
  "variance",
  "peak",
  "kurtosis",
  "dominantFreq",
  "spectralEnergy",
];

/** Mean relative change across both feature vectors, in [0, 1]. */
function noveltyAgainst(
  current: PipelineFrame,
  previous: PipelineFrame | null,
): number {
  if (!previous) return 1; // first window is always new
  let total = 0;
  let n = 0;
  for (const key of FEATURE_KEYS) {
    for (const side of ["vibration", "acoustic"] as const) {
      const a = current[side].features.values[key] ?? 0;
      const b = previous[side].features.values[key] ?? 0;
      const denom = Math.abs(a) + Math.abs(b) + 1e-6;
      total += Math.abs(a - b) / denom;
      n++;
    }
  }
  return n === 0 ? 0 : Math.min(1, total / n);
}

/** Top deviating features across both sensors, strongest first. */
function topEvidence(frame: PipelineFrame, limit = 3) {
  const out: { sensor: SensorId; feature: FeatureName; deviation: number }[] = [];
  for (const [sensor, result] of [
    ["ADXL345", frame.vibration.anomaly],
    ["INMP441", frame.acoustic.anomaly],
  ] as const) {
    for (const e of result.evidence) {
      if (typeof e.deviation === "number" && Number.isFinite(e.deviation)) {
        out.push({ sensor, feature: e.name, deviation: e.deviation });
      }
    }
  }
  return out.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation)).slice(0, limit);
}

export class EdgeTransmitter {
  private cfg: TransmitterConfig;
  private lastSent: PipelineFrame | null = null;
  private history: LedgerEntry[] = [];
  /** (timestamp, bytes) pairs inside the rolling budget window. */
  private sentInWindow: { t: number; bytes: number }[] = [];
  private totals = {
    windows: 0,
    transmitted: 0,
    suppressed: 0,
    sentBytes: 0,
    rawBytes: 0,
  };
  private level: DetailLevel = "summary";

  constructor(cfg: Partial<TransmitterConfig> = {}) {
    this.cfg = { ...DEFAULT_TRANSMITTER_CONFIG, ...cfg };
  }

  reset(): void {
    this.lastSent = null;
    this.history = [];
    this.sentInWindow = [];
    this.totals = { windows: 0, transmitted: 0, suppressed: 0, sentBytes: 0, rawBytes: 0 };
    this.level = "summary";
  }

  /** Current link utilisation, 0–1. */
  private utilisation(t: number): number {
    const cutoff = t - this.cfg.windowSeconds;
    this.sentInWindow = this.sentInWindow.filter((s) => s.t > cutoff);
    const used = this.sentInWindow.reduce((a, s) => a + s.bytes, 0);
    const allowance = this.cfg.budgetBytesPerSecond * this.cfg.windowSeconds;
    return allowance > 0 ? Math.min(1, used / allowance) : 0;
  }

  /** Decide the detail level for one window. */
  private chooseLevel(frame: PipelineFrame, novelty: number, load: number): DetailLevel {
    const decision = frame.fusion.decision;
    const score = frame.fusion.state === "healthy" ? 0 : Math.max(
      frame.vibration.anomaly.anomalyIndicator,
      frame.acoustic.anomaly.anomalyIndicator,
    );

    // 1. Escalation — an anomaly is never dropped or summarised away.
    if (decision !== "healthy") {
      return score >= this.cfg.criticalScore ? "critical" : "features";
    }

    // 2. Novelty gate — nothing new since the last frame we sent.
    if (novelty < this.cfg.noveltyEpsilon) return "silent";

    // 3. Adaptive budget — spend more when there is headroom, less when not.
    if (load > 0.8) return "summary";
    if (load < 0.3) return "features";
    return "summary";
  }

  /** Build the packet for a window, or null when it is dropped. */
  step(frame: PipelineFrame): { packet: WirePacket | null; ledger: LinkLedger } {
    const t = frame.timestamp;
    const novelty = noveltyAgainst(frame, this.lastSent);
    const load = this.utilisation(t);
    const level = this.chooseLevel(frame, novelty, load);

    const rawBytes =
      (frame.vibration.samples.length + frame.acoustic.samples.length) *
      RAW_BYTES_PER_SAMPLE;

    this.totals.windows++;
    this.totals.rawBytes += rawBytes;

    let packet: WirePacket | null = null;

    if (level !== "silent") {
      packet = {
        level,
        timestamp: t,
        machineMode: frame.machineMode,
        decision: frame.fusion.decision,
        score: Math.max(
          frame.vibration.anomaly.anomalyIndicator,
          frame.acoustic.anomaly.anomalyIndicator,
        ),
        indicators: {
          vibration: frame.vibration.anomaly.anomalyIndicator,
          acoustic: frame.acoustic.anomaly.anomalyIndicator,
        },
      };

      if (DETAIL_RANK[level] >= DETAIL_RANK.features) {
        const pick = (side: "vibration" | "acoustic") => {
          const out = {} as Record<FeatureName, number>;
          for (const k of FEATURE_KEYS) out[k] = frame[side].features.values[k] ?? 0;
          return out;
        };
        packet.features = {
          vibration: pick("vibration"),
          acoustic: pick("acoustic"),
        };
      }

      if (level === "critical") {
        packet.evidence = topEvidence(frame);
      }
    }

    // Real payload size — no made-up constants.
    const bytes = packet ? JSON.stringify(packet).length : 0;

    if (packet) {
      this.lastSent = frame;
      this.totals.transmitted++;
      this.totals.sentBytes += bytes;
      this.sentInWindow.push({ t, bytes });
    } else {
      this.totals.suppressed++;
    }

    this.level = level;
    this.history.push({ timestamp: t, level, bytes, rawBytes, novelty, load });
    if (this.history.length > this.cfg.historyLimit) this.history.shift();

    return { packet, ledger: this.snapshot() };
  }

  snapshot(): LinkLedger {
    return {
      ...this.totals,
      level: this.level,
      load: this.utilisation(this.lastSent?.timestamp ?? 0),
      history: [...this.history],
    };
  }
}
