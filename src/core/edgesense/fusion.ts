/**
 * EdgeSense — multimodal sensor fusion.
 *
 * Deliberately NOT a score average. Fusion reasons over the two sensor-wise
 * anomaly results and their quality:
 *
 *   both normal                 → healthy
 *   vibration only / acoustic only → suspicious (sensor disagreement)
 *   both abnormal               → corroborated anomaly
 *   any sensor poor quality     → evidence annotated, verdict downgraded
 */
import {
  type AnomalyResult,
  type FusionDecision,
  type FusionResult,
  type FusionState,
} from "./types";

/** Below this quality score a sensor's evidence is considered unreliable. */
export const QUALITY_GATE = 0.5;

export function fuseResults(
  vibration: AnomalyResult,
  acoustic: AnomalyResult,
): FusionResult {
  const vibFlag = vibration.isAnomaly && vibration.quality.score >= QUALITY_GATE;
  const acFlag = acoustic.isAnomaly && acoustic.quality.score >= QUALITY_GATE;

  let decision: FusionDecision;
  let state: FusionState;
  let summary: string;

  if (vibFlag && acFlag) {
    decision = "corroborated-anomaly";
    state = "corroborated-anomaly";
    summary =
      "Both sensors independently indicate abnormal behaviour. Corroborated anomaly.";
  } else if (vibFlag && !acFlag) {
    decision = "suspicious-vibration";
    state = "suspicious";
    summary =
      "Vibration deviates from baseline while acoustic remains normal. Sensor disagreement — suspicious, unconfirmed.";
  } else if (!vibFlag && acFlag) {
    decision = "suspicious-acoustic";
    state = "suspicious";
    summary =
      "Acoustic deviates from baseline while vibration remains normal. Sensor disagreement — suspicious, unconfirmed.";
  } else {
    decision = "healthy";
    state = "healthy";
    summary = "Both sensors consistent with learned normal behaviour.";
  }

  // Quality annotations — a low-quality sensor can suppress or explain a flag.
  const qualityNotes: string[] = [];
  if (vibration.quality.score < QUALITY_GATE) {
    qualityNotes.push(
      `Vibration signal quality degraded (${vibration.quality.note}) — vibration evidence unreliable.`,
    );
    if (vibFlag) {
      decision = "healthy";
      state = "suspicious";
      summary =
        "Vibration flagged but its signal quality is degraded; verdict downgraded to suspicious pending better data.";
    }
  }
  if (acoustic.quality.score < QUALITY_GATE) {
    qualityNotes.push(
      `Acoustic signal quality degraded (${acoustic.quality.note}) — acoustic evidence unreliable.`,
    );
    if (acFlag) {
      decision = "healthy";
      state = "suspicious";
      summary =
        "Acoustic flagged but its signal quality is degraded; verdict downgraded to suspicious pending better data.";
    }
  }

  const agreement = (vibFlag ? 1 : 0) + (acFlag ? 1 : 0);

  return {
    timestamp: Math.max(vibration.timestamp, acoustic.timestamp),
    state,
    decision,
    vibration,
    acoustic,
    sensorAgreement: agreement,
    sensorsAgree: vibFlag === acFlag,
    qualityConsidered: qualityNotes.length > 0,
    summary,
  };
}
