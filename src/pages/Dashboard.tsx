import { useMemo } from "react";
import { TriangleAlert, LogOut, Waves, Loader2 } from "lucide-react";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useMachine } from "@/hooks/use-machine";
import { MachineCenter } from "@/components/edgesense/MachineCenter";
import { BehaviourMap } from "@/components/edgesense/BehaviourMap";
import { FingerprintRadar } from "@/components/edgesense/FingerprintRadar";
import { AnomalySignature } from "@/components/edgesense/AnomalySignature";
import { InvestigationFlow } from "@/components/edgesense/InvestigationFlow";
import { TelemetryPanel } from "@/components/edgesense/TelemetryPanel";
import { WhatIfConsole } from "@/components/edgesense/WhatIfConsole";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const {
    machine,
    machineRef,
    startupStep,
    audioAvailable,
    snapshot,
    startMotor,
    stopMotor,
    setBehaviour,
    applySimOverride,
    resetSimOverride,
    simConfig,
    baselineReady,
    retrain,
  } = useMachine();

  const latest = snapshot?.latest ?? null;
  const running = machine.power === "ON" || machine.power === "STARTING";

  // Baselines per cell key for the heatmap tooltips.
  const baselinesByKey = useMemo(() => {
    const out: Record<string, number> = {};
    for (const b of snapshot?.fingerprint.vibration ?? []) out[`ADXL345:${b.feature}`] = b.baseline;
    for (const b of snapshot?.fingerprint.acoustic ?? []) out[`INMP441:${b.feature}`] = b.baseline;
    return out;
  }, [snapshot]);

  const valuesByKey = useMemo(() => {
    const byTs = new Map<number, Record<string, number>>();
    for (const f of snapshot?.frames ?? []) {
      const row: Record<string, number> = {};
      for (const [feat, v] of Object.entries(f.vibration.features.values)) {
        row[`ADXL345:${feat}`] = v;
      }
      for (const [feat, v] of Object.entries(f.acoustic.features.values)) {
        row[`INMP441:${feat}`] = v;
      }
      byTs.set(f.timestamp, row);
    }
    return (snapshot?.heatmap ?? []).map((r) => byTs.get(r.timestamp) ?? {});
  }, [snapshot]);

  if (!baselineReady) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Learning what normal looks like — training the isolation forest…
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-14">
      {/* ============ TOP BAR ============ */}
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded bg-primary/15 text-primary">
              <Waves className="size-4" />
            </div>
            <div className="leading-tight">
              <p className="text-[13px] font-bold tracking-[0.22em]">EDGESENSE</p>
              <p className="text-[10px] text-muted-foreground">Industrial Machine Intelligence</p>
            </div>
          </div>
          <Badge variant="outline" className="px-1.5 py-0 text-[9px] tracking-widest text-primary">
            ● SIMULATION MODE
          </Badge>
          <Badge variant="outline" className="px-1.5 py-0 text-[9px] tracking-widest text-muted-foreground">
            SYNTHETIC SENSOR STREAM
          </Badge>
          <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                className={`size-1.5 rounded-full ${running ? "animate-pulse bg-status-healthy" : "bg-muted-foreground"}`}
              />
              {running ? "acquisition active" : "acquisition inactive"}
            </span>
            <button
              className="underline-offset-2 hover:text-foreground hover:underline"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
            >
              <LogOut className="inline size-3" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] space-y-5 px-5 pt-4">
        {/* ============ HERO: 3D machine + control + live metrics ============ */}
        <MachineCenter
          machine={machine}
          machineRef={machineRef}
          startupStep={startupStep}
          audioAvailable={audioAvailable}
          onStart={startMotor}
          onStop={stopMotor}
          onBehaviour={setBehaviour}
        />

        {/* ============ TELEMETRY: waveforms + FFT (live only) ============ */}
        <section className="rounded-lg border border-border/60 bg-card/50 p-4">
          {running && latest ? (
            <TelemetryPanel frame={latest} />
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No signal — start the motor to begin acquisition.
            </p>
          )}
        </section>

        {/* ============ INTELLIGENCE: cloud + fingerprint ============ */}
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-card/50 p-4">
            <BehaviourMap
              baseline={snapshot?.cloud.baseline ?? []}
              live={snapshot?.cloud.live ?? []}
              trajectory={snapshot?.cloud.trajectory ?? []}
              currentIsAnomaly={
                latest
                  ? latest.fusion.decision === "corroborated-anomaly"
                  : machine.fusedAnomalyScore > 0.7
              }
              sensor="ADXL345"
              onSensorChange={() => {}}
            />
          </div>
          <div className="rounded-lg border border-border/60 bg-card/50 p-4">
            <FingerprintRadar
              vibration={snapshot?.fingerprint.vibration ?? []}
              acoustic={snapshot?.fingerprint.acoustic ?? []}
            />
          </div>
        </section>

        {/* ============ ANOMALY SIGNATURE (heatmap, full width) ============ */}
        <section className="rounded-lg border border-border/60 bg-card/50 p-4">
          <AnomalySignature
            rows={snapshot?.heatmap ?? []}
            valuesByKey={valuesByKey}
            baselinesByKey={baselinesByKey}
          />
        </section>

        {/* ============ INVESTIGATION ============ */}
        <section className="rounded-lg border border-border/60 bg-card/50 p-4">
          {latest ? (
            <InvestigationFlow frame={latest} />
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Anomaly investigation activates once the machine is running.
            </p>
          )}
        </section>

        {/* ============ WHAT-IF SIMULATOR ============ */}
        <section className="rounded-lg border border-border/60 bg-card/50 p-4">
          <WhatIfConsole
            machine={machine}
            simConfig={simConfig}
            onApply={applySimOverride}
            onReset={resetSimOverride}
            onRetrain={retrain}
          />
        </section>
      </div>
    </main>
  );
}
