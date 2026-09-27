# EdgeSense ML Pipeline

## Baseline training (self-learning)

1. Collect `TRAINING_WINDOWS = 60` healthy window pairs from the synthetic
   source in normal mode (after a warm-up window so smoothed parameters
   settle).
2. For each sensor, extract feature vectors in canonical order:
   `rms, variance, peak, kurtosis, dominantFreq, spectralEnergy`.
3. Compute per-feature baseline statistics (mean, std) — these power the
   fingerprint bars, heatmap deviation colors, and investigation deltas.
4. Train an Isolation Forest per sensor (60 trees, subsample ≤256, seeded).
5. Derive the anomaly **threshold** per sensor as the score of the worst
   `contamination` (2%) fraction of the training corpus. Live samples scoring
   above it are more anomalous than essentially all healthy data seen.
6. Fit a 2-component PCA per sensor — **visualization only**.
7. Serialize everything to Convex; reload on boot if present.

## Inference

For each window: vector → forest → raw score
`s(x) = 2^(−E[h(x)]/c(n))` (≈0.5 typical, →1 anomalous). Anomaly status is
`rawScore > threshold`. The dashboard additionally shows a **normalized
indicator** (0–1) produced by `anomalyIndicator()` — a display transform, not
a probability.

## Fusion matrix

| Vibration | Acoustic | Verdict |
| --- | --- | --- |
| normal | normal | HEALTHY |
| anomalous | normal | SENSOR DISAGREEMENT — suspicious |
| normal | anomalous | SENSOR DISAGREEMENT — suspicious |
| anomalous | anomalous | CORROBORATED ANOMALY |

Quality gate: any flagged sensor with quality < 0.5 has its flag suppressed
and the verdict downgraded to suspicious, with an explicit quality note.

## Investigation

Evidence = features with |deviation| ≥ 18% vs baseline mean (plus an explicit
frequency-shift item when the dominant frequency moves ≥12%). The flagged
sensor's evidence is primary; the corroborating sensor's is supporting.
Sustained deviation is tracked with a per-sensor consecutive-anomaly streak.
The output always carries the caveat that exact fault classification is
future work.

## Known limitations

- The baseline is learned from *simulated* healthy data; when real hardware
  arrives, retraining on real healthy recordings is required.
- Thresholds are contamination-based quantiles, not calibrated error rates.
- Drift (gradual legitimate wear) will eventually look anomalous; a
  baseline-refresh policy is future work (the Retrain button covers this
  manually for the demo).
