# EdgeSense — Full Build Report

A complete record of what was implemented in this project, from an empty
template to the finished system — what exists, where it lives, why decisions
were made, and what remains open.

---

## 1. Starting point

The environment was a **Freebuff Web template**: React 19 + Vite + TypeScript
(strict), Convex backend + auth, Tailwind v4, shadcn/ui, Recharts, Framer
Motion, Lucide, Vitest (added later). No Python runtime is available in this
hosted browser environment, so the original prompt's Python/FastAPI/scikit-learn
stack was **adapted honestly**: the entire DSP + ML pipeline was written from
scratch in TypeScript, and Convex replaced FastAPI for persistence. Every
architectural boundary from the brief was preserved.

**Nothing was carried over from any previous proof-of-concept** — the prompt
explicitly discarded it, and all core modules were written fresh.

---

## 2. What was built, module by module

### 2.1 Core engine — `src/core/edgesense/` (framework-free TypeScript)

| File | What it does |
| --- | --- |
| `types.ts` | All domain models as zod schemas + TS types: `SensorWindow`, `FeatureVector`, `SensorQuality`, `AnomalyResult`, `FusionResult`, `InvestigationResult`, `SimulatorConfig`, `BaselineMetadata`, plus cloud/heatmap/fingerprint visualization types and canonical `FEATURE_VECTOR_ORDER` |
| `rng.ts` | Seeded mulberry32 RNG, Box–Muller gaussian, clamp/mean/stdDev, deviation formatter — reproducibility for tests, demos, replays |
| `dsp.ts` | From-scratch iterative radix-2 Cooley–Tukey FFT (in-place, bit-reversal), Hann-windowed one-sided spectrum (`computeSpectrum` → frequencies, magnitudes, dominant frequency, spectral energy), time features (mean-removed RMS, variance, peak, kurtosis), quality checks (saturation, flatline, clipping ratio, near-zero variance) |
| `features.ts` | Feature extraction: de-interleaves channels, per-channel time features averaged, magnitude-preserving channel mix for FFT; emits typed `FeatureVector` with per-feature units/labels and sensor quality |
| `simulator.ts` | Realistic synthetic DC motor: rotation fundamental + 2×/3× harmonics, per-axis gains, rotation-locked acoustic tone + broadband hiss, exponential parameter smoothing so changes morph (not step); 8 anomaly modes; 8 replay scenarios; 512 Hz, 512-sample (1 s) windows |
| `sensor-source.ts` | `SensorSource` interface + `SyntheticSourceAdapter`, `CSVSensorSource`, `ESP32SensorSource` **stub** (buffer + `ingest()`, throws rather than faking data) — hardware-ready abstraction, downstream pipeline is source-agnostic |
| `isolation-forest.ts` | Isolation Forest from scratch: trees with random feature/threshold splits, height-capped, subsampled; path-length scoring `s(x)=2^(−E[h]/c(n))`, normalized `anomalyIndicator()` (display transform, documented as **not a probability**), full JSON serialize/deserialize round-trip |
| `baseline.ts` | Self-learning baseline: trains one forest per sensor on ≥10 healthy window pairs, per-feature mean/std stats, contamination-quantile thresholds (top 2% of training scores), per-sensor PCA fit, serialize/deserialize to a JSON payload |
| `pca.ts` | 2-component PCA via covariance power iteration + deflation — **visualization only**, never detection |
| `fusion.ts` | Agreement matrix (both-normal → healthy; one-only → suspicious/disagreement; both → corroborated anomaly) with a 0.5 quality gate that suppresses low-quality flags and annotates the verdict |
| `investigation.ts` | Evidence engine: features with ≥18% deviation vs baseline become evidence items (value, baseline, delta label); explicit frequency-shift evidence; primary vs supporting by which sensor flagged; consecutive-window streak for sustained vs isolated; honest caveat baked into every result |
| `pipeline.ts` | Orchestrator: source windows → features → per-sensor scoring → fusion → investigation; ring buffers for frames (180), heatmap rows, PCA cloud points (baseline + live); fingerprint builder; `snapshot()` for React |

### 2.2 Backend — `src/convex/`

- `schema.ts` — added `edgesenseModels` (serialized baseline, latest kept) and
  `edgesenseEvents` (fused non-healthy events, indexed by session and
  wall-clock, capped at 500).
- `edgesense.ts` — `saveModel`, `getLatestModel`, `deleteModel`.
- `events.ts` — `recordEvent`, `getSessionEvents`, `getStats`.

Deployed with `bun convex dev --once`; generated types regenerated and all
calls typecheck.

### 2.3 React integration — `src/hooks/use-edgesense.ts`

`useEdgeSense()` lifecycle:
1. Load persisted model from Convex (`getLatestModel`) → deserialize if valid.
2. Otherwise train from 60 fresh healthy windows and persist the result.
3. Tick loop: 1000 ms/window in real time, 350 ms during scenario replay;
   each tick reads window pairs, runs the pipeline, pushes a `PipelineSnapshot`
   into state, and records non-healthy events to Convex.
4. Public API: `setSimulatorConfig` (What-If, cancels replay), `startScenario`/
   `stopScenario` (scripted step advancement), `retrain`, plus status/error/
   trainedAt/sampleCount.

### 2.4 Observatory UI — `src/components/edgesense/` + `src/pages/Dashboard.tsx`

Dark "industrial AI monitoring command center" theme (custom oklch tokens,
engineering-grid backgrounds, glass panels, semantic healthy/suspicious/anomaly
colors) applied via `src/index.css`.

Components:
- **ObservatoryHeader** — brand, SIMULATED DATA badge, live status pill,
  operating mode, scenario replay buttons, retrain, live indicator.
- **MachineStatusCard / FusionStatusCard** — status word, anomaly indicator
  (labelled *not a probability*), per-sensor NORMAL/ANOMALOUS rows with
  quality %, sensor-agreement badge, final verdict + summary.
- **SensorPanel** (×2) — raw waveform and FFT spectrum side-by-side, six
  feature readouts, quality note, per-sensor indicator.
- **BehaviourCloud** — PCA scatter, learned-normal cluster vs current point,
  vibration/acoustic toggle, "behaviour deviation" callout, explicit
  "2D visualization — detection is Isolation Forest" label.
- **BehaviourFingerprint** — baseline (grey) vs current (colored) bars per
  feature per sensor, auto-highlighted deviations.
- **AnomalyHeatmap** — 40-window × 6-feature deviation grid, 5-step intensity
  scale, hover tooltip with timestamp/state/value/baseline/deviation.
- **InvestigationPanel** — headline verdict, narrative, primary/supporting
  evidence rows with baseline→value deltas, agreement badge, quality notes,
  honesty caveat.
- **WhatIfSimulator** — six live sliders (amplitude, frequency, acoustic
  energy, noise, harmonics, anomaly intensity) applying to the machine
  instantly, with reset-to-healthy.

### 2.5 Landing page — `src/pages/Landing.tsx`

Themed hero (badge, headline, pipeline strip: Sensors → Features+FFT →
Isolation Forest → Fusion → Investigation), four feature cards, honesty
blockquote ("Detects abnormal machine behaviour… exact fault classification is
future work"), CTA wired into auth → `/dashboard`.

### 2.6 Tests — `src/core/edgesense/__tests__/edgesense.test.ts`

21 Vitest tests, all passing:
- FFT recovers a pure sine's bin; spectrum finds the dominant frequency of a
  mixed signal.
- RMS/variance of a unit sine exact; impulsive signal beats sine on kurtosis.
- Simulator produces periodic (not noise-only) signals; imbalance raises
  vibration RMS >30%; acoustic disturbance raises spectral energy >50%.
- Isolation Forest: in-distribution scores normal, far outlier scores
  anomalous, serialization round-trip is bit-exact.
- Baseline: trains per-sensor forests with metadata; normal live data scores
  below threshold.
- Fusion: all four agreement combinations, plus quality-gate suppression.
- Pipeline end-to-end: null before baseline; normal data stays healthy
  (never corroborated); strong imbalance detected; investigation carries real
  evidence, correct headline, caveat, and never claims a specific fault.

### 2.7 Documentation

`README.md` (overview, try-it guide, architecture diagram, stack, honest
boundaries, hardware path, dev commands) and `docs/`: `architecture.md`,
`ml_pipeline.md`, `simulator.md`, `api.md`, `hardware_integration.md`,
`README.md` index — plus this build report.

---

## 3. Key engineering decisions

1. **TypeScript instead of Python** — environment constraint; the pipeline was
   written framework-free so the module boundaries match the original brief
   exactly and the DSP portions are edge-portable.
2. **Isolation Forest from scratch** (~300 lines) rather than pulling a JS ML
   dependency: full control over scoring, thresholds, and serialization; no
   heavy deps; provable round-trip persistence.
3. **Thresholds from training-corpus quantiles** — a live sample must score
   more anomalous than the worst 2% of healthy training data to flag.
4. **Fusion is a decision matrix, not an average** — sensor disagreement is a
   first-class outcome, which is the project's core differentiator.
5. **PCA labeled as visualization-only everywhere it appears** — the UI, docs,
   and code comments all repeat it, so no evaluator can mistake the cloud for
   the detector.
6. **Honesty enforced structurally** — the caveat string lives in the
   investigation result itself; the indicator is labelled "not a probability"
   in the UI; tests assert no fault names ever appear.
7. **Seeded RNG everywhere** — deterministic tests and reproducible replays.
8. **Quality gating in fusion** — degraded signals downgrade verdicts instead
   of producing false corroborations.

---

## 4. Verification performed

- `bun tsc -b --noEmit` — clean at the end of every milestone.
- `bun convex dev --once` — backend deployed successfully.
- `bunx vitest run` — 21/21 tests passing.
- Runtime error found and fixed: the barrel file exported the `SensorSource`
  *interface* as a value (`export { SensorSource }` crashed in the browser);
  corrected to `export type`.

---

## 5. Known limitations & future work

- **Simulated data only** — all detection quality figures would need to be
  re-measured on real hardware; none are claimed anywhere.
- **Baseline drift** — gradual legitimate wear will eventually look anomalous;
  a policy for automatic baseline refresh is future work (manual Retrain
  exists).
- **No WebSocket stream yet** — updates are driven by an in-browser tick loop;
  the planned REST/WS surface is documented in `docs/api.md`.
- **ESP32 ingestion** — interface and stub exist; firmware and the HTTP/WS
  transport remain to be built (see `docs/hardware_integration.md`).
- **No labelled-fault evaluation** — by design, the system makes no fault
  classification claims, so there is nothing to measure against until labelled
  fault data exists.
