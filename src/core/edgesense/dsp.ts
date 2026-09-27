/**
 * EdgeSense — signal processing primitives.
 *
 * DSP is intentionally dependency-free and lightweight: the eventual target is
 * edge-assisted processing on an ESP32-S3, so everything here runs on plain
 * Float64Array/number[] math with O(n log n) FFT and O(n) features.
 */

/* ------------------------------------------------------------------ */
/* FFT — iterative radix-2 Cooley–Tukey                                */
/* ------------------------------------------------------------------ */

/** In-place iterative radix-2 FFT. `re`/`im` must be power-of-two length. */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1 || (n & (n - 1)) !== 0) {
    throw new Error(`FFT length must be a power of two, got ${n}`);
  }

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  // Butterfly passes.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + half] * curRe - im[i + k + half] * curIm;
        const vIm = re[i + k + half] * curIm + im[i + k + half] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + half] = uRe - vRe;
        im[i + k + half] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

export interface SpectrumResult {
  /** Frequency bin centres in Hz (first half, one-sided spectrum). */
  frequencies: Float64Array;
  /** Magnitude of each bin, normalised by window length. */
  magnitudes: Float64Array;
  dominantFrequency: number;
  spectralEnergy: number;
}

/**
 * Compute the one-sided magnitude spectrum of a real signal.
 *
 * Applies a Hann window before the FFT to reduce spectral leakage so the
 * dominant frequency of periodic machine components is measurable.
 */
export function computeSpectrum(
  samples: readonly number[],
  sampleRate: number,
): SpectrumResult {
  const n = samples.length;
  const frequencies = new Float64Array(0);
  const magnitudes = new Float64Array(0);
  if (n < 4) {
    return {
      frequencies,
      magnitudes,
      dominantFrequency: 0,
      spectralEnergy: 0,
    };
  }

  // Trim to the largest power of two that fits.
  let size = 1;
  while (size * 2 <= n) size <<= 1;
  if (size < 4) {
    return { frequencies, magnitudes, dominantFrequency: 0, spectralEnergy: 0 };
  }

  const re = new Float64Array(size);
  const im = new Float64Array(size);
  // Hann window.
  for (let i = 0; i < size; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    re[i] = samples[i] * w;
  }

  fftInPlace(re, im);

  const half = size >> 1;
  const freqs = new Float64Array(half);
  const mags = new Float64Array(half);
  let energy = 0;
  let peakIdx = 0;
  for (let k = 0; k < half; k++) {
    freqs[k] = (k * sampleRate) / size;
    const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / half;
    mags[k] = m;
    energy += m * m;
    if (m > mags[peakIdx]) peakIdx = k;
  }

  // Skip the DC bin when picking the dominant frequency.
  if (peakIdx === 0) {
    for (let k = 1; k < half; k++) {
      if (mags[k] > mags[peakIdx] || peakIdx === 0) {
        if (mags[k] > mags[peakIdx]) peakIdx = k;
        if (peakIdx === 0) peakIdx = k;
      }
    }
    if (peakIdx === 0) peakIdx = Math.min(1, half - 1);
  }

  return {
    frequencies: freqs,
    magnitudes: mags,
    dominantFrequency: freqs[peakIdx],
    spectralEnergy: energy,
  };
}

/* ------------------------------------------------------------------ */
/* Time-domain features                                                */
/* ------------------------------------------------------------------ */

export interface TimeFeatures {
  rms: number;
  variance: number;
  peak: number;
  kurtosis: number;
}

/** Compute RMS, variance, peak and kurtosis of a zero-centred window. */
export function computeTimeFeatures(samples: readonly number[]): TimeFeatures {
  const n = samples.length;
  if (n === 0) return { rms: 0, variance: 0, peak: 0, kurtosis: 0 };

  // Mean removal (detrending) before statistics — vibration signals are AC.
  let sum = 0;
  for (const s of samples) sum += s;
  const m = sum / n;

  let m2 = 0;
  let m4 = 0;
  let peak = 0;
  for (const s of samples) {
    const d = s - m;
    m2 += d * d;
    m4 += d * d * d * d;
    const abs = Math.abs(d);
    if (abs > peak) peak = abs;
  }
  m2 /= n;
  m4 /= n;

  const variance = m2;
  const rms = Math.sqrt(m2);
  const kurtosis = m2 > 0 ? m4 / (m2 * m2) : 0;

  return { rms, variance, peak, kurtosis };
}

/* ------------------------------------------------------------------ */
/* Quality checks                                                      */
/* ------------------------------------------------------------------ */

export interface QualityCheck {
  saturated: boolean;
  flatline: boolean;
  clippedRatio: number;
  score: number;
  note: string;
}

/**
 * Assess raw-signal quality: saturation, flatline and clipping. Poor quality
 * lowers confidence and is surfaced to the fusion layer.
 */
export function assessQuality(
  samples: readonly number[],
  saturationLimit: number,
): QualityCheck {
  const n = samples.length;
  if (n === 0) {
    return {
      saturated: false,
      flatline: true,
      clippedRatio: 1,
      score: 0,
      note: "no data",
    };
  }

  let clipped = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const s of samples) {
    if (Math.abs(s) >= saturationLimit) clipped++;
    if (s < min) min = s;
    if (s > max) max = s;
  }
  const clippedRatio = clipped / n;
  const flatline = max - min < 1e-9;
  const saturated = clippedRatio > 0.05;

  let score = 1;
  const notes: string[] = [];
  if (saturated) {
    score -= Math.min(0.6, clippedRatio * 2);
    notes.push("saturation/clipping");
  }
  if (flatline) {
    score = 0;
    notes.push("flatline");
  }
  // Noise floor check: an almost-constant-but-not-flat signal is also suspect.
  const { variance } = computeTimeFeatures(samples);
  if (!flatline && variance < 1e-10) {
    score = Math.min(score, 0.3);
    notes.push("near-zero variance");
  }

  return {
    saturated,
    flatline,
    clippedRatio,
    score: Math.max(0, Math.min(1, score)),
    note: notes.length > 0 ? notes.join(", ") : "nominal",
  };
}
