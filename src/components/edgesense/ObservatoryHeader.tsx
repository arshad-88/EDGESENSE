import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  CircleDot,
  Radio,
  RotateCcw,
  Square,
  Waves,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  STATUS_BG_CLASS,
  STATUS_LABEL,
  STATUS_TEXT_CLASS,
  statusForDecision,
  MODE_LABELS,
} from "./ui-helpers";
import { SCENARIOS } from "@/core/edgesense";
import type { EdgeSenseApi } from "@/hooks/use-edgesense";

interface Props {
  engine: EdgeSenseApi;
}

export function ObservatoryHeader({ engine }: Props) {
  const latest = engine.snapshot?.latest;
  const level = statusForDecision(latest?.fusion.decision ?? "healthy");
  const mode = latest ? MODE_LABELS[latest.machineMode] ?? latest.machineMode : "—";

  return (
    <header className="glass-panel sticky top-0 z-20 border-b bg-grid">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Waves className="size-5" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-[0.18em]">EDGESENSE</span>
              <Badge variant="outline" className="hidden px-1.5 py-0 text-[9px] tracking-widest text-muted-foreground sm:inline">
                SIMULATED DATA
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Machine Behaviour Observatory
            </p>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          <motion.span
            key={level}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`inline-block size-2.5 rounded-full ${STATUS_BG_CLASS[level]}`}
          />
          <span className={`text-xs font-semibold tracking-widest ${STATUS_TEXT_CLASS[level]}`}>
            {STATUS_LABEL[level]}
          </span>
        </div>

        {/* Mode */}
        <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
          <Activity className="size-3.5" />
          <span className="font-medium text-foreground">{mode}</span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Replay scenarios */}
          <div className="hidden flex-wrap items-center gap-1.5 lg:flex">
            {SCENARIOS.filter((s) => s.id !== "normal").map((s) => (
              <Button
                key={s.id}
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={engine.status !== "running"}
                onClick={() => engine.startScenario(s.id)}
              >
                {s.title}
              </Button>
            ))}
          </div>

          {engine.activeScenario ? (
            <Button
              size="sm"
              variant="destructive"
              className="h-7 gap-1.5 px-2 text-[11px]"
              onClick={engine.stopScenario}
            >
              <Square className="size-3" />
              Stop {engine.activeScenario.title}
            </Button>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-[11px]"
            disabled={engine.status !== "running"}
            onClick={engine.retrain}
            title="Retrain the normal-behaviour baseline from fresh healthy data"
          >
            <RotateCcw className="size-3" />
            Retrain
          </Button>

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Radio className="size-3 text-status-healthy" />
            live
          </div>
        </div>
      </div>
    </header>
  );
}
