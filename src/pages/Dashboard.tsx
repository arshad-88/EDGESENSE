/**
 * Command Center — operate and observe the machine.
 *
 * One purpose: the machine itself. START/STOP, behaviour modes, the big 3D
 * stage with its floating health readout, and the headline telemetry. Signals,
 * behaviour, investigation and simulation each have their own page.
 */
import { Play, Square, Radio, Maximize2, VolumeX } from "lucide-react";
import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BEHAVIOUR_LABELS,
  STARTUP_STEPS,
  type Behaviour,
} from "@/core/edgesense";
import { MachineScene, SENSOR_INFO, type SensorInfo } from "@/three/MachineScene";
import { ObservatoryShell } from "@/components/edgesense/ObservatoryShell";
import { EdgeLinkPanel } from "@/components/edgesense/EdgeLinkPanel";
import { Panel, Tag } from "@/components/edgesense/Panel";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const BEHAVIOURS: Behaviour[] = ["NORMAL", "HEAVY_LOAD", "ANOMALY"];

function Readout({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn("tnum font-mono text-sm font-semibold", tone)}>
        {value}
        {unit ? <span className="ml-0.5 text-[10px] text-muted-foreground">{unit}</span> : null}
      </p>
    </div>
  );
}

export default function Dashboard() {
  // Local UI state lives here, OUTSIDE the shell's render prop, so hook order
  // stays stable regardless of machine state.
  const [selectedSensor, setSelectedSensor] = useState<SensorInfo["id"] | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggleFullscreen = () => {
    const el = viewportRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      void document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <ObservatoryShell>
      {(api) => {
        const { machine, machineRef, startupStep, audioAvailable, startMotor, stopMotor, setBehaviour, link } = api;
        const running = machine.power === "ON" || machine.power === "STARTING";
        const anomalous = machine.fusedAnomalyScore > 0.7;
        const healthPct = running
          ? Math.max(0, Math.min(100, Math.round((1 - machine.fusedAnomalyScore) * 100)))
          : 0;
        const tone = !running
          ? { text: "text-muted-foreground", dot: "bg-muted-foreground", label: "STANDBY" }
          : anomalous
            ? { text: "text-status-anomaly", dot: "bg-status-anomaly", label: "ANOMALY DETECTED" }
            : machine.fusedAnomalyScore > 0.28
              ? { text: "text-status-suspicious", dot: "bg-status-suspicious", label: "LOAD INCREASED" }
              : { text: "text-status-healthy", dot: "bg-status-healthy", label: "RUNNING" };

        return (
          <>
            {/* ============ 3D STAGE ============ */}
            <div
              ref={viewportRef}
              className="relative min-h-[380px] overflow-hidden rounded-xl border border-border/60 bg-card bg-[radial-gradient(ellipse_at_50%_118%,rgba(56,189,248,0.13),transparent_58%),radial-gradient(ellipse_at_88%_-5%,rgba(251,146,60,0.08),transparent_52%)] lg:min-h-[520px]"
            >
              <div className="absolute inset-0 bg-grid opacity-30" />
              <div className="hud-sweep pointer-events-none absolute inset-0 overflow-hidden" />
              <div className="hud-scanlines pointer-events-none absolute inset-0 opacity-60" />
              <div className="pointer-events-none absolute inset-0">
                <span className="corner corner-tl" />
                <span className="corner corner-tr" />
                <span className="corner corner-bl" />
                <span className="corner corner-br" />
              </div>

              <MachineScene
                stateRef={machineRef}
                className={isFullscreen ? "h-screen w-screen" : "relative h-[460px] w-full xl:h-[540px]"}
                fullscreen={isFullscreen}
                onSelectSensor={setSelectedSensor}
                selectedSensor={selectedSensor}
              />

              {selectedSensor ? (
                <div
                  className="absolute left-4 top-16 max-w-[260px] rounded-md border bg-background/90 p-3 backdrop-blur"
                  style={{ borderColor: `${SENSOR_INFO[selectedSensor].accent}55` }}
                >
                  <p className="text-xs font-bold tracking-widest" style={{ color: SENSOR_INFO[selectedSensor].accent }}>
                    {SENSOR_INFO[selectedSensor].name}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold">{SENSOR_INFO[selectedSensor].duty}</p>
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

              <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2">
                <Badge variant="outline" className="w-fit border-primary/40 bg-background/70 px-2 py-0.5 text-[9px] tracking-[0.2em] text-primary backdrop-blur">
                  ● SIMULATION MODE
                </Badge>
                {!audioAvailable ? (
                  <Badge variant="outline" className="w-fit border-border/60 bg-background/70 px-2 py-0.5 text-[9px] text-muted-foreground backdrop-blur">
                    <VolumeX className="mr-1 inline size-2.5" /> AUDIO UNAVAILABLE
                  </Badge>
                ) : null}
              </div>

              <button
                onClick={toggleFullscreen}
                aria-label="Toggle fullscreen"
                className="absolute bottom-4 right-4 flex size-9 items-center justify-center rounded-md border border-border/60 bg-background/70 text-muted-foreground backdrop-blur transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                <Maximize2 className="size-4" />
              </button>

              {/* LEVEL 1 readout */}
              <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 sm:left-6">
                <p className="label-tech">MACHINE HEALTH</p>
                <p className={cn("tnum mt-1 text-4xl font-bold leading-none sm:text-5xl", tone.text)}>
                  {healthPct}
                  <span className="align-top text-2xl sm:text-3xl">%</span>
                </p>
                <p className={cn("mt-2 flex items-center gap-1.5 text-[11px] font-bold tracking-[0.2em]", tone.text)}>
                  <span className={cn("size-1.5 rounded-full", tone.dot)} />
                  {tone.label}
                </p>
                <p className="tnum mt-3 text-[11px] text-muted-foreground">
                  {machine.rpm > 0 ? machine.rpm.toFixed(0) : "0"} RPM
                </p>
                <div className="mt-3 h-0.5 w-24 overflow-hidden rounded-full bg-border/60">
                  <div className={cn("h-full transition-[width] duration-500 ease-out", tone.dot)} style={{ width: `${healthPct}%` }} />
                </div>
              </div>

              <AnimatePresence>
                {machine.power === "STARTING" ? (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-x-0 bottom-16 flex justify-center"
                  >
                    <div className="rounded-md border border-primary/40 bg-background/85 px-4 py-2 text-center backdrop-blur">
                      <p className="font-mono text-[11px] font-bold tracking-widest text-primary">{startupStep}</p>
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

            {/* ============ CONTROL DECK ============ */}
            <div className="grid gap-5 lg:grid-cols-[minmax(280px,360px)_1fr]">
              <Panel index="01" title="Machine control" hint="power + operating behaviour">
                <button
                  onClick={machine.power === "OFF" ? startMotor : stopMotor}
                  className={cn(
                    "flex w-full items-center justify-center gap-2.5 rounded-md py-3.5 text-sm font-bold tracking-[0.18em] transition-all",
                    machine.power === "OFF"
                      ? "bg-primary text-primary-foreground shadow-[0_0_24px_rgba(56,189,248,0.25)] hover:bg-primary/90"
                      : "border border-status-anomaly/50 bg-status-anomaly/10 text-status-anomaly hover:bg-status-anomaly/20",
                  )}
                >
                  {machine.power === "OFF" ? (<><Play className="size-4" /> START MOTOR</>) : (<><Square className="size-4" /> STOP MOTOR</>)}
                </button>
                <div className="mt-4 grid grid-cols-3 gap-1.5">
                  {BEHAVIOURS.map((b) => {
                    const active = machine.behaviour === b;
                    return (
                      <button
                        key={b}
                        onClick={() => setBehaviour(b)}
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
                  <p className="mt-3 text-[10px] text-muted-foreground">Start the motor to change operating behaviour.</p>
                ) : null}
              </Panel>

              <Panel
                index="02"
                title="Live telemetry"
                hint="derived from the central machine state"
                actions={<Tag tone={running ? "healthy" : "muted"}>{running ? "STREAMING" : "STANDBY"}</Tag>}
              >
                {running ? (
                  <>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
                      <Readout label="RPM" value={machine.rpm.toFixed(0)} />
                      <Readout label="Vibration RMS" value={machine.vibrationRms.toFixed(2)} unit="g" />
                      <Readout label="Dominant Freq" value={machine.dominantFrequency.toFixed(0)} unit="Hz" />
                      <Readout label="Acoustic Level" value={machine.acousticLevel.toFixed(0)} unit="dB" />
                      <Readout
                        label="Anomaly Score"
                        value={machine.fusedAnomalyScore.toFixed(2)}
                        tone={anomalous ? "text-status-anomaly" : machine.fusedAnomalyScore > 0.28 ? "text-status-suspicious" : "text-status-healthy"}
                      />
                    </div>
                    <p className="mt-4 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Radio className="size-3 animate-pulse text-status-healthy" />
                      Full signal detail lives in SIGNALS · behaviour envelope in BEHAVIOUR
                    </p>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <Radio className="size-5 text-muted-foreground/60" />
                    <p className="text-xs text-muted-foreground">No signal — start the machine to begin acquisition.</p>
                  </div>
                )}
              </Panel>
            </div>

            {/* ============ EDGE LINK ============ */}
            <EdgeLinkPanel link={link} />
          </>
        );
      }}
    </ObservatoryShell>
  );
}
