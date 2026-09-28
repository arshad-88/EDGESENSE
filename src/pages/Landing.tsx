/**
 * Landing — the EdgeSense particle universe.
 *
 * One fixed WebGL canvas holds the whole experience: an original EdgeSense
 * particle emblem that you can physically push around, that springs back
 * together when you let go, and that disperses into the machine as you scroll.
 * Scroll progress drives `revealRef`, which the engine reads per frame — the
 * scroll story costs zero React re-renders.
 *
 * Composition rule: the particle object lives in the right half of the screen
 * (centred on narrow viewports), and every block of copy is a left-aligned
 * column in the left half. Text and particles never sit on top of each other.
 */
import { useRef } from "react";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ParticleUniverse } from "@/three/ParticleUniverse";

/** Minimal transparent nav. */
function Nav({ cta }: { cta: string }) {
  const links = [
    ["SIGNAL PATH", "#signal-path"],
    ["LEARNED NORMAL", "#baseline"],
    ["EVIDENCE", "#flagged"],
  ] as const;
  return (
    <nav className="fixed inset-x-0 top-0 z-30 flex items-center justify-between px-6 py-5 sm:px-12">
      <a href="/" className="text-[13px] font-bold tracking-[0.34em] text-foreground">
        EDGE<span className="text-primary">SENSE</span>
      </a>
      <div className="hidden items-center gap-9 text-[10px] tracking-[0.22em] text-muted-foreground md:flex">
        {links.map(([label, href]) => (
          <a key={label} href={href} className="transition-colors hover:text-foreground">
            {label}
          </a>
        ))}
      </div>
      <div className="flex items-center gap-6">
        <a
          href="/auth"
          className="text-[10px] tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground"
        >
          SIGN IN
        </a>
        <a
          href={cta}
          className="rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-[10px] font-semibold tracking-[0.22em] text-primary backdrop-blur transition-colors hover:bg-primary/20"
        >
          LAUNCH
        </a>
      </div>
    </nav>
  );
}

/**
 * Copy block. Always the left column, always the same width, so the particle
 * object on the right is never covered.
 */
function Story({
  id,
  index,
  kicker,
  title,
  body,
  children,
}: {
  id?: string;
  index: string;
  kicker: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="relative flex min-h-screen items-center px-6 sm:px-12 lg:px-16"
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ margin: "-25% 0px -25% 0px" }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-[440px]"
      >
        <p className="label-tech text-primary/70">
          {index} · {kicker}
        </p>
        <h2 className="mt-5 text-[26px] font-bold leading-[1.15] tracking-tight text-foreground sm:text-[34px]">
          {title}
        </h2>
        <p className="mt-5 text-[13px] leading-6 text-muted-foreground">{body}</p>
        {children}
      </motion.div>
    </section>
  );
}

const PIPELINE = [
  "Vibration + sound",
  "Feature extraction",
  "Learned normal",
  "Anomaly detection",
  "Explainable decision",
];

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const cta = isAuthenticated ? "/dashboard" : "/auth";
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: scrollRef });

  // The emblem stays whole for the first viewport, dissolves through the story,
  // and has reformed as the machine by the closing section. Ref only — the
  // scroll never re-renders React.
  const revealRef = useRef(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    revealRef.current = Math.min(1, Math.max(0, (v - 0.14) / 0.66));
  });

  return (
    <div ref={scrollRef} className="relative h-screen overflow-y-auto bg-[#05070d]">
      {/* ---- the particle environment sits behind everything ---- */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(1250px_750px_at_62%_52%,#0a1122,#05070d_78%)]" />
        <ParticleUniverse revealRef={revealRef} className="absolute inset-0" />
        {/* Readability scrim: the copy column owns the left of the frame, so no
            particle — however far it is thrown by the cursor or the scroll —
            is ever allowed to wash over the text. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-[56%] bg-gradient-to-r from-[#05070d] from-5% via-[#05070d]/85 via-30% to-transparent" />
        <div className="hud-scanlines pointer-events-none absolute inset-0 opacity-30" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#05070d] to-transparent" />
      </div>

      <Nav cta={cta} />

      <div className="relative z-10">
        {/* ============ SECTION 1 · THE EMBLEM ============ */}
        <section className="relative flex min-h-screen items-start px-6 pt-32 sm:px-12 sm:pt-36 lg:items-center lg:px-16 lg:pt-0">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
            className="w-full max-w-[430px]"
          >
            <h1 className="text-[52px] font-bold leading-[0.92] tracking-[-0.02em] sm:text-[68px]">
              EDGE
              <br />
              <span className="text-primary">SENSE</span>
            </h1>
            <p className="mt-7 text-[17px] leading-7 text-foreground/85">
              It learns what normal means.
            </p>
            <p className="mt-4 max-w-[380px] text-[13px] leading-6 text-muted-foreground">
              Self-learning multimodal machine behaviour intelligence. Vibration and
              acoustic sensing on the edge, one learned baseline per machine, and a
              verdict that shows its evidence.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a
                href={cta}
                className="group flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 text-[11px] font-bold tracking-[0.2em] text-primary-foreground shadow-[0_0_36px_rgba(56,189,248,0.28)] transition-all hover:shadow-[0_0_52px_rgba(56,189,248,0.42)]"
              >
                ENTER EDGESENSE
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="#signal-path"
                className="rounded-full border border-border/70 px-6 py-3.5 text-[11px] font-semibold tracking-[0.2em] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                EXPLORE THE SYSTEM
              </a>
            </div>

            <p className="mt-14 text-[10px] leading-5 tracking-[0.22em] text-muted-foreground/55">
              MOVE THE CURSOR THROUGH THE MARK — IT SCATTERS AND REFORMS.
              <br />
              SCROLL TO RELEASE IT INTO THE MACHINE.
            </p>
          </motion.div>
        </section>

        {/* ============ SECTION 2 · WHAT IT SEES ============ */}
        <Story
          id="signal-path"
          index="01"
          kicker="WHAT DOES EDGESENSE SEE?"
          title="Two senses, one pipeline."
          body="An ADXL345 accelerometer reads vibration. An INMP441 microphone listens to acoustics. Both channels are windowed, reduced to a compact feature vector, and compared against everything this machine has already shown while healthy."
        >
          <ol className="mt-8 space-y-0 border-t border-border/40">
            {PIPELINE.map((step, i) => (
              <li
                key={step}
                className="flex items-baseline gap-4 border-b border-border/40 py-3"
              >
                <span className="tnum font-mono text-[10px] text-primary/70">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[13px] tracking-wide text-foreground/90">{step}</span>
              </li>
            ))}
          </ol>
        </Story>

        {/* ============ SECTION 3 · THE BASELINE ============ */}
        <Story
          id="baseline"
          index="02"
          kicker="LEARNED NORMAL"
          title="One machine. One learned baseline."
          body="Normal is not configured, it is observed. EdgeSense trains an isolation forest on healthy running data alone — no labelled faults, no hand-tuned thresholds — and the envelope belongs to this specific asset."
        >
          <div className="mt-8 grid grid-cols-2 gap-6">
            <div className="border-l border-primary/40 pl-4">
              <p className="label-tech">TRAINING DATA</p>
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                Healthy operation only. Faults are never required to detect one.
              </p>
            </div>
            <div className="border-l border-orange-400/40 pl-4">
              <p className="label-tech">EVERY WINDOW</p>
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                Lands inside the envelope, near its edge, or outside it.
              </p>
            </div>
          </div>
        </Story>

        {/* ============ SECTION 4 · THE EVIDENCE ============ */}
        <Story
          id="flagged"
          index="03"
          kicker="EXPLAINABLE DECISION"
          title="See why it was flagged."
          body="Every verdict carries its evidence: which features moved, by how much, against what baseline, and whether both sensors independently agree. A corroborated deviation is a different thing from one sensor drifting alone."
        >
          <div className="mt-8 space-y-3">
            {[
              ["ADXL345", "vibration features beyond the learned normal", "text-sky-400"],
              ["INMP441", "acoustic spectrum beyond the learned normal", "text-orange-400"],
              ["FUSION", "agreement matrix decides the final verdict", "text-primary"],
            ].map(([name, desc, tone]) => (
              <div key={name} className="flex items-baseline gap-3">
                <span className={`text-[10px] font-bold tracking-[0.2em] ${tone}`}>{name}</span>
                <span className="text-[12px] leading-5 text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </Story>

        {/* ============ SECTION 5 · ENTER ============ */}
        <section className="relative flex min-h-screen items-center px-6 sm:px-12 lg:px-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ margin: "-20%" }}
            transition={{ duration: 0.8 }}
            className="w-full max-w-[460px]"
          >
            <p className="label-tech text-primary/70">
              DATA → SENSING → NORMAL → DEVIATION → EXPLANATION
            </p>
            <h2 className="mt-5 text-[32px] font-bold leading-[1.1] tracking-tight sm:text-[44px]">
              Enter the command center.
            </h2>
            <p className="mt-5 max-w-[400px] text-[13px] leading-6 text-muted-foreground">
              Start the machine, watch the sensors wake up, push it into load and
              anomaly — and see the whole intelligence pipeline respond live.
            </p>
            <a
              href={cta}
              className="group mt-9 inline-flex items-center gap-2 rounded-full bg-primary px-7 py-4 text-[11px] font-bold tracking-[0.2em] text-primary-foreground shadow-[0_0_36px_rgba(56,189,248,0.3)] transition-all hover:shadow-[0_0_52px_rgba(56,189,248,0.45)]"
            >
              ENTER THE COMMAND CENTER
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <p className="mt-16 text-[10px] leading-5 tracking-[0.22em] text-muted-foreground/50">
              SIMULATED SENSOR STREAM UNTIL HARDWARE INTEGRATION
            </p>
          </motion.div>
        </section>
      </div>
    </div>
  );
}
