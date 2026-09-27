import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, TriangleAlert, LogOut, Radio } from "lucide-react";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEdgeSense } from "@/hooks/use-edgesense";
import { MachineHero } from "@/components/edgesense/MachineHero";
import { BehaviourMap } from "@/components/edgesense/BehaviourMap";
import { FingerprintRadar } from "@/components/edgesense/FingerprintRadar";
import { AnomalySignature } from "@/components/edgesense/AnomalySignature";
import { InvestigationFlow } from "@/components/edgesense/InvestigationFlow";
import { ControlConsole } from "@/components/edgesense/ControlConsole";
import { TelemetryPanel } from "@/components/edgesense/TelemetryPanel";
import { BehaviourTransition } from "@/components/edgesense/BehaviourTransition";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Waves } from "lucide-react";

export default function Dashboard() {
  const engine = useEdgeSense();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [mapSensor, setMapSensor] = useState<"ADXL345" | "INMP441">("ADXL345");

  const snapshot = engine.snapshot;
  const latest = snapshot?.latest ?? null;

  // Baselines per cell key for the heatmap tooltips.
  const baselinesByKey = useMemo(() => {
    const out: Record<string, number> = {};
    for (const b of snapshot?.fingerprint.vibration ?? []) out[`ADXL345:${b.feature}`] = b.baseline;
    for (const b of snapshot?.fingerprint.acoustic ?? []) out[`INMP441:${b.feature}`] = b.baseline;
    return out;
  }, [snapshot]);

  // Raw values per row per cell key (merge both sensors; acoustic overwrites
  // only its own keys since feature names are namespaced by sensor).
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

  if (engine.status === "loading" || engine.status === "training") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {engine.status === "training"
            ? "Learning what normal looks like — training on healthy data…"
            : "Starting the observatory…"}
        </p>
      </main>
    );
  }

  if (engine.status === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6">
        <TriangleAlert className="size-8 text-status-anomaly" />
        <p className="text-sm text-muted-foreground">{engine.error}</p>
        <Button onClick={engine.retrain}>Retry training</Button>
      </main>
    );
  }

  const vibRms = latest?.vibration.features.values.rms ?? 0;
  const baseRms = baselinesByKey["ADXL345:rms"] ?? 1;
  const indicator = Math.max(
    latest?.vibration.anomaly.anomalyIndicator ?? 0,
    latest?.acoustic.anomaly.anomalyIndicator ?? 0,
  );

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
              <p className="text-[10px] text-muted-foreground">Machine Behaviour Intelligence Center</p>
            </div>
          </div>
          <Badge variant="outline" className="px-1.5 py-0 text-[9px] tracking-widest text-muted-foreground">
            SIMULATED DATA
          </Badge>
          <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Radio className="size-3 text-status-healthy" />
              streaming
            </span>
            <span>
              baseline{" "}
              <span className="text-foreground">
                {engine.trainedAt ? new Date(engine.trainedAt).toLocaleTimeString() : "—"}
              </span>{" "}
              · {engine.sampleCount} windows
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
        {engine.activeScenario ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded border border-chart-2/40 bg-chart-2/10 px-3 py-1.5 text-xs"
          >
            <span className="size-1.5 animate-pulse rounded-full bg-chart-2" />
            <span className="font-semibold">{engine.activeScenario.title}</span>
            <span className="text-muted-foreground">step: {engine.activeScenario.stepLabel}</span>
          </motion.div>
        ) : null}

        {/* ============ HERO: machine + status + transition ============ */}
        <section className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          <div className="rounded-lg border border-border/60 bg-card/50 p-4">
            <MachineHero
              frame={latest}
              vibrationRms={vibRms}
              baselineRms={baseRms}
              anomalyIndicator={indicator}
            />
          </div>
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border/60 bg-card/50 p-4">
              <BehaviourTransition frame={latest} />
            </div>
            <div className="min-h-0 flex-1 rounded-lg border border-border/60 bg-card/50 p-4">
              <TelemetryPanel frame={latest} />
            </div>
          </div>
        </section>

        {/* ============ INTELLIGENCE: map + fingerprint ============ */}
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-card/50 p-4">
            <BehaviourMap
              baseline={snapshot?.cloud.baseline ?? []}
              live={snapshot?.cloud.live ?? []}
              trajectory={snapshot?.cloud.trajectory ?? []}
              currentIsAnomaly={
                (mapSensor === "ADXL345" ? latest?.vibration.anomaly.isAnomaly : latest?.acoustic.anomaly.isAnomaly) ?? false
              }
              sensor={mapSensor}
              onSensorChange={setMapSensor}
            />
          </div>
          <div className="rounded-lg border border-border/60 bg-card/50 p-4">
            <FingerprintRadar
              vibration={snapshot?.fingerprint.vibration ?? []}
              acoustic={snapshot?.fingerprint.acoustic ?? []}
            />
          </div>
        </section>

        {/* ============ ANOMALY SIGNATURE (full width) ============ */}
        <section className="rounded-lg border border-border/60 bg-card/50 p-4">
          <AnomalySignature
            rows={snapshot?.heatmap ?? []}
            valuesByKey={valuesByKey}
            baselinesByKey={baselinesByKey}
          />
        </section>

        {/* ============ INVESTIGATION ============ */}
        <section className="rounded-lg border border-border/60 bg-card/50 p-4">
          <InvestigationFlow frame={latest} />
        </section>

        {/* ============ CONTROL CONSOLE ============ */}
        <section className="rounded-lg border border-border/60 bg-card/50 p-4">
          <ControlConsole
            engine={engine}
            currentDominantFreq={latest?.vibration.features.values.dominantFreq ?? 0}
            baselineDominantFreq={baselinesByKey["ADXL345:dominantFreq"] ?? 0}
          />
        </section>
      </div>
    </main>
  );
}
