/**
 * EdgeSense — feature extraction layer.
 *
 * Turns raw SensorWindows into typed FeatureVectors. Time-domain features are
 * computed per channel and aggregated; frequency-domain features come from the
 * FFT of the channel-combined signal.
 */
import { assessQuality, computeSpectrum, computeTimeFeatures } from "./dsp";
import type { SpectrumResult } from "./dsp";
import { clamp } from "./rng";
import {
  type FeatureName,
  type FeatureVector,
  type SensorWindow,
  FEATURE_VECTOR_ORDER,
} from "./types";

/** Units for each feature, used by the dashboard. */
export const FEATURE_UNITS: Record<FeatureName, string> = {
  rms: "g",
  variance: "g²",
  peak: "g",
  kurtosis: "–",
  dominantFreq: "Hz",
  spectralEnergy: "g²·Hz",
};

/** Human-readable labels for each feature. */
export const FEATURE_LABELS: Record<FeatureName, string> = {
  rms: "RMS",
  variance: "Variance",
  peak: "Peak",
  kurtosis: "Kurtosis",
  dominantFreq: "Dominant Freq",
  spectralEnergy: "Spectral Energy",
};

export interface ExtractionOutput {
  features: FeatureVector;
  spectrum: SpectrumResult;
  timeFeatures: { rms: number; variance: number; peak: number; kurtosis: number };
}

/**
 * Extract the full feature set for one window of one sensor.
 *
 * Vibration windows carry 3 interleaved channels (x, y, z); acoustic windows
 * carry a single mono channel. Time features are averaged across channels,
 * the spectrum is computed on the channel-combined signal.
 */
export function extractFeatures(window: SensorWindow): ExtractionOutput {
  const { samples, sampleRate, channels } = window;
  const nChannels = Math.max(1, channels.length);
  const frameLength = Math.floor(samples.length / nChannels);

  // De-interleave channels.
  const channelData: number[][] = [];
  for (let c = 0; c < nChannels; c++) {
    channelData.push(new Array<number>(frameLength));
  }
  for (let i = 0; i < frameLength; i++) {
    for (let c = 0; c < nChannels; c++) {
      channelData[c][i] = samples[i * nChannels + c] ?? 0;
    }
  }

  // Time-domain features averaged across channels.
  let rms = 0;
  let variance = 0;
  let peak = 0;
  let kurtosis = 0;
  for (const ch of channelData) {
    const tf = computeTimeFeatures(ch);
    rms += tf.rms;
    variance += tf.variance;
    peak = Math.max(peak, tf.peak);
    kurtosis += tf.kurtosis;
  }
  const k = channelData.length;
  const timeFeatures = {
    rms: rms / k,
    variance: variance / k,
    peak,
    kurtosis: kurtosis / k,
  };

  // Combine channels for spectral analysis (magnitude-preserving mix).
  const combined = new Array<number>(frameLength);
  const scale = 1 / Math.sqrt(nChannels);
  for (let i = 0; i < frameLength; i++) {
    let acc = 0;
    for (let c = 0; c < nChannels; c++) acc += channelData[c][i];
    combined[i] = acc * scale;
  }
  const spectrum = computeSpectrum(combined, sampleRate);

  const quality = assessQuality(
    samples,
    SATURATION_LIMITS[window.sensor] ?? 1.0,
  );
  const qualityWithSensor = { ...quality, sensor: window.sensor };

  const values: Record<FeatureName, number> = {
    rms: timeFeatures.rms,
    variance: timeFeatures.variance,
    peak: timeFeatures.peak,
    kurtosis: timeFeatures.kurtosis,
    dominantFreq: spectrum.dominantFrequency,
    spectralEnergy: spectrum.spectralEnergy,
  };

  const features: FeatureVector = {
    sensor: window.sensor,
    modality: window.modality,
    timestamp: window.timestamp,
    values,
    quality: qualityWithSensor,
  };

  return { features, spectrum, timeFeatures };
}

/** Saturation limits per sensor in native units. */
export const SATURATION_LIMITS: Record<string, number> = {
  ADXL345: 16, // ±16 g range
  INMP441: 1.0, // full-scale digital mic
};
