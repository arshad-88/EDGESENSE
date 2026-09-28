/**
 * What-If Simulator — what happens if the machine changes?
 *
 * Sliders push the underlying simulation config directly; because every page
 * consumes the same central machine state, the 3D machine, sound, sensor
 * waves, features, anomaly scores, fusion and behaviour visuals all respond on
 * the next tick. Behaviour presets are one-tap entry points.
 */
import { ObservatoryShell } from "@/components/edgesense/ObservatoryShell";
import { Panel, Tag } from "@/components/edgesense/Panel";
import { WhatIfConsole } from "@/components/edgesense/WhatIfConsole";
import { BehaviourMap } from "@/components/edgesense/BehaviourMap";
import { FingerprintRadar } from "@/components/edgesense/FingerprintRadar";
import { InvestigationFlow } from "@/components/edgesense/InvestigationFlow";
import { AnomalySignature } from "@/components/edgesense/AnomalySignature";
import { cn } from "@/lib/utils";

export default function Simulator() {
  return (
    <ObservatoryShell>
      {(api) => {
        const { machine, snapshot } = api;
        const running = machine.power === "ON" || machine.power === "STARTING";
        const anomalous = machine.fusedAnomalyScore > 0.7;
        const latest = snapshot?.frames[snapshot?.frames.length - 1] ?? null;

        return (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4">
              <h1 className="text-lg font-bold tracking-tight">What if the machine changes?</h1>
              <p className={cn("text-[11px] font-bold tracking-[0.18em]", anomalous ? "text-status-anomaly" : running ? "text-status-healthy" : "text-muted-foreground")}>
                {running ? (anomalous ? "PIPELINE RESPONDING — DEVIATION" : "PIPELINE RESPONDING") : "START THE MACHINE TO EXPERIMENT"}
              </p>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(320px,1fr)_1.4fr]">
              <Panel index="01" title="What-if console" hint="every knob feeds the same machine state">
                <WhatIfConsole
                  machine={machine}
                  simConfig={api.simConfig}
                  onApply={api.applySimOverride}
                  onReset={api.resetSimOverride}
                  onRetrain={api.retrain}
                />
              </Panel>

              <div className="space-y-5">
                <Panel index="02" title="Behaviour field response" hint="where the pushed state lands">
                  <BehaviourMap
                    baseline={snapshot?.cloud.baseline ?? []}
                    live={snapshot?.cloud.live ?? []}
                    trajectory={snapshot?.cloud.trajectory ?? []}
                    currentIsAnomaly={anomalous}
                    sensor="ADXL345"
                    onSensorChange={() => {}}
                  />
                </Panel>
                <Panel index="03" title="Fingerprint response" hint="signature deformation in real time">
                  <FingerprintRadar
                    vibration={snapshot?.fingerprint.vibration ?? []}
                    acoustic={snapshot?.fingerprint.acoustic ?? []}
                  />
                </Panel>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <Panel index="04" title="Deviation heatmap" hint="history of the experiment">
                <AnomalySignature
                  rows={snapshot?.heatmap ?? []}
                  valuesByKey={Object.fromEntries(
                    (snapshot?.frames ?? []).flatMap((f) => [
                      ...Object.entries(f.vibration?.features?.values ?? {}).map(([k, v]) => [`ADXL345:${k}`, v]),
                      ...Object.entries(f.acoustic?.features?.values ?? {}).map(([k, v]) => [`INMP441:${k}`, v]),
                    ]),
                  )}
                  baselinesByKey={Object.fromEntries([
                    ...(snapshot?.fingerprint.vibration ?? []).map((b) => [`ADXL345:${b.feature}`, b.baseline]),
                    ...(snapshot?.fingerprint.acoustic ?? []).map((b) => [`INMP441:${b.feature}`, b.baseline]),
                  ])}
                />
              </Panel>
              <Panel index="05" title="Investigation response" hint="the explanation updates with the experiment">
                {latest ? (
                  <InvestigationFlow frame={latest} />
                ) : (
                  <p className="py-10 text-center text-xs text-muted-foreground">
                    Start the machine, then push the sliders.
                  </p>
                )}
              </Panel>
            </div>
          </>
        );
      }}
    </ObservatoryShell>
  );
}
