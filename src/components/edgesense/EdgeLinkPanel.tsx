/**
 * Edge link inspector.
 *
 * Makes the adaptive transmission policy visible: what the edge decided to put
 * on the wire for each window, how much that saved against shipping the raw
 * waveform, and how full the link budget is. It also hosts the control for
 * erasing everything stored in the backend.
 */
import { useMutation } from "convex/react";
import { Eraser, Radio, TriangleAlert } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Panel, Tag } from "./Panel";
import type { DetailLevel, LinkLedger } from "@/core/edgesense";

const LEVEL_COLOR: Record<DetailLevel, string> = {
  silent: "bg-muted-foreground/25",
  summary: "bg-primary/70",
  features: "bg-status-suspicious/80",
  critical: "bg-status-anomaly",
};

const LEVEL_COPY: Record<DetailLevel, string> = {
  silent: "Window unchanged since the last transmission — dropped, nothing sent.",
  summary: "Indicators only. Link is busy or the change is marginal.",
  features: "Full feature vectors for both sensors. Link has headroom.",
  critical: "Features + evidence. Anomaly — never dropped, never summarised.",
};

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function EdgeLinkPanel({ link }: { link: LinkLedger | null }) {
  const purge = useMutation(api.events.purgeAll);

  const raw = link?.rawBytes ?? 0;
  const sent = link?.sentBytes ?? 0;
  const saving = sent > 0 && raw > sent ? Math.round(raw / sent) : 0;

  return (
    <Panel
      index="08"
      title="Adaptive edge link"
      hint="What actually leaves the device"
      actions={
        <>
          <Tag tone={link ? "primary" : "muted"}>
            {link ? (link.level === "silent" ? "HELD" : link.level.toUpperCase()) : "IDLE"}
          </Tag>
          <button
            onClick={() => void purge()}
            className="inline-flex items-center gap-1.5 rounded border border-border/60 px-1.5 py-0.5 text-[9px] tracking-widest text-muted-foreground transition-colors hover:border-status-anomaly/50 hover:text-status-anomaly"
            title="Erase every event and counter stored in the backend"
          >
            <Eraser className="size-3" />
            ERASE STORED DATA
          </button>
        </>
      }
    >
      {!link ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Radio className="size-5 text-muted-foreground/60" />
          <p className="text-xs text-muted-foreground">
            Start the machine to open the edge link.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[12px] leading-5 text-muted-foreground">
            Feature extraction runs on the device — the raw waveform never
            leaves it. The link then carries only what the edge judged worth
            sending.
          </p>

          <div className="grid gap-px overflow-hidden rounded border border-border/60 bg-border/40 sm:grid-cols-4">
            {[
              {
                k: saving > 0 ? `${saving}×` : "—",
                v: "less than raw stream",
                tone: "text-primary",
              },
              {
                k: String(link.transmitted),
                v: `packets sent / ${link.windows} windows`,
                tone: "text-foreground",
              },
              {
                k: String(link.suppressed),
                v: "windows dropped as redundant",
                tone: "text-foreground",
              },
              {
                k: `${Math.round(link.load * 100)}%`,
                v: "link budget used",
                tone:
                  link.load > 0.8
                    ? "text-status-anomaly"
                    : link.load > 0.5
                      ? "text-status-suspicious"
                      : "text-status-healthy",
              },
            ].map((s) => (
              <div key={s.v} className="bg-card/70 px-3 py-3">
                <p className={`tnum text-xl font-bold ${s.tone}`}>{s.k}</p>
                <p className="label-tech mt-1">{s.v}</p>
              </div>
            ))}
          </div>

          {/* Per-window transmission map, newest on the right. */}
          <div>
            <div className="flex items-baseline justify-between">
              <p className="label-tech">TRANSMISSION MAP</p>
              <p className="tnum text-[10px] text-muted-foreground">
                {bytes(sent)} of {bytes(raw)} raw
              </p>
            </div>
            <div className="mt-2 flex h-10 items-end gap-px overflow-hidden rounded border border-border/50 bg-background/40 p-1">
              {link.history.map((h, i) => (
                <span
                  key={`${h.timestamp}-${i}`}
                  title={`${h.level} · ${h.bytes} B · novelty ${h.novelty.toFixed(3)}`}
                  className={`flex-1 ${LEVEL_COLOR[h.level]}`}
                  style={{
                    height:
                      h.level === "silent"
                        ? "12%"
                        : `${Math.max(18, Math.min(100, (h.bytes / 700) * 100))}%`,
                  }}
                />
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[9px] tracking-widest text-muted-foreground">
              {(["silent", "summary", "features", "critical"] as DetailLevel[]).map(
                (l) => (
                  <span key={l} className="flex items-center gap-1.5">
                    <span className={`size-2 ${LEVEL_COLOR[l]}`} />
                    {l.toUpperCase()}
                  </span>
                ),
              )}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded border border-border/50 bg-background/40 px-3 py-2">
            {link.level === "critical" ? (
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-status-anomaly" />
            ) : (
              <Radio className="mt-0.5 size-3.5 shrink-0 text-primary" />
            )}
            <p className="text-[11px] leading-5 text-muted-foreground">
              {LEVEL_COPY[link.level]}
            </p>
          </div>
        </div>
      )}
    </Panel>
  );
}
