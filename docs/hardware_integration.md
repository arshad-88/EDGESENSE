# EdgeSense — Future Hardware Integration

**Status: future-ready architecture, not yet implemented.** Everything in this
build uses the synthetic simulator, clearly labelled SIMULATED DATA in the UI.
No part of the system fabricates "real" readings.

## Target hardware

| Component | Interface | Role |
| --- | --- | --- |
| ESP32-S3 | — | Edge node: sampling, windowing, transport |
| ADXL345 | I²C (up to 3.2 kHz ODR) | 3-axis vibration, ±16 g range |
| INMP441 | I²S | 24-bit MEMS microphone, acoustic emission |

## Planned topology

```
ADXL345 ──I²C──┐
               ├── ESP32-S3 ── Wi-Fi ── EdgeSense ingestion ── pipeline
INMP441 ──I²S──┘
```

## What changes vs what doesn't

**Unchanged (the whole point):** windowing, preprocessing, feature extraction,
Isolation Forest scoring, fusion, investigation, and the entire dashboard.

**To add:**

1. **Firmware** — sample ADXL345 at 512 Hz and INMP441 at 512 Hz; buffer
   1-second windows (512 samples × 3 axes interleaved; 512 mono samples);
   JSON or binary POST per window.
2. **Ingestion endpoint** — validate against the existing `SensorWindow`
   zod schemas, stamp timestamps, feed `ESP32SensorSource.ingest()`.
3. **`ESP32SensorSource`** — the stub already exists in
   `src/core/edgesense/sensor-source.ts` with a buffer and `ingest()`.
   `readWindow()` currently throws when no hardware data is buffered —
   by design, never faking data.
4. **Retraining** — the baseline must be retrained on *real* healthy
   recordings before detection is meaningful; the Retrain flow already
   supports this.

## Data contract

Windows must match `SensorWindowSchema`:

```jsonc
{
  "sensor": "ADXL345",           // or "INMP441"
  "modality": "vibration",       // or "acoustic"
  "timestamp": 12.0,             // seconds since device boot
  "sampleRate": 512,
  "channels": ["x", "y", "z"],   // ["mono"] for acoustic
  "samples": [ /* interleaved */ ],
  "metadata": { "machineMode": "normal", "simulated": false }
}
```

## Edge/server split

ESP32-suitable work: ADC/I²S sampling, buffering, optional mean-removal and
RMS pre-screening. Keep server/browser-side: FFT features, forest scoring,
fusion, visualization. The core's module boundaries already separate these;
nothing needs to move until resource measurements say so.
