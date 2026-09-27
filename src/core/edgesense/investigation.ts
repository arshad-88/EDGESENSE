/**
 * EdgeSense — anomaly investigation & explainability engine.
 * (see module docstring above)
 */
import { FEATURE_LABELS } from "./features";
import { formatDeviation } from "./rng";
import {
  type AnomalyResult,
  type EvidenceItem,
  type FeatureName,
  type FeatureVector,
  type FusionResult,
  type InvestigationResult,
  type Spectrum,
} from "./types";

/** A feature counts as evidence when |deviation| exceeds this. */
const DEVIATION_EVIDENCE_THRESHOLD = 0.18;
/** Evidence becomes "sustained" after this many consecutive anomalous windows. */
const SUSTAINED_WINDOWS = 3;

interface InvestigateInput {
  vibrationFeatures: FeatureVector;
  acousticFeatures: FeatureVector;
  vibrationAnomaly: AnomalyResult;
  acousticAnomaly: AnomalyResult;
  fusion: FusionResult;
  vibrationBaseline: Record<FeatureName, { mean: number; std: number }>;
  acousticBaseline: Record<FeatureName, { mean: number; std: number }>;
  vibrationSpectrum: Spectrum;
  acousticSpectrum: Spectrum;
  vibrationStreak: number;
  acousticStreak: number;
}

function buildEvidence(
  features: FeatureVector,
  anomaly: AnomalyResult,
  baseline: Record<FeatureName, { mean: number; std: number }>,
  spectrum: Spectrum,
  role: "primary" | "supporting",
): EvidenceItem[] {
  const items: EvidenceItem[] = [];

  const all: Array<{ feature: FeatureName; value: number; baseline: number }> =
    (Object.keys(features.values) as FeatureName[]).map((k) => ({
      feature: k,
      value: features.values[k],
      baseline: baseline[k].mean,
    }));

  for (const e of all) {
    const deviation =
      Math.abs(e.baseline) > 1e-9 ? (e.value - e.baseline) / e.baseline : 0;
    if (Math.abs(deviation) >= DEVIATION_EVIDENCE_THRESHOLD) {
      items.push({
        sensor: features.sensor,
        feature: e.feature,
        label: FEATURE_LABELS[e.feature],
        deltaLabel: formatDeviation(deviation),
        deviation,
        value: e.value,
        baseline: e.baseline,
        role,
      });
    }
  }

  // Frequency-shift evidence: dominant frequency moved materially.
  const baseDominant = baseline.dominantFreq.mean;
  const domDelta =
    Math.abs(baseDominant) > 1e-9
      ? (features.values.dominantFreq - baseDominant) / baseDominant
      : 0;
  if (
    Math.abs(domDelta) >= 0.12 &&
    !items.some((i) => i.feature === "dominantFreq")
  ) {
    items.push({
      sensor: features.sensor,
      feature: "dominantFreq",
      label: "Frequency shift",
      deltaLabel: `${Math.round(baseDominant)} → ${Math.round(features.values.dominantFreq)} Hz`,
      deviation: domDelta,
      value: features.values.dominantFreq,
      baseline: baseDominant,
      role,
    });
  }

  // Sort strongest deviation first.
  items.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
  return items;
}

function headlineFor(fusion: FusionResult): string {
  switch (fusion.decision) {
    case "corroborated-anomaly":
      return "CORROBORATED ANOMALY";
    case "suspicious-vibration":
      return "SENSOR DISAGREEMENT — VIBRATION";
    case "suspicious-acoustic":
      return "SENSOR DISAGREEMENT — ACOUSTIC";
    default:
      return "HEALTHY";
  }
}

export function investigate(input: InvestigateInput): InvestigationResult {
  const {
    fusion,
    vibrationAnomaly,
    acousticAnomaly,
    vibrationStreak,
    acousticStreak,
  } = input;

  const isAnomalousFrame =
    fusion.decision === "corroborated-anomaly" ||
    fusion.decision === "suspicious-vibration" ||
    fusion.decision === "suspicious-acoustic";

  const vibEvidence = buildEvidence(
    input.vibrationFeatures,
    vibrationAnomaly,
    input.vibrationBaseline,
    input.vibrationSpectrum,
    "primary",
  );
  const acEvidence = buildEvidence(
    input.acousticFeatures,
    acousticAnomaly,
    input.acousticBaseline,
    input.acousticSpectrum,
    "supporting",
  );

  // Only the sensors that actually flagged contribute evidence.
  const primaryEvidence: EvidenceItem[] = [];
  const supportingEvidence: EvidenceItem[] = [];
  if (vibrationAnomaly.isAnomaly) primaryEvidence.push(...vibEvidence);
  if (acousticAnomaly.isAnomaly) {
    if (vibrationAnomaly.isAnomaly) supportingEvidence.push(...acEvidence);
    else primaryEvidence.push(...acEvidence);
  }

  const flaggedCount = (vibrationAnomaly.isAnomaly ? 1 : 0) + (acousticAnomaly.isAnomaly ? 1 : 0);
  const sensorAgreementText = `${flaggedCount} / 2 sensors flag deviation${
    flaggedCount === 2 ? " — corroborated" : flaggedCount === 1 ? " — disagreement" : ""
  }`;

  const sustainedSeconds = Math.max(vibrationStreak, acousticStreak);
  const sustained =
    sustainedSeconds >= SUSTAINED_WINDOWS
      ? `Sustained for ${sustainedSeconds}s (≥${SUSTAINED_WINDOWS} consecutive windows).`
      : sustainedSeconds > 0
        ? `Isolated event (${sustainedSeconds} consecutive window${sustainedSeconds === 1 ? "" : "s"} so far).`
        : "No sustained deviation.";

  const qualityNotes: string[] = [];
  if (vibrationAnomaly.quality.score < 0.8) {
    qualityNotes.push(`Vibration quality ${Math.round(vibrationAnomaly.quality.score * 100)}% (${vibrationAnomaly.quality.note}).`);
  }
  if (acousticAnomaly.quality.score < 0.8) {
    qualityNotes.push(`Acoustic quality ${Math.round(acousticAnomaly.quality.score * 100)}% (${acousticAnomaly.quality.note}).`);
  }

  const headline = headlineFor(fusion);
  const narrative =
    fusion.decision === "healthy"
      ? `All features within learned normal behaviour. ${sensorAgreementText}. ${sustained}`
      : `Abnormal machine behaviour detected. ${primaryEvidence
          .slice(0, 3)
          .map((e) => `${e.label} ${e.deltaLabel}`)
          .join(", ")}${
          supportingEvidence.length > 0
            ? `; acoustic corroborates (${supportingEvidence
                .slice(0, 2)
                .map((e) => `${e.label} ${e.deltaLabel}`)
                .join(", ")})`
            : ""
        }. ${sensorAgreementText}. ${sustained}`;

  return {
    timestamp: fusion.timestamp,
    decision: fusion.state,
    headline,
    narrative,
    primaryEvidence,
    supportingEvidence,
    sensorAgreement: sensorAgreementText,
    sustainedSeconds,
    qualityNotes,
    caveat:
      "Detects deviation from learned normal behaviour. Exact fault classification is future work requiring labelled fault data.",
  };
}
