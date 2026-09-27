import { useMemo } from "react";
import { motion } from "framer-motion";
import { Loader2, TriangleAlert } from "lucide-react";
import { useEdgeSense } from "@/hooks/use-edgesense";
import { ObservatoryHeader } from "@/components/edgesense/ObservatoryHeader";
import { SensorPanel } from "@/components/edgesense/SensorPanel";
import { MachineStatusCard, FusionStatusCard } from "@/components/edgesense/StatusCards";
import { BehaviourCloud } from "@/components/edgesense/BehaviourCloud";
import { BehaviourFingerprint } from "@/components/edgesense/Fingerprint";
import { AnomalyHeatmap } from "@/components/edgesense/AnomalyHeatmap";
import { InvestigationPanel } from "@/components/edgesense/InvestigationPanel";
import { WhatIfSimulator } from "@/components/edgesense/WhatIfSimulator";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router";

const stagger = {
  hidden: { opacity: 0, y: 8 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.3, ease: "easeOut" as const },
  }),
};

export default function Dashboard() {
  const engine = useEdgeSense();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const snapshot = engine.snapshot;

  // Baseline means for the heatmap tooltips (from metadata stats via latest
  // investigation evidence is not enough — use fingerprint baselines).
  const baselines = useMemo(() => {
    const out: Record<string, number> = {};
    for (const b of snapshot?.fingerprint.vibration ?? []) {
      out[b.feature] = b.baseline;
    }
    return out;
  }, [snapshot]);

  // Raw per-row feature values for heatmap tooltips.
  const valuesByRow = useMemo(() => {
    const vib = new Map<number, Record<string, number>>();
    for (const f of snapshot?.frames ?? []) {
      vib.set(f.timestamp, { ...f.vibration.features.values, ...f.acoustic.features.values });
    }
    return (snapshot?.heatmap ?? []).map(
      (row) => vib.get(row.timestamp) ?? {},
    );
  }, [snapshot]);

  if (engine.status === "loading" || engine.status === "training") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {engine.status === "training"
            ? "Learning what normal looks like — training the baseline on healthy data…"
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

  const latest = snapshot?.latest ?? null;

  return (
    <main className="min-h-screen bg-background pb-16">
      <ObservatoryHeader engine={engine} />

      <div className="mx-auto max-w-7xl space-y-4 px-4 pt-5 sm:px-6">
        {engine.activeScenario ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-md border border-chart-2/40 bg-chart-2/10 px-3 py-2 text-xs"
          >
            <span className="size-1.5 animate-pulse rounded-full bg-chart-2" />
            <span className="font-semibold">{engine.activeScenario.title}</span>
            <span className="text-muted-foreground">
              step: {engine.activeScenario.stepLabel}
            </span>
          </motion.div>
        ) : null}

        {/* Row 1: status + sensor panels */}
        <div className="grid gap-4 lg:grid-cols-3">
          <motion.div custom={0} variants={stagger} initial="hidden" animate="show" className="space-y-4">
            <MachineStatusCard frame={latest} />
            <FusionStatusCard frame={latest} />
            <Card className="border-border/60 shadow-none">
              <CardContent className="flex items-center justify-between py-3 text-[11px] text-muted-foreground">
                <span>
                  baseline trained {engine.trainedAt ? new Date(engine.trainedAt).toLocaleTimeString() : "—"} ·{" "}
                  {engine.sampleCount} healthy windows
                </span>
                <button
                  className="text-muted-foreground/70 underline-offset-2 hover:text-foreground hover:underline"
                  onClick={async () => {
                    await signOut();
                    navigate("/");
                  }}
                >
                  <LogOut className="mr-1 inline size-3" />
                  sign out
                </button>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div custom={1} variants={stagger} initial="hidden" animate="show">
            <SensorPanel
              title="Vibration"
              sensor="ADXL345 · 3-axis accelerometer"
              frame={latest}
              modality="vibration"
              indicator={latest?.vibration.anomaly.anomalyIndicator ?? 0}
              isAnomaly={latest?.vibration.anomaly.isAnomaly ?? false}
              qualityScore={latest?.vibration.features.quality.score ?? 0}
              qualityNote={latest?.vibration.features.quality.note ?? "—"}
            />
          </motion.div>

          <motion.div custom={2} variants={stagger} initial="hidden" animate="show">
            <SensorPanel
              title="Acoustic"
              sensor="INMP441 · I2S MEMS microphone"
              frame={latest}
              modality="acoustic"
              indicator={latest?.acoustic.anomaly.anomalyIndicator ?? 0}
              isAnomaly={latest?.acoustic.anomaly.isAnomaly ?? false}
              qualityScore={latest?.acoustic.features.quality.score ?? 0}
              qualityNote={latest?.acoustic.features.quality.note ?? "—"}
            />
          </motion.div>
        </div>

        {/* Row 2: cloud + fingerprint */}
        <div className="grid gap-4 lg:grid-cols-2">
          <motion.div custom={3} variants={stagger} initial="hidden" animate="show">
            <BehaviourCloud
              baseline={snapshot?.cloud.baseline ?? []}
              live={snapshot?.cloud.live ?? []}
            />
          </motion.div>
          <motion.div custom={4} variants={stagger} initial="hidden" animate="show">
            <BehaviourFingerprint
              vibration={snapshot?.fingerprint.vibration ?? []}
              acoustic={snapshot?.fingerprint.acoustic ?? []}
            />
          </motion.div>
        </div>

        {/* Row 3: heatmap + investigation */}
        <div className="grid gap-4 lg:grid-cols-2">
          <motion.div custom={5} variants={stagger} initial="hidden" animate="show">
            <AnomalyHeatmap
              rows={snapshot?.heatmap ?? []}
              baselines={baselines}
              valuesByRow={valuesByRow}
            />
          </motion.div>
          <motion.div custom={6} variants={stagger} initial="hidden" animate="show">
            <InvestigationPanel investigation={latest?.investigation ?? null} />
          </motion.div>
        </div>

        {/* Row 4: what-if simulator */}
        <motion.div custom={7} variants={stagger} initial="hidden" animate="show">
          <WhatIfSimulator engine={engine} />
        </motion.div>
      </div>
    </main>
  );
}
