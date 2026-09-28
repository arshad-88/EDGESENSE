/**
 * The EdgeSense instrument panel.
 *
 * Every dashboard region is framed like a section of a technical drawing
 * sheet: hairline border, four registration corners, and an optional numbered
 * index. The dashboard previously stacked plain rounded cards with no
 * hierarchy, which made it read as a list of widgets rather than an
 * instrument.
 */
import type { ReactNode } from "react";

export interface PanelProps {
  /** Two-digit section index, e.g. "01". Omit for unnumbered panels. */
  index?: string;
  title?: string;
  /** Short line under the title — say what the panel is actually showing. */
  hint?: string;
  /** Right-hand header slot: live status, controls, legends. */
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function Panel({
  index,
  title,
  hint,
  actions,
  className = "",
  bodyClassName = "p-4",
  children,
}: PanelProps) {
  return (
    <section className={`panel rounded-lg ${className}`}>
      <span className="corner corner-tl" />
      <span className="corner corner-tr" />
      <span className="corner corner-bl" />
      <span className="corner corner-br" />

      {title && (
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/50 px-4 py-2.5">
          {index && (
            <span className="label-tech tnum text-primary/80">{index}</span>
          )}
          <h2 className="text-[13px] font-semibold tracking-wide">{title}</h2>
          {hint && (
            <span className="text-[11px] text-muted-foreground">{hint}</span>
          )}
          {actions && (
            <div className="ml-auto flex items-center gap-2">{actions}</div>
          )}
        </header>
      )}

      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Small uppercase tag used inside panel headers. */
export function Tag({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "primary" | "healthy" | "suspicious" | "anomaly";
}) {
  const cls = {
    muted: "border-border/60 text-muted-foreground",
    primary: "border-primary/40 text-primary",
    healthy: "border-status-healthy/40 text-status-healthy",
    suspicious: "border-status-suspicious/40 text-status-suspicious",
    anomaly: "border-status-anomaly/50 text-status-anomaly",
  }[tone];
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[9px] tracking-widest ${cls}`}
    >
      {children}
    </span>
  );
}
