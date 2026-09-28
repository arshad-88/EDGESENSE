/**
 * Behaviour Intelligence — show what "normal" means.
 *
 * The learned behaviour envelope as a substantial visual: the historical
 * healthy cloud, the learned boundary, and the live trajectory of the current
 * machine moving through that space. Beside it, the machine's behaviour
 * fingerprint: baseline signature vs current signature, deforming visibly
 * when the machine drifts.
 */
import { ObservatoryShell } from "@/components/edgesense/ObservatoryShell";
import { Panel, Tag } from "@/components/edgesense/Panel";
import { BehaviourMap } from "@/components/edgesense/BehaviourMap";
import { FingerprintRadar } from "@/components/edgesense/FingerprintRadar";
import { cn } from "@/lib/utils";

export default function Behaviour() {
  return (
    <ObservatoryShell>
      {(api) => {
        const { machine, snapshot } = api;
        const running = machine.power === "ON" || machine.power === "STARTING";
        const anomalous = machine.fusedAnomalyScore > 0.7;
        const nearBoundary = machine.fusedAnomalyScore > 0.28 && !anomalous;

        const posture = !running
          ? { label: "DORMANT — no live assessment", tone: "text-muted-foreground" }
          : anomalous
            ? { label: "OUTSIDE THE LEARNED ENVELOPE", tone: "text-status-anomaly" }
            : nearBoundary
              ? { label: "NEAR THE ENVELOPE BOUNDARY", tone: "text-status-suspicious" }
              : { label: "INSIDE THE LEARNED ENVELOPE", tone: "text-status-healthy" };

        return (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h1 className="text-lg font-bold tracking-tight">Behaviour field</h1>
              <p className={cn("text-[11px] font-bold tracking-[0.18em]", posture.tone)}>{posture.label}</p>
              <p className="ml-auto text-[10px] text-muted-foreground">
                PCA projection · visualization only — the Isolation Forest decides
              </p>
            </div>

            <Panel
              index="01"
              title="Learned normal envelope"
              hint="healthy history vs live trajectory"
              actions={<Tag tone={anomalous ? "anomaly" : running ? "healthy" : "muted"}>
                {anomalous ? "DEVIATION" : running ? "TRACKING" : "IDLE"}
              </Tag>}
              bodyClassName="p-4"
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

            <div className="grid gap-5 xl:grid-cols-2">
              <Panel index="02" title="Machine behaviour fingerprint" hint="baseline signature vs current signature">
                <FingerprintRadar
                  vibration={snapshot?.fingerprint.vibration ?? []}
                  acoustic={snapshot?.fingerprint.acoustic ?? []}
                />
              </Panel>

              <Panel index="03" title="How to read this" hint="the three postures">
                <div className="space-y-4">
                  {[
                    {
                      t: "INSIDE THE ENVELOPE",
                      tone: "text-status-healthy",
                      b: "The current point sits within the cloud of healthy behaviour this machine has already shown. Nothing to act on.",
                    },
                    {
                      t: "NEAR THE BOUNDARY",
                      tone: "text-status-suspicious",
                      b: "Load or condition changes push the signature toward the edge of normal. Watch, don't alarm — this is where heavy load lives.",
                    },
                    {
                      t: "OUTSIDE THE ENVELOPE",
                      tone: "text-status-anomaly",
                      b: "The signature has left everything the machine has ever done while healthy. Both sensors corroborating makes this a genuine deviation.",
                    },
                  ].map((x) => (
                    <div key={x.t} className="border-l-2 pl-3" style={{ borderColor: "currentColor" }}>
                      <p className={cn("text-[11px] font-bold tracking-[0.16em]", x.tone)}>{x.t}</p>
                      <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{x.b}</p>
                    </div>
                  ))}
                  <p className="border-t border-border/50 pt-3 text-[11px] leading-5 text-muted-foreground">
                    The envelope is learned from this machine's own healthy running data — it is
                    specific to this asset, and it sharpens as more healthy behaviour is observed.
                  </p>
                </div>
              </Panel>
            </div>
          </>
        );
      }}
    </ObservatoryShell>
  );
}
