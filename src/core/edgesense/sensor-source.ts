/**
 * EdgeSense — sensor input abstraction.
 *
 * The pipeline consumes `SensorWindow` objects from a `SensorSource` and never
 * knows whether samples came from the synthetic simulator, a CSV file, or a
 * real ESP32-S3 over the network. Hardware integration is future-ready: the
 * interface is final, only the transport is missing.
 *
 *   ADXL345 ──┐
 *             ├── ESP32-S3 ── Wi-Fi ── EdgeSense backend ── pipeline
 *   INMP441 ──┘
 */
import type { SensorWindow } from "./types";
import { SyntheticSensorSource } from "./simulator";
import type { SimulatorConfig } from "./types";

/** A source of windowed sensor data. */
export interface SensorSource {
  readonly kind: "synthetic" | "csv" | "esp32";
  /** Human label shown in the dashboard ("SIMULATED DATA" vs "LIVE SENSOR DATA"). */
  readonly dataLabel: string;
  /** Pull the next pair of windows (one per modality). */
  readWindow(): { vibration: SensorWindow; acoustic: SensorWindow };
  /** Optional per-source controls (simulator config). */
  setConfig?(config: Partial<SimulatorConfig>): void;
  getConfig?(): SimulatorConfig;
}

/** Adapter exposing the synthetic motor simulator as a SensorSource. */
export class SyntheticSourceAdapter implements SensorSource {
  readonly kind = "synthetic" as const;
  readonly dataLabel = "SIMULATED DATA";
  private sim: SyntheticSensorSource;

  constructor(seed = 42, config?: SimulatorConfig) {
    this.sim = new SyntheticSensorSource(seed, config);
  }

  readWindow() {
    return this.sim.readWindow();
  }

  setConfig(config: Partial<SimulatorConfig>) {
    this.sim.setConfig(config);
  }

  getConfig(): SimulatorConfig {
    return this.sim.getConfig();
  }

  get elapsedSeconds(): number {
    return this.sim.t;
  }
}

/**
 * CSV SensorSource — replays windowed sensor data from a JSON/CSV export.
 *
 * Accepts records of the shape:
 *   { timestamp, vx: number[], vy: number[], vz: number[], acoustic: number[] }
 * or a pre-chunked array of SensorWindow pairs.
 */
export class CSVSensorSource implements SensorSource {
  readonly kind = "csv" as const;
  readonly dataLabel = "REPLAYED CSV DATA";
  private windows: Array<{
    vibration: SensorWindow;
    acoustic: SensorWindow;
  }>;
  private cursor = 0;

  constructor(windows: Array<{ vibration: SensorWindow; acoustic: SensorWindow }>) {
    this.windows = windows;
  }

  readWindow() {
    if (this.windows.length === 0) {
      throw new Error("CSVSensorSource: no windows loaded");
    }
    const w = this.windows[this.cursor % this.windows.length];
    this.cursor++;
    return w;
  }
}

/**
 * ESP32SensorSource — FUTURE HARDWARE INTEGRATION (stub).
 *
 * Expected transport: the ESP32-S3 samples the ADXL345 (I²C) and INMP441 (I²S),
 * batches 1-second windows and POSTs them to the EdgeSense ingestion endpoint
 * (or streams them over WebSocket). The pipeline below is unchanged when this
 * source becomes real.
 *
 * NOT YET IMPLEMENTED — this stub exists so the architecture is visible and
 * so downstream code can already be written against it. It never fakes data.
 */
export class ESP32SensorSource implements SensorSource {
  readonly kind = "esp32" as const;
  readonly dataLabel = "LIVE SENSOR DATA (not connected)";
  private buffer: Array<{ vibration: SensorWindow; acoustic: SensorWindow }> = [];

  /** Called by the future ingestion endpoint when the ESP32 posts a window. */
  ingest(pair: { vibration: SensorWindow; acoustic: SensorWindow }): void {
    this.buffer.push(pair);
    if (this.buffer.length > 64) this.buffer.shift();
  }

  readWindow() {
    const next = this.buffer.shift();
    if (!next) {
      throw new Error(
        "ESP32SensorSource: no hardware data buffered. Hardware integration is future work.",
      );
    }
    return next;
  }
}
