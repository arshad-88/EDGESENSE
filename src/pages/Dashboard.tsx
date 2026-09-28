import { useMemo } from "react";
import { LogOut, Waves, Loader2, Radio } from "lucide-react";
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
import { EdgeLinkPanel } from "@/components/edgesense/EdgeLinkPanel";
import { Panel, Tag } from "@/components/edgesense/Panel";
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
    link,
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
  const anomalous =
    (latest ? latest.fusion.decision === "corroborated-anomaly" : false) ||
    machine.fusedAnomalyScore > 0.7;

  // Baselines per cell key for the heatmap tooltips.
  const baselinesByKey = useMemo(() => {
    const out: Record<string, number> = {};
    for (const b of snapshot?.fingerprint.vibration ?? [])
      out[`ADXL345:${b.feature}`] = b.baseline;
    for (const b of snapshot?.fingerprint.acoustic ?? [])
      out[`INMP441:${b.feature}`] = b.baseline;
    return out;
  }, [snapshot]);

  const valuesByKey = useMemo(() => {
    const byTs = new Map<number, Record<string, number>>();
    for (const f of snapshot?.frames ?? []) {
      const row: Record<string, number> = {};
      for (const [feat, v] of Object.entries(f.vibration.features.values))
        row[`ADXL345:${feat}`] = v;
      for (const [feat, v] of Object.entries(f.acoustic.features.values))
        row[`INMP441:${feat}`] = v;
      byTs.set(f.timestamp, row);
    }
    return (snapshot?.heatmap ?? []).map((r) => byTs.get(r.timestamp) ?? {});
  }, [snapshot]);

  if (!baselineReady) {
    return (
      <main className="bg-observatory flex min-h-screen flex-col items-center justify-center gap-3">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Learning what normal looks like — training the isolation forest…
        </p>
      </main>
    );
  }

  return (
    <main className="bg-observatory min-h-screen pb-16">
      {/* ============ STATUS BAR ============ */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded border border-primary/30 bg-primary/10 text-primary">
              <Waves className="size-4" />
            </div>
            <div className="leading-tight">
              <p className="text-[13px] font-bold tracking-[0.22em]">
                EDGESENSE
              </p>
              <p className="label-tech mt-0.5">Machine Behaviour Observatory</p>
            </div>
          </div>

          <Badge
            variant="outline"
            className="px-1.5 py-0 text-[9px] tracking-widest text-primary"
          >
            ● SIMULATION MODE
          </Badge>
          <Badge
            variant="outline"
            className="hidden px-1.5 py-0 text-[9px] tracking-widest text-muted-foreground sm:inline-flex"
          >
            SYNTHETIC SENSOR STREAM
          </Badge>

          <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                className={`size-1.5 rounded-full ${
                  running
                    ? anomalous
                      ? "animate-pulse bg-status-anomaly"
                      : "animate-pulse bg-status-healthy"
                    : "bg-muted-foreground"
                }`}
              />
              {running ? "acquisition active" : "acquisition inactive"}
            </span>
            <button
              className="underline-offset-2 hover:text-foreground hover:underline"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
              aria-label="Sign out"
            >
              <LogOut className="inline size-3.5" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1560px] space-y-5 px-5 pt-5">
        {/* ============ 01 · MACHINE ============ */}
        <MachineCenter
          machine={machine}
          machineRef={machineRef}
          startupStep={startupStep}
          audioAvailable={audioAvailable}
          onStart={startMotor}
          onStop={stopMotor}
          onBehaviour={setBehaviour}
        />

        {/* ============ 02 · EDGE LINK ============ */}
        <EdgeLinkPanel link={link} />

        {/* ============ 03 · TELEMETRY ============ */}
        <Panel
          index="02"
          title="Live acquisition"
          hint="ADXL345 vibration · INMP441 acoustic"
          actions={
            <>
              <Tag tone="primary">ADXL345</Tag>
              <Tag tone="suspicious">INMP441</Tag>
              <Tag tone={running ? "healthy" : "muted"}>
                {running ? "STREAMING" : "IDLE"}
              </Tag>
            </>
          }
        >
          {running && latest ? (
            <TelemetryPanel frame={latest} />
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Radio className="size-5 text-muted-foreground/60" />
              <p className="text-xs text-muted-foreground">
                No signal — start the machine to begin acquisition.
              </p>
              <Button size="sm" variant="outline" onClick={startMotor}>
                Start machine
              </Button>
            </div>
          )}
        </Panel>

        {/* ============ 03 · INTELLIGENCE ============ */}
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel
          index="04"
          title="Behaviour map"
            hint="Baseline cloud vs live trajectory"
          >
            <BehaviourMap
              baseline={snapshot?.cloud.baseline ?? []}
              live={snapshot?.cloud.live ?? []}
              trajectory={snapshot?.cloud.trajectory ?? []}
              currentIsAnomaly={anomalous}
              sensor="ADXL345"
              onSensorChange={() => {}}
            />
          </Panel>
          <Panel
            index="05"
            title="Sensor fingerprint"
            hint="Per-feature distance from baseline"
          >
            <FingerprintRadar
              vibration={snapshot?.fingerprint.vibration ?? []}
              acoustic={snapshot?.fingerprint.acoustic ?? []}
            />
          </Panel>
        </div>

        {/* ============ 05 · SIGNATURE ============ */}
        <Panel
          index="06"
          title="Anomaly signature"
          hint="Feature × time — deviation from the learned baseline"
          actions={
            <Tag tone={anomalous ? "anomaly" : "muted"}>
              {anomalous ? "DEVIATION ACTIVE" : "WITHIN BASELINE"}
            </Tag>
          }
        >
          <AnomalySignature
            rows={snapshot?.heatmap ?? []}
            valuesByKey={valuesByKey}
            baselinesByKey={baselinesByKey}
          />
        </Panel>

        {/* ============ 06 · INVESTIGATION ============ */}
        <Panel
          index="07"
          title="Investigation"
          hint="Evidence behind the current verdict"
        >
          {latest ? (
            <InvestigationFlow frame={latest} />
          ) : (
            <p className="py-10 text-center text-xs text-muted-foreground">
              Anomaly investigation activates once the machine is running.
            </p>
          )}
        </Panel>

        {/* ============ 07 · WHAT-IF ============ */}
        <Panel
          index="08"
          title="What-if simulator"
          hint="Push the machine and watch the whole pipeline respond"
        >
          <WhatIfConsole
            machine={machine}
            simConfig={simConfig}
            onApply={applySimOverride}
            onReset={resetSimOverride}
            onRetrain={retrain}
          />
        </Panel>
      </div>
    </main>
  );
}
