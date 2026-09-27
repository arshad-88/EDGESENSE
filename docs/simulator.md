# EdgeSense Synthetic Simulator

The simulator models a small DC motor with an ADXL345-style 3-axis
accelerometer (512 Hz) and an INMP441-style mono MEMS microphone, processed in
1-second windows (512 samples).

## Signal model

- **Vibration**: rotational fundamental at `rotationFrequencyHz` with
  2× and 3× harmonics (`harmonicStrength`), per-axis gains (x > y > z),
  additive gaussian noise floor (`noiseLevel`).
- **Acoustic**: rotation-locked tone plus harmonics scaled by
  `acousticEnergy`, broadband hiss, and mode-dependent bursts.
- Parameters are **smoothed exponentially** on change so transitions morph
  rather than step — realistic for replay and What-If use.
- All randomness flows through a seeded mulberry32 RNG; runs are
  reproducible.

## Anomaly behaviours

| Mode | Effect |
| --- | --- |
| `mechanical-imbalance` | 1× amplitude swell (x-dominant), frequency spread |
| `bearing-disturbance` | impulsive bursts at ~3.6× rotation; kurtosis/peak spike |
| `acoustic-disturbance` | broadband acoustic energy rise, vibration near-normal |
| `sensor-disagreement` | vibration-only excursion (hard swing + frequency shift) |
| `signal-degradation` | noise floor rises; quality scores drop |
| `increased-load` | amplitude + acoustic up, rotation slows |
| `recovery` | returns to baseline |

`anomalyIntensity` (0–1) scales the selected behaviour continuously.

## Scenarios

`SCENARIOS` (in `simulator.ts`) are scripted step lists, e.g. **Recovery**:
healthy 14 s → onset 8 s (intensity 0.3) → sustained 16 s (0.85) → recovery
16 s. The dashboard header can launch any scenario; the hook advances steps on
the replay clock (350 ms/window, faster than real time) and restores manual
control afterwards.

## What-If controls

Sliders map directly onto `SimulatorConfig`: vibration amplitude, rotation
frequency, acoustic energy, noise level, harmonic strength, anomaly intensity.
Changes are applied live to the source; every downstream stage (features, FFT,
forest, fusion, investigation, all visualizations) reacts on the next tick.
