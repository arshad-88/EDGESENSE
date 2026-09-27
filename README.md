# EdgeSense

**A self-learning edge-assisted multimodal system for machine behaviour anomaly detection.**

EdgeSense watches a machine through vibration (ADXL345) and acoustic (INMP441)
sensors, learns what *normal* behaviour looks like from healthy data alone, and
flags deviations with explainable, feature-level evidence. It detects abnormal
behaviour — it does **not** claim to identify the exact mechanical fault.

> ⚠️ **All data in this build is simulated.** The synthetic motor simulator
> stands in for real hardware; the pipeline is hardware-ready but no real
> sensor data is used yet. See [Future hardware integration](#future-hardware-integration).

---

## What it does

1. **Learns normal behaviour.** On first run, EdgeSense trains one Isolation
   Forest per sensor on ~60 seconds of healthy simulated data. This baseline
   persists via Convex and is reused across reloads.
2. **Watches continuously.** Every second, 512-sample windows of 3-axis
   vibration and mono acoustic data flow through the pipeline.
3. **Detects deviations independently per sensor.** Vibration and acoustic
   features are scored by their own Isolation Forest — no premature merging.
4. **Fuses evidence.** Both-normal → HEALTHY. One sensor only → SENSOR
   DISAGREEMENT (suspicious). Both → CORROBORATED ANOMALY. Signal quality
   gates every verdict.
5. **Explains itself.** The investigation engine answers: what changed, which
   sensor saw it, how large is the deviation vs the learned baseline, do the
   sensors agree, and is it sustained or isolated?

## Try it

- **Open the Observatory** — the live dashboard: machine status, raw waveform
  and FFT per sensor, normal behaviour cloud, behaviour fingerprint, anomaly
  heatmap, investigation panel, and fusion status — all updating each second.
- **Replay scenarios** (header buttons): Increased Load, Mechanical Imbalance,
  Bearing Disturbance, Acoustic Disturbance, Sensor Disagreement, Signal
  Degradation, Recovery. Each drives the simulator through a scripted arc and
  the whole dashboard reacts.
- **What-If Simulator** (bottom panel): six sliders — vibration amplitude,
  rotation frequency, acoustic energy, noise, harmonic strength, anomaly
  intensity. Push the machine yourself and watch signals → features → FFT →
  Isolation Forest → fusion → explanation respond live.
- **Retrain** resets and relearns the baseline from fresh healthy data.

## Architecture

```
Machine (simulated DC motor)
  ├─ vibration: 3-axis, 512 Hz, periodic components + harmonics
  └─ acoustic:  mono, rotation-locked tone + broadband hiss
        ↓
SensorSource abstraction   ← Synthetic | CSV replay | ESP32-S3 (stub)
        ↓
1-second windowing
        ↓
Preprocessing (mean removal, quality checks: saturation/flatline/clipping)
        ↓
Feature extraction
  time:      RMS, variance, peak, kurtosis
  frequency: dominant frequency (Hann-windowed FFT), spectral energy
        ↓
Sensor-wise Isolation Forest (60 trees each, scratch TypeScript impl)
        ↓
Multimodal fusion (agreement + quality gating, never a score average)
        ↓
Investigation engine (evidence collection, deviation deltas, caveat)
        ↓
Observatory dashboard (React + Recharts + Framer Motion)
```

**Where things live**

| Path | Role |
| --- | --- |
| `src/core/edgesense/` | Framework-free DSP/ML core (windowing, features, FFT, Isolation Forest, fusion, investigation, pipeline, simulator, PCA) |
| `src/convex/` | Backend: model persistence, event history |
| `src/hooks/use-edgesense.ts` | Pipeline lifecycle from React (boot, train, tick loop, scenarios) |
| `src/components/edgesense/` | Observatory UI components |
| `src/pages/` | Landing + dashboard routes |
| `docs/` | architecture, ML pipeline, simulator, API, hardware integration |

## Technology stack

- **Core/ML** — TypeScript, from-scratch radix-2 FFT, Isolation Forest, PCA
  (visualization only), seeded RNG for reproducibility
- **Backend** — Convex (model + event persistence; the DSP/ML runs in-browser,
  edge-style, not server-side)
- **Frontend** — React 19, Vite, Tailwind v4, shadcn/ui, Recharts,
  Framer Motion, Lucide
- **Tests** — Vitest (21 tests: DSP, features, simulator, IF, baseline,
  fusion, end-to-end pipeline)

## Honest boundaries

- Detects **abnormal behaviour**, not faults. It will never say "bearing
  failed"; it says what deviated and by how much.
- The anomaly **indicator** (0–1) is a normalized dashboard display of the raw
  Isolation Forest score — it is **not a probability**.
- PCA is used only to draw the behaviour cloud; it performs no detection.
- No accuracy numbers are claimed — detection quality depends on the
  baseline corpus and contamination setting.

## Future hardware integration

The pipeline is source-agnostic. `SensorSource` has three implementations:

- `SyntheticSourceAdapter` — the current simulator (labelled SIMULATED DATA)
- `CSVSensorSource` — replays recorded window data
- `ESP32SensorSource` — **stub, future work**. Expected flow:
  `ADXL345 (I²C) + INMP441 (I²S) → ESP32-S3 → Wi-Fi → ingestion endpoint →
  same pipeline`. When real hardware arrives, only the ingestion transport is
  added — windowing, features, detection, fusion and UI are untouched. The
  stub never fabricates readings.

## Development

```bash
bun install            # deps
bun dev                # frontend dev server (managed by the platform)
bun convex dev --once  # push Convex functions / regenerate types
bunx vitest run        # tests
bun tsc -b --noEmit    # typecheck
```

See `docs/architecture.md`, `docs/ml_pipeline.md`, `docs/simulator.md`,
`docs/api.md`, and `docs/hardware_integration.md` for deeper detail.
