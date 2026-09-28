/**
 * MachineCenter — the page hero. Large interactive 3D motor plus the
 * START/STOP control, behaviour selector, startup sequence readout and the
 * key live metrics. Everything derives from the single central machine state.
 */
import { useRef, useState } from "react";
import { Play, Square, Radio, VolumeX, Maximize2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BEHAVIOUR_LABELS,
  STARTUP_STEPS,
  type Behaviour,
  type MachineState,
} from "@/core/edgesense";
import { MachineScene, SENSOR_INFO, type SensorInfo } from "@/three/MachineScene";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const BEHAVIOURS: Behaviour[] = ["NORMAL", "HEAVY_LOAD", "ANOMALY"];

function statusTone(s: MachineState): { text: string; dot: string; label: string } {
  if (s.power === "OFF") return { text: "text-muted-foreground", dot: "bg-muted-foreground", label: "STANDBY" };
  if (s.machineStatus === "ANOMALY DETECTED")
    return { text: "text-status-anomaly", dot: "bg-status-anomaly", label: "ANOMALY DETECTED" };
  if (s.machineStatus === "LOAD INCREASED")
    return { text: "text-status-suspicious", dot: "bg-status-suspicious", label: "LOAD INCREASED" };
  if (s.machineStatus === "STARTING")
    return { text: "text-primary", dot: "bg-primary animate-pulse", label: "STARTING" };
  return { text: "text-status-healthy", dot: "bg-status-healthy", label: "RUNNING" };
}

function Readout({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn("font-mono text-sm font-semibold tabular-nums", tone)}>
        {value}
        {unit ? <span className="ml-0.5 text-[10px] text-muted-foreground">{unit}</span> : null}
      </p>
    </div>
  );
}

interface Props {
  machine: MachineState;
  machineRef: React.RefObject<MachineState>;
  startupStep: string | null;
  audioAvailable: boolean;
  onStart: () => void;
  onStop: () => void;
  onBehaviour: (b: Behaviour) => void;
}

export function MachineCenter({
  machine,
  machineRef,
  startupStep,
  audioAvailable,
  onStart,
  onStop,
  onBehaviour,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState<SensorInfo["id"] | null>(null);
  const toggleFullscreen = () => {
    const el = viewportRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      void document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };
  const tone = statusTone(machine);
  const running = machine.power === "ON" || machine.power === "STARTING";
  const powerLabel =
    machine.power === "STARTING"
      ? (startupStep ?? "STARTING")
      : machine.power === "STOPPING"
        ? "DECELERATING"
        : machine.power === "OFF"
          ? "Waiting for machine operation..."
          : `MACHINE RUNNING · ${BEHAVIOUR_LABELS[machine.behaviour]}`;

  return (
    <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
      {/* ---------------- 3D viewport ---------------- */}
      <div
        ref={viewportRef}
        className="relative overflow-hidden rounded-lg border border-border/60 bg-[radial-gradient(ellipse_at_50%_115%,rgba(56,189,248,0.10),transparent_55%),radial-gradient(ellipse_at_85%_0%,rgba(251,146,60,0.06),transparent_50%)] bg-card"
      >
        <div className="absolute inset-0 bg-grid opacity-30" />

        {/* ---- HUD instrumentation over the viewport ---- */}
        <div className="hud-sweep pointer-events-none absolute inset-0 overflow-hidden" />
        <div className="hud-scanlines pointer-events-none absolute inset-0 opacity-60" />
        <div className="pointer-events-none absolute inset-0">
          <span className="corner corner-tl" />
          <span className="corner corner-tr" />
          <span className="corner corner-bl" />
          <span className="corner corner-br" />
        </div>
        {/* Reticle ticks on the horizontal centre line. */}
        <div className="pointer-events-none absolute left-0 top-1/2 flex -translate-y-1/2 flex-col gap-1.5 pl-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block h-px bg-primary/25"
              style={{ width: i === 1 ? 14 : 8 }}
            />
          ))}
        </div>
        <div className="pointer-events-none absolute right-0 top-1/2 flex -translate-y-1/2 flex-col items-end gap-1.5 pr-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block h-px bg-primary/25"
              style={{ width: i === 1 ? 14 : 8 }}
            />
          ))}
        </div>
        <MachineScene
          stateRef={machineRef}
          className={isFullscreen ? "h-screen w-screen" : "relative h-[460px] w-full xl:h-[540px]"}
          fullscreen={isFullscreen}
          onSelectSensor={setSelectedSensor}
          selectedSensor={selectedSensor}
        />

        {/* sensor info panel (after clicking a sensor) */}
        {selectedSensor ? (
          <div
            className="absolute left-4 top-16 max-w-[260px] rounded-md border bg-background/90 p-3 backdrop-blur"
            style={{ borderColor: `${SENSOR_INFO[selectedSensor].accent}55` }}
          >
            <p
              className="text-xs font-bold tracking-widest"
              style={{ color: SENSOR_INFO[selectedSensor].accent }}
            >
              {SENSOR_INFO[selectedSensor].name}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold text-foreground">
              {SENSOR_INFO[selectedSensor].duty}
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              {SENSOR_INFO[selectedSensor].measures}
            </p>
            <button
              onClick={() => setSelectedSensor(null)}
              className="mt-1.5 text-[9px] tracking-widest text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              CLOSE
            </button>
          </div>
        ) : null}

        {/* overlays */}
        <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2">
          <Badge variant="outline" className="w-fit border-primary/40 bg-background/70 px-2 py-0.5 text-[9px] tracking-[0.2em] text-primary backdrop-blur">
            ● SIMULATION MODE
          </Badge>
          <Badge variant="outline" className="w-fit border-border/60 bg-background/70 px-2 py-0.5 text-[9px] tracking-[0.15em] text-muted-foreground backdrop-blur">
            SYNTHETIC SENSOR STREAM
          </Badge>
          {!audioAvailable ? (
            <Badge variant="outline" className="w-fit border-border/60 bg-background/70 px-2 py-0.5 text-[9px] text-muted-foreground backdrop-blur">
              <VolumeX className="mr-1 inline size-2.5" /> AUDIO UNAVAILABLE
            </Badge>
          ) : null}
        </div>

        {/* fullscreen toggle (YouTube-style icon button) */}
        <button
          onClick={toggleFullscreen}
          aria-label="Toggle fullscreen"
          title="Fullscreen"
          className="absolute right-4 bottom-4 flex size-9 items-center justify-center rounded-md border border-border/60 bg-background/70 text-muted-foreground backdrop-blur transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          <Maximize2 className="size-4" />
        </button>

        {/* legend: sensor positions */}
        <div className="pointer-events-none absolute bottom-4 left-4 flex gap-4 text-[9px] tracking-widest">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8]" />
            ADXL345 · VIBRATION
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-orange-400 shadow-[0_0_6px_#fb923c]" />
            INMP441 · ACOUSTIC
          </span>
        </div>

        {/* status overlay */}
        <div className="pointer-events-none absolute right-4 top-4 text-right">
          <p className={cn("flex items-center justify-end gap-1.5 text-[11px] font-bold tracking-widest", tone.text)}>
            <span className={cn("size-1.5 rounded-full", tone.dot)} />
            {tone.label}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            {machine.rpm > 0 ? `${machine.rpm.toFixed(0)} RPM` : "0 RPM"}
          </p>
        </div>

        {isFullscreen ? (
          <div className="pointer-events-none absolute inset-x-0 top-4 text-center">
            <p className="text-[11px] font-bold tracking-[0.3em] text-foreground/80">
              EDGESENSE · INDUSTRIAL MACHINE INTELLIGENCE
            </p>
          </div>
        ) : null}

        <AnimatePresence>
          {machine.power === "STARTING" ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-x-0 bottom-16 flex justify-center"
            >
              <div className="rounded-md border border-primary/40 bg-background/85 px-4 py-2 text-center backdrop-blur">
                <p className="font-mono text-[11px] font-bold tracking-widest text-primary">
                  {startupStep}
                </p>
                <div className="mt-1.5 flex gap-1">
                  {STARTUP_STEPS.map((s, i) => (
                    <span
                      key={s}
                      className={cn(
                        "h-0.5 w-6 rounded",
                        STARTUP_STEPS.indexOf((startupStep ?? "") as (typeof STARTUP_STEPS)[number]) >= i ? "bg-primary" : "bg-border",
                      )}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* ---------------- control column ---------------- */}
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border/60 bg-card/50 p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {powerLabel}
          </p>
          <button
            onClick={machine.power === "OFF" ? onStart : onStop}
            className={cn(
              "mt-3 flex w-full items-center justify-center gap-2.5 rounded-md py-3.5 text-sm font-bold tracking-[0.18em] transition-all",
              machine.power === "OFF"
                ? "bg-primary text-primary-foreground shadow-[0_0_24px_rgba(56,189,248,0.25)] hover:bg-primary/90"
                : "border border-status-anomaly/50 bg-status-anomaly/10 text-status-anomaly hover:bg-status-anomaly/20",
            )}
          >
            {machine.power === "OFF" ? (
              <>
                <Play className="size-4" /> START MOTOR
              </>
            ) : (
              <>
                <Square className="size-4" /> STOP MOTOR
              </>
            )}
          </button>

          <div className="mt-4">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Machine Behaviour
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {BEHAVIOURS.map((b) => {
                const active = machine.behaviour === b;
                return (
                  <button
                    key={b}
                    onClick={() => onBehaviour(b)}
                    disabled={machine.power === "OFF"}
                    className={cn(
                      "rounded border px-2 py-2 text-[10px] font-bold tracking-wider transition-all disabled:opacity-40",
                      active && b === "ANOMALY"
                        ? "border-status-anomaly/60 bg-status-anomaly/15 text-status-anomaly"
                        : active && b === "HEAVY_LOAD"
                          ? "border-status-suspicious/60 bg-status-suspicious/15 text-status-suspicious"
                          : active
                            ? "border-status-healthy/60 bg-status-healthy/15 text-status-healthy"
                            : "border-border/70 text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                    )}
                  >
                    {BEHAVIOUR_LABELS[b]}
                  </button>
                );
              })}
            </div>
            {machine.power === "OFF" ? (
              <p className="mt-2 text-[10px] text-muted-foreground">
                Start the motor to change operating behaviour.
              </p>
            ) : null}
          </div>
        </div>

        {/* live metrics from the central state */}
        <div className="flex-1 rounded-lg border border-border/60 bg-card/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Live Sensor Values
            </p>
            {running ? (
              <span className="flex items-center gap-1 text-[9px] tracking-widest text-status-healthy">
                <Radio className="size-3 animate-pulse" /> STREAMING
              </span>
            ) : (
              <span className="text-[9px] tracking-widest text-muted-foreground">STANDBY</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Readout label="Vibration RMS" value={running ? machine.vibrationRms.toFixed(2) : "—"} unit="g" />
            <Readout label="Variance" value={running ? machine.variance.toFixed(3) : "—"} />
            <Readout label="Kurtosis" value={running ? machine.kurtosis.toFixed(2) : "—"} />
            <Readout label="Peak" value={running ? machine.peak.toFixed(2) : "—"} unit="g" />
            <Readout label="Dominant Freq" value={running ? machine.dominantFrequency.toFixed(0) : "—"} unit="Hz" />
            <Readout label="Spectral Energy" value={running ? machine.spectralEnergy.toFixed(2) : "—"} />
            <Readout label="Acoustic Level" value={running ? machine.acousticLevel.toFixed(0) : "—"} unit="dB" />
            <Readout
              label="Vibration Anomaly"
              value={running ? machine.vibrationAnomalyScore.toFixed(2) : "—"}
              tone={machine.vibrationAnomalyScore > 0.7 ? "text-status-anomaly" : undefined}
            />
            <Readout
              label="Acoustic Anomaly"
              value={running ? machine.acousticAnomalyScore.toFixed(2) : "—"}
              tone={machine.acousticAnomalyScore > 0.7 ? "text-status-anomaly" : undefined}
            />
          </div>
          <div className="mt-4 border-t border-border/60 pt-3">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Fused Anomaly Score
                </p>
                <p
                  className={cn(
                    "font-mono text-3xl font-bold tabular-nums",
                    machine.fusedAnomalyScore > 0.7
                      ? "text-status-anomaly"
                      : machine.fusedAnomalyScore > 0.28
                        ? "text-status-suspicious"
                        : "text-status-healthy",
                  )}
                >
                  {running ? machine.fusedAnomalyScore.toFixed(2) : "—"}
                </p>
                <p className="mt-0.5 text-[9px] text-muted-foreground">
                  isolation-forest indicator · not a probability
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Machine Status</p>
                <p className={cn("text-sm font-bold tracking-widest", tone.text)}>{tone.label}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
