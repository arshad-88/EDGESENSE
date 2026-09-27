/**
 * BehaviourTransition — temporal state timeline showing where the machine sits
 * between NORMAL → EARLY DEVIATION → SUSPICIOUS → CORROBORATED ANOMALY, with
 * recent history so recovery is visible as movement back toward normal.
 */
import type { PipelineFrame } from "@/core/edgesense";
import { cn } from "@/lib/utils";

interface Props {
  frame: PipelineFrame | null;
}

const STAGES = [
  { key: "normal", label: "NORMAL" },
  { key: "early", label: "EARLY DEVIATION" },
  { key: "suspicious", label: "SUSPICIOUS" },
  { key: "anomaly", label: "CORROBORATED\nANOMALY" },
] as const;

function stageIndex(state: string, indicator: number): number {
  if (state === "corroborated-anomaly") return 3;
  if (state === "suspicious") return indicator > 0.55 ? 2 : 1;
  return indicator > 0.28 ? 1 : 0;
}

export function BehaviourTransition({ frame }: Props) {
  const indicator = frame
    ? Math.max(frame.vibration.anomaly.anomalyIndicator, frame.acoustic.anomaly.anomalyIndicator)
    : 0;
  const state = frame?.fusion.state ?? "healthy";
  const active = stageIndex(state, indicator);

  // Recent history strip: last 40 windows colored by state.
  const history = frame ? frame.fusion.timestamp : 0;

  return (
    <div>
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">Behaviour Transition</h3>
          <p className="text-[11px] text-muted-foreground">
            Continuous monitoring — where the machine sits between normal and anomaly
          </p>
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          t = {history.toFixed(0)}s
        </span>
      </div>

      {/* track */}
      <div className="relative pt-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gradient-to-r from-status-healthy/70 via-status-suspicious/70 to-status-anomaly/80" />
        {/* marker */}
        <div
          className="absolute top-0 transition-all duration-500"
          style={{ left: `calc(${(active / (STAGES.length - 1)) * 100}% - ${active === 0 ? 0 : active === 3 ? 10 : 5}px)` }}
        >
          <div
            className={cn(
              "size-3 rounded-full border-2 border-background shadow",
              active === 0 ? "bg-status-healthy" : active === 3 ? "bg-status-anomaly" : "bg-status-suspicious",
              active > 0 && "animate-pulse",
            )}
          />
        </div>
      </div>

      {/* stage labels */}
      <div className="mt-2 grid grid-cols-4 gap-1 text-center">
        {STAGES.map((s, i) => (
          <span
            key={s.key}
            className={cn(
              "whitespace-pre-line text-[9px] font-semibold leading-tight tracking-wide",
              i === active ? "text-foreground" : "text-muted-foreground/60",
            )}
          >
            {s.label}
          </span>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded border border-border/50 px-2 py-1.5">
          <span className="block text-muted-foreground">Vibration indicator</span>
          <span className="font-semibold tabular-nums">
            {frame?.vibration.anomaly.anomalyIndicator.toFixed(2) ?? "—"}{" "}
            {frame?.vibration.anomaly.isAnomaly ? "· flagged" : ""}
          </span>
        </div>
        <div className="rounded border border-border/50 px-2 py-1.5">
          <span className="block text-muted-foreground">Acoustic indicator</span>
          <span className="font-semibold tabular-nums">
            {frame?.acoustic.anomaly.anomalyIndicator.toFixed(2) ?? "—"}{" "}
            {frame?.acoustic.anomaly.isAnomaly ? "· flagged" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
