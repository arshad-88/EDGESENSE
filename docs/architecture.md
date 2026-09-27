# EdgeSense Architecture

## Layering

```
┌────────────────────────────────────────────────────────────┐
│ Dashboard (React) — Observatory UI, What-If simulator      │
├────────────────────────────────────────────────────────────┤
│ Hook layer — useEdgeSense: boot, train, tick loop, replay  │
├────────────────────────────────────────────────────────────┤
│ Pipeline — windowing → features → IF → fusion → invest.    │
├────────────────────────────────────────────────────────────┤
│ Core (framework-free TS) — dsp, features, isolation-forest,│
│ baseline, fusion, investigation, pca, rng, types           │
├────────────────────────────────────────────────────────────┤
│ Source abstraction — Synthetic | CSV | ESP32 (stub)        │
├────────────────────────────────────────────────────────────┤
│ Persistence (Convex) — models, event history               │
└────────────────────────────────────────────────────────────┘
```

### Design rules

1. **The core has zero framework or DOM dependencies.** Everything in
   `src/core/edgesense/` is plain TypeScript and could run unchanged in a
   worker, a Node ingest service, or (conceptually) on an edge device for the
   lightweight DSP portions.
2. **The pipeline is source-agnostic.** `process(vibration, acoustic)` accepts
   any `SensorWindow` pair, whatever produced them.
3. **Detection is per-sensor, fusion is separate.** Vibration and acoustic are
   never mixed before their respective Isolation Forests.
4. **Visualization is never detection.** PCA powers the behaviour cloud only;
   the Isolation Forest alone decides anomaly status.
5. **Explanations are computed, not written.** Every evidence item cites an
   actual feature value, its baseline mean, and its relative deviation.

## Key types

`SensorWindow` → `FeatureVector` (+`SensorQuality`) → `AnomalyResult` →
`FusionResult` → `InvestigationResult`. All are zod-validated schemas shared
between core, backend and UI (see `src/core/edgesense/types.ts`).

## Data flow per second (tick)

1. `SyntheticSensorSource.readWindow()` produces 512-sample window pairs.
2. `extractFeatures()` de-interleaves channels, computes time features
   (mean-removed RMS/variance/peak/kurtosis), combines channels for a
   Hann-windowed FFT (dominant frequency, spectral energy), and runs quality
   checks (saturation, flatline, clipping ratio).
3. `scoreSensor()` builds the feature vector in canonical order
   (`FEATURE_VECTOR_ORDER`), scores it with the sensor's forest, compares to
   the training threshold, and collects the top deviations as evidence.
4. `fuseResults()` applies the agreement/quality matrix.
5. `investigate()` assembles the explanation (primary/supporting evidence,
   agreement, sustained duration, caveat).
6. The pipeline updates ring buffers (frames, heatmap, cloud projections) and
   returns a `PipelineFrame`; the hook pushes a snapshot into React state and
   persists non-healthy events to Convex.

## Persistence

- `edgesenseModels` — the serialized baseline (forest trees + stats + PCA +
  thresholds) as a JSON payload; only the latest model is kept.
- `edgesenseEvents` — non-healthy fused events, capped at 500, indexed by
  session and wall-clock time.

## Edge/server split

Edge-suitable (light, deterministic): windowing, mean removal, time features,
quality checks, FFT binning. Server-side heavier ML/visualization: forest
scoring at scale, baseline training, PCA fitting, dashboard rendering. The
split is a deployment decision — the module boundaries already exist.
