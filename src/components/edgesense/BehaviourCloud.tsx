import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Scatter, ScatterChart, XAxis, YAxis, ZAxis } from "recharts";
import type { CloudPoint } from "@/core/edgesense";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  baseline: CloudPoint[];
  live: CloudPoint[];
}

type SensorFilter = "ADXL345" | "INMP441";

const config = {
  baseline: { label: "Learned normal", color: "var(--chart-4)" },
  normal: { label: "Current (in family)", color: "var(--chart-1)" },
  deviation: { label: "Current (deviating)", color: "var(--chart-3)" },
} satisfies ChartConfig;

/**
 * 2D visualization of feature space (PCA projection).
 * Visualization only — anomaly detection itself is Isolation Forest.
 */
export function BehaviourCloud({ baseline, live }: Props) {
  const [sensor, setSensor] = useState<SensorFilter>("ADXL345");

  const { basePoints, livePoints } = useMemo(() => {
    const b = baseline
      .filter((p) => p.sensor === sensor)
      .map((p) => ({ x: p.pc1, y: p.pc2, kind: "baseline" as const }));
    const l = live
      .filter((p) => p.sensor === sensor)
      .map((p) => ({
        x: p.pc1,
        y: p.pc2,
        kind: p.isAnomaly ? ("deviation" as const) : ("normal" as const),
      }));
    return { basePoints: b, livePoints: l };
  }, [baseline, live, sensor]);

  const current = livePoints[livePoints.length - 1];
  const deviating = current?.kind === "deviation";

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="space-y-1 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            Normal Behaviour Cloud
          </CardTitle>
          <div className="flex gap-1">
            {(["ADXL345", "INMP441"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSensor(s)}
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] tracking-wide transition-colors",
                  sensor === s
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "ADXL345" ? "Vibration" : "Acoustic"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          2D visualization of feature space — detection itself is Isolation Forest
        </p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-52 w-full">
          <ScatterChart margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
            <XAxis
              dataKey="x"
              type="number"
              domain={["dataMin - 1", "dataMax + 1"]}
              hide
            />
            <YAxis dataKey="y" type="number" domain={["dataMin - 1", "dataMax + 1"]} hide />
            <ZAxis range={[30, 30]} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Scatter
              name="Learned normal"
              data={basePoints}
              fill="var(--color-baseline)"
              fillOpacity={0.35}
              isAnimationActive={false}
            />
            <Scatter
              name={deviating ? "Deviation" : "Current"}
              data={livePoints.slice(-1)}
              fill={
                deviating ? "var(--color-deviation)" : "var(--color-normal)"
              }
              isAnimationActive={false}
            />
            <ChartLegend content={<ChartLegendContent />} />
          </ScatterChart>
        </ChartContainer>
        {deviating ? (
          <p className="mt-1 text-[11px] font-medium text-status-anomaly">
            Behaviour deviation — current sample has moved away from the normal
            cluster.
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Current sample sits inside the learned normal cluster.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
