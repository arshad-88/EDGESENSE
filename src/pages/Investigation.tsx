/**
 * Anomaly Investigation — why was the machine flagged?
 *
 * A visual evidence chain, not a text log: each sensor's deviation flows down
 * through its own anomaly indicator, the two meet in the fusion step, and the
 * fused verdict resolves into the investigation's explanation with per-feature
 * evidence. Connectors are animated while data is live.
 */
import { motion } from "framer-motion";
import { ObservatoryShell } from "@/components/edgesense/ObservatoryShell";
import { Panel, Tag } from "@/components/edgesense/Panel";
import { InvestigationFlow } from "@/components/edgesense/InvestigationFlow";
import { cn } from "@/lib/utils";

function ChainNode({
  title,
  subtitle,
  tone,
  active,
  children,
}: {
  title: string;
  subtitle?: string;
  tone: "blue" | "orange" | "neutral" | "verdict";
  active?: boolean;
  children?: React.ReactNode;
}) {
  const border = {
    blue: "border-sky-400/40",
    orange: "border-orange-400/40",
    neutral: "border-border/60",
    verdict: "border-primary/40",
  }[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.4 }}
      className={cn("rounded-md border bg-card/60 p-3", border)}
    >
      <p className="text-[11px] font-bold tracking-[0.16em]">{title}</p>
      {subtitle ? <p className="mt-0.5 text-[10px] text-muted-foreground">{subtitle}</p> : null}
      {children}
      {active ? (
        <motion.span
          className="mt-2 block h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
      ) : null}
    </motion.div>
  );
}

function Connector({ tone = "primary" }: { tone?: "primary" | "muted" }) {
  return (
    <div className="flex justify-center py-1">
      <motion.span
        className={cn("h-6 w-px", tone === "primary" ? "bg-primary/50" : "bg-border")}
        animate={tone === "primary" ? { opacity: [0.4, 1, 0.4] } : undefined}
        transition={{ duration: 1.4, repeat: Infinity }}
      />
    </div>
  );
}

export default function Investigation() {
  return (
    <ObservatoryShell>
      {(api) => {
        const { machine, snapshot } = api;
        const running = machine.power === "ON" || machine.power === "STARTING";
        const latest = snapshot?.frames[snapshot?.frames.length - 1] ?? null;
        const vibAnom = latest?.vibration?.anomaly?.isAnomaly ?? false;
        const acouAnom = latest?.acoustic?.anomaly?.isAnomaly ?? false;
        const fused = latest?.fusion;
        const verdict = !running
          ? { label: "NO DATA — MACHINE OFF", tone: "text-muted-foreground" }
          : fused?.decision === "corroborated-anomaly"
            ? { label: "CORROBORATED ANOMALY", tone: "text-status-anomaly" }
            : (fused?.decision ?? "").startsWith("suspicious")
              ? { label: "SENSOR DISAGREEMENT — SUSPICIOUS", tone: "text-status-suspicious" }
              : { label: "HEALTHY", tone: "text-status-healthy" };

        return (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4">
              <h1 className="text-lg font-bold tracking-tight">Why was the machine flagged?</h1>
              <p className={cn("text-[11px] font-bold tracking-[0.18em]", verdict.tone)}>{verdict.label}</p>
            </div>

            {/* ============ EVIDENCE CHAIN ============ */}
            <div className="grid gap-5 xl:grid-cols-[1fr_1fr_minmax(320px,1.1fr)]">
              <div>
                <ChainNode
                  title="ADXL345 · VIBRATION DEVIATION"
                  subtitle="features beyond the learned baseline"
                  tone="blue"
                  active={running}
                >
                  {running && latest?.vibration?.anomaly ? (
                    <p className="tnum mt-2 font-mono text-sm">
                      indicator <span className={vibAnom ? "text-status-anomaly" : "text-status-healthy"}>
                        {latest.vibration.anomaly.anomalyIndicator.toFixed(2)}
                      </span>
                    </p>
                  ) : null}
                </ChainNode>
                <Connector tone={running ? "primary" : "muted"} />
                <ChainNode title="VIBRATION SENSOR ANOMALY" tone="blue" active={vibAnom}>
                  <p className={cn("mt-1 text-[11px] font-bold", vibAnom ? "text-status-anomaly" : "text-status-healthy")}>
                    {running ? (vibAnom ? "FLAGGED" : "WITHIN BASELINE") : "—"}
                  </p>
                </ChainNode>
              </div>

              <div>
                <ChainNode
                  title="INMP441 · ACOUSTIC DEVIATION"
                  subtitle="spectrum beyond the learned baseline"
                  tone="orange"
                  active={running}
                >
                  {running && latest?.acoustic?.anomaly ? (
                    <p className="tnum mt-2 font-mono text-sm">
                      indicator <span className={acouAnom ? "text-status-anomaly" : "text-status-healthy"}>
                        {latest.acoustic.anomaly.anomalyIndicator.toFixed(2)}
                      </span>
                    </p>
                  ) : null}
                </ChainNode>
                <Connector tone={running ? "primary" : "muted"} />
                <ChainNode title="ACOUSTIC SENSOR ANOMALY" tone="orange" active={acouAnom}>
                  <p className={cn("mt-1 text-[11px] font-bold", acouAnom ? "text-status-anomaly" : "text-status-healthy")}>
                    {running ? (acouAnom ? "FLAGGED" : "WITHIN BASELINE") : "—"}
                  </p>
                </ChainNode>
              </div>

              <div>
                <ChainNode
                  title="MULTIMODAL FUSION"
                  subtitle="agreement matrix + quality gate"
                  tone="neutral"
                  active={running}
                >
                  {fused ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      agreement <span className="tnum font-mono text-foreground">{fused.sensorAgreement.toFixed(2)}</span>
                    </p>
                  ) : null}
                </ChainNode>
                <Connector tone={running ? "primary" : "muted"} />
                <ChainNode title="FINAL DECISION" tone="verdict" active={running}>
                  <p className={cn("mt-1 text-[12px] font-bold tracking-[0.14em]", verdict.tone)}>{verdict.label}</p>
                </ChainNode>
                <Connector tone="muted" />
                <ChainNode title="EXPLANATION" subtitle="computed evidence, not written copy" tone="neutral">
                  <p className="mt-1 text-[10px] leading-5 text-muted-foreground">
                    Exact fault classification is future work that requires labelled
                    fault data. EdgeSense reports distance from learned normal, with
                    the features that moved and by how much.
                  </p>
                </ChainNode>
              </div>
            </div>

            {/* ============ FULL INVESTIGATION ============ */}
            <Panel
              index="01"
              title="Investigation detail"
              hint="primary + supporting evidence with per-feature deltas"
              actions={<Tag tone={verdict.label.includes("ANOMALY") ? "anomaly" : "muted"}>{verdict.label.includes("ANOMALY") ? "ACTIVE" : "STANDBY"}</Tag>}
            >
              {latest ? (
                <InvestigationFlow frame={latest} />
              ) : (
                <p className="py-10 text-center text-xs text-muted-foreground">
                  Investigation activates once the machine is running.
                </p>
              )}
            </Panel>
          </>
        );
      }}
    </ObservatoryShell>
  );
}
