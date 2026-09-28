/**
 * Signal Intelligence — understand what the sensors see.
 *
 * RAW SIGNAL → PROCESSING → FEATURES, per modality: the ADXL345 vibration
 * channel and the INMP441 acoustic channel, each with its live waveform, FFT
 * and feature readouts. Layout is two tall columns (one per sensor), not a
 * grid of tiny cards.
 */
import { Activity, AudioWaveform } from "lucide-react";
import { ObservatoryShell } from "@/components/edgesense/ObservatoryShell";
import { Panel, Tag } from "@/components/edgesense/Panel";
import { AnomalySignature } from "@/components/edgesense/AnomalySignature";
import { cn } from "@/lib/utils";

const VIB_FEATURES = ["rms", "variance", "peak", "kurtosis", "dominantFreq", "spectralEnergy"] as const;

function FeatureRow({ name, value, baseline, tone }: { name: string; value: number; baseline?: number; tone?: string }) {
  const dev = baseline ? (value - baseline) / Math.max(Math.abs(baseline), 1e-6) : 0;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/30 py-1.5 last:border-0">
      <span className="text-[11px] tracking-wide text-muted-foreground">{name}</span>
      <span className="flex items-baseline gap-2">
        <span className={cn("tnum font-mono text-[13px] font-semibold", tone)}>
          {Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(3)}
        </span>
        {baseline !== undefined ? (
          <span className={cn("tnum w-14 text-right font-mono text-[10px]", Math.abs(dev) > 0.18 ? "text-status-suspicious" : "text-muted-foreground/60")}>
            {dev >= 0 ? "+" : ""}{(dev * 100).toFixed(0)}%
          </span>
        ) : null}
      </span>
    </div>
  );
}

export default function Signals() {
  return (
    <ObservatoryShell>
      {(api) => {
        const { machine, snapshot } = api;
        const running = machine.power === "ON" || machine.power === "STARTING";
        const vib = snapshot?.frames[snapshot?.frames.length - 1]?.vibration;
        const acou = snapshot?.frames[snapshot?.frames.length - 1]?.acoustic;

        return (
          <>
            <div className="grid gap-5 xl:grid-cols-2">
              {/* ============ VIBRATION ============ */}
              <Panel
                index="01"
                title="ADXL345 · Vibration channel"
                hint="3-axis accelerometer on the motor housing"
                actions={
                  <span className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8]" />
                    <Tag tone={running ? "primary" : "muted"}>{running ? "LIVE" : "DORMANT"}</Tag>
                  </span>
                }
                bodyClassName="p-4 space-y-4"
              >
                <div className="rounded-md border border-border/50 bg-background/50 p-3">
                  <p className="label-tech mb-2 flex items-center gap-1.5">
                    <Activity className="size-3 text-sky-400" /> RAW WAVEFORM
                  </p>
                  <div className="flex h-24 items-center gap-px">
                    {running
                      ? Array.from({ length: 96 }, (_, i) => {
                          const v = Math.sin(i * 0.6 + machine.rpm / 90) * Math.sin(i * 0.11) * machine.vibrationRms;
                          return (
                            <span
                              key={i}
                              className="w-full min-w-[2px] rounded-full bg-sky-400/80"
                              style={{ height: `${Math.min(100, Math.abs(v) * 220 + 4)}%`, opacity: 0.35 + Math.abs(v) * 0.8 }}
                            />
                          );
                        })
                      : (
                          <div className="w-full text-center">
                            <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground">
                              MACHINE OFF
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground/70">
                              Start the machine to begin acquisition.
                            </p>
                          </div>
                        )}
                  </div>
                </div>
                <div>
                  <p className="label-tech mb-1">FEATURE VECTOR</p>
                  {running && vib?.features ? (
                    VIB_FEATURES.map((f) => (
                      <FeatureRow
                        key={f}
                        name={f}
                        value={(vib.features.values as Record<string, number>)[f] ?? 0}
                        baseline={snapshot?.fingerprint.vibration.find((b) => b.feature === f)?.baseline}
                        tone={(vib.features.values as Record<string, number>)[f] ? undefined : undefined}
                      />
                    ))
                  ) : (
                    <p className="py-6 text-center text-[11px] text-muted-foreground">—</p>
                  )}
                </div>
              </Panel>

              {/* ============ ACOUSTIC ============ */}
              <Panel
                index="02"
                title="INMP441 · Acoustic channel"
                hint="I²S MEMS microphone above the machine"
                actions={
                  <span className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-orange-400 shadow-[0_0_6px_#fb923c]" />
                    <Tag tone={running ? "suspicious" : "muted"}>{running ? "LIVE" : "DORMANT"}</Tag>
                  </span>
                }
                bodyClassName="p-4 space-y-4"
              >
                <div className="rounded-md border border-border/50 bg-background/50 p-3">
                  <p className="label-tech mb-2 flex items-center gap-1.5">
                    <AudioWaveform className="size-3 text-orange-400" /> RAW WAVEFORM
                  </p>
                  <div className="flex h-24 items-center gap-px">
                    {running
                      ? Array.from({ length: 96 }, (_, i) => {
                          const v = Math.sin(i * 0.7 + machine.rpm / 70) * Math.cos(i * 0.13) * (machine.acousticLevel / 90);
                          return (
                            <span
                              key={i}
                              className="w-full min-w-[2px] rounded-full bg-orange-400/80"
                              style={{ height: `${Math.min(100, Math.abs(v) * 220 + 4)}%`, opacity: 0.35 + Math.abs(v) * 0.8 }}
                            />
                          );
                        })
                      : (
                          <div className="w-full text-center">
                            <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground">
                              MACHINE OFF
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground/70">
                              Start the machine to begin acquisition.
                            </p>
                          </div>
                        )}
                  </div>
                </div>
                <div>
                  <p className="label-tech mb-1">FEATURE VECTOR</p>
                  {running && acou?.features ? (
                    VIB_FEATURES.map((f) => (
                      <FeatureRow
                        key={f}
                        name={f}
                        value={(acou.features.values as Record<string, number>)[f] ?? 0}
                        baseline={snapshot?.fingerprint.acoustic.find((b) => b.feature === f)?.baseline}
                      />
                    ))
                  ) : (
                    <p className="py-6 text-center text-[11px] text-muted-foreground">—</p>
                  )}
                </div>
              </Panel>
            </div>

            {/* ============ SIGNAL → FEATURE FLOW ============ */}
            <Panel index="03" title="Signal path" hint="raw signal → processing → features — per sensor">
              <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
                {["RAW SIGNAL", "WINDOWING", "FFT + TIME FEATURES", "QUALITY CHECK", "FEATURE VECTOR"].map((s, i) => (
                  <div key={s} className="flex flex-1 items-center gap-3">
                    <span className="flex-1 rounded border border-border/60 bg-card/70 px-3 py-2.5 text-center text-[10px] font-semibold tracking-[0.14em]">
                      {s}
                    </span>
                    {i < 4 ? <span className="text-primary/50">→</span> : null}
                  </div>
                ))}
              </div>
            </Panel>

            {/* ============ DEVIATION HEATMAP ============ */}
            <Panel index="04" title="Deviation heatmap" hint="feature × time — distance from the learned baseline">
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
          </>
        );
      }}
    </ObservatoryShell>
  );
}
