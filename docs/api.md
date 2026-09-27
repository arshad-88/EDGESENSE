# EdgeSense API

EdgeSense runs its DSP/ML pipeline in the browser and uses Convex for
persistence. The "API" is therefore the set of Convex query/mutation functions
plus the internal hook interface.

## Convex functions

### Models (`src/convex/edgesense.ts`)

| Function | Type | Purpose |
| --- | --- | --- |
| `saveModel` | mutation | Persist a trained baseline (supersedes previous). Args: `trainedAt, sampleCount, featureNames, machineMode, contamination, windowSeconds, thresholds, payload` |
| `getLatestModel` | query | Latest persisted model or `null` |
| `deleteModel` | mutation | Remove persisted models (reset baseline) |

The `payload` is the JSON-serialized `BaselineBundle` from
`serializeBaseline()` (forest trees, stats, PCA, thresholds).

### Events (`src/convex/events.ts`)

| Function | Type | Purpose |
| --- | --- | --- |
| `recordEvent` | mutation | Persist a non-healthy fused event (capped at 500 overall) |
| `getSessionEvents` | query | Recent events for a session, newest first |
| `getStats` | query | Global counts: total, corroborated, suspicious |

## Hook interface (`useEdgeSense`)

```ts
const engine = useEdgeSense();
// engine.status: loading | training | ready | running | error
// engine.snapshot: PipelineSnapshot (frames, heatmap, cloud, fingerprint)
// engine.simulatorConfig: current machine parameters
// engine.activeScenario: { id, title, stepLabel } | null
// engine.setSimulatorConfig(patch)  — What-If controls
// engine.startScenario(id) / stopScenario()
// engine.retrain()
```

The tick loop processes one window pair per second in real time (350 ms
during scenario replay) and updates `snapshot` reactively.

## Internal core API

All in `src/core/edgesense` (see `index.ts` for the full barrel):

- `SyntheticSensorSource` / `SyntheticSourceAdapter` / `CSVSensorSource` /
  `ESP32SensorSource` (stub)
- `trainBaseline(corpus)` / `serializeBaseline` / `deserializeBaseline`
- `EdgeSensePipeline.process(vib, ac)` → `PipelineFrame | null`
- `extractFeatures(window)`, `computeSpectrum`, `computeTimeFeatures`,
  `assessQuality`
- `IsolationForest.fit/rawScore/serialize/deserialize`
- `fuseResults(vib, ac)`, `investigate(input)`
- `fitPca(X)` / `projectPca(model, x)`

### Future REST/WS surface

When the ESP32 ingestion transport is added, the planned surface is a thin
HTTP/WS layer over the same core: `POST /api/ingest/windows` (device →
pipeline), `GET /api/machine/status`, `GET /api/investigation/latest`,
`WS /ws/live` (snapshot stream). The core pipeline requires no changes.
