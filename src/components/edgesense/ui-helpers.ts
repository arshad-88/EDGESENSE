/** Shared formatting + status-color helpers for the Observatory UI. */

export type StatusLevel = "healthy" | "suspicious" | "anomaly";

export function statusForDecision(
  decision: string,
): StatusLevel {
  if (decision === "corroborated-anomaly") return "anomaly";
  if (decision.startsWith("suspicious")) return "suspicious";
  return "healthy";
}

export const STATUS_LABEL: Record<StatusLevel, string> = {
  healthy: "HEALTHY",
  suspicious: "SUSPICIOUS",
  anomaly: "ANOMALY",
};

export const STATUS_TEXT_CLASS: Record<StatusLevel, string> = {
  healthy: "text-status-healthy",
  suspicious: "text-status-suspicious",
  anomaly: "text-status-anomaly",
};

export const STATUS_BG_CLASS: Record<StatusLevel, string> = {
  healthy: "bg-status-healthy",
  suspicious: "bg-status-suspicious",
  anomaly: "bg-status-anomaly",
};

/** Fixed-width number formatting for readouts. */
export function fmt(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

/** Compact formatting for large/small magnitudes. */
export function fmtCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  if (abs >= 1) return value.toFixed(2);
  if (abs === 0) return "0";
  return value.toFixed(3);
}

/** Pipeline seconds (since session start) as a wall-clock-ish stamp. */
export function fmtTimestamp(seconds: number): string {
  const d = new Date();
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const t = new Date(base.getTime() + seconds * 1000);
  return t.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export const MODE_LABELS: Record<string, string> = {
  normal: "Normal operation",
  "increased-load": "Increased load",
  "mechanical-imbalance": "Mechanical imbalance",
  "bearing-disturbance": "Bearing disturbance",
  "acoustic-disturbance": "Acoustic disturbance",
  "sensor-disagreement": "Sensor disagreement",
  "signal-degradation": "Signal degradation",
  recovery: "Recovery",
};
