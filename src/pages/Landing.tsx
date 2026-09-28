/**
 * Landing — the EdgeSense particle universe.
 *
 * One fixed WebGL canvas holds the whole experience: a living field of data
 * particles that assembles into the real machine as you scroll. Sections are
 * minimal caption stations over the scene; scroll progress drives `revealRef`
 * which the particle engine consumes per-frame (no React re-renders).
 */
import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ParticleUniverse } from "@/three/ParticleUniverse";

/** Minimal transparent nav. */
function Nav({ cta }: { cta: string }) {
  const links = [
    ["Overview", "#s1"],
    ["Technology", "#s4"],
    ["Intelligence", "#s7"],
    ["Simulator", "/simulator"],
  ] as const;
  return (
    <nav className="fixed inset-x-0 top-0 z-30 flex items-center justify-between px-6 py-4 sm:px-10">
      <a href="/" className="text-[13px] font-bold tracking-[0.34em] text-foreground">
        EDGE<span className="text-primary">SENSE</span>
      </a>
      <div className="hidden items-center gap-8 text-[11px] tracking-[0.18em] text-muted-foreground md:flex">
        {links.map(([label, href]) => (
          <a key={label} href={href} className="transition-colors hover:text-foreground">
            {label.toUpperCase()}
          </a>
        ))}
      </div>
      <div className="flex items-center gap-4">
        <a href="/auth" className="text-[11px] tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground">
          SIGN IN
        </a>
        <a
          href={cta}
          className="rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-primary backdrop-blur transition-colors hover:bg-primary/20"
        >
          LAUNCH
        </a>
      </div>
    </nav>
  );
}

/** A minimal caption station. */
function Station({
  id,
  index,
  kicker,
  title,
  body,
  align = "left",
}: {
  id: string;
  index: string;
  kicker: string;
  title: string;
  body?: string;
  align?: "left" | "right";
}) {
  return (
    <section id={id} className="relative flex min-h-screen items-center px-6 sm:px-10">
      <motion.div
        initial={{ opacity: 0, y: 26 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ margin: "-30% 0px -30% 0px" }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className={`max-w-md ${align === "right" ? "ml-auto text-right" : ""}`}
      >
        <p className="label-tech text-primary/70">
          {index} · {kicker}
        </p>
        <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
          {title}
        </h2>
        {body ? (
          <p className="mt-4 text-[13px] leading-6 text-muted-foreground">{body}</p>
        ) : null}
      </motion.div>
    </section>
  );
}

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const cta = isAuthenticated ? "/dashboard" : "/auth";
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: scrollRef });

  // The machine assembles over the first half of the scroll, holds, and the
  // field energises as the story reaches sensing/intelligence.
  const revealRef = useRef(0);
  useScroll({ container: scrollRef }).scrollYProgress; // tracked
  useTransform(scrollYProgress, [0, 0.45], [0, 1]).on("change", (v) => {
    revealRef.current = v;
  });

  return (
    <div ref={scrollRef} className="relative h-screen overflow-y-auto bg-[#05070d]">
      {/* fixed particle environment behind everything */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_700px_at_50%_60%,#0a1020,#05070d_75%)]" />
        <ParticleUniverse revealRef={revealRef} className="absolute inset-0" />
        <div className="hud-scanlines pointer-events-none absolute inset-0 opacity-40" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#05070d] to-transparent" />
      </div>

      <Nav cta={cta} />

      <div className="relative z-10">
        {/* SECTION 1–2: particle universe + organizing */}
        <section id="s1" className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.4 }}
            className="pointer-events-none"
          >
            <p className="text-[11px] tracking-[0.4em] text-primary/80">
              SELF-LEARNING MULTIMODAL MACHINE BEHAVIOUR INTELLIGENCE
            </p>
            <h1 className="mt-6 text-6xl font-bold leading-[0.95] tracking-tight sm:text-8xl">
              EDGESENSE
            </h1>
            <p className="mt-5 text-lg text-muted-foreground sm:text-xl">
              It learns what normal means.
            </p>
            <div className="mt-10 flex items-center justify-center gap-3">
              <a
                href={cta}
                className="group flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-[12px] font-bold tracking-[0.18em] text-primary-foreground shadow-[0_0_36px_rgba(56,189,248,0.3)] transition-all hover:shadow-[0_0_48px_rgba(56,189,248,0.45)]"
              >
                ENTER EDGESENSE
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="#s3"
                className="rounded-full border border-border/70 px-6 py-3 text-[12px] font-semibold tracking-[0.18em] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                EXPLORE THE SYSTEM
              </a>
            </div>
            <p className="mt-16 animate-pulse text-[10px] tracking-[0.3em] text-muted-foreground/60">
              SCROLL — THE MACHINE ASSEMBLES FROM THE DATA
            </p>
          </motion.div>
        </section>

        <Station
          id="s2"
          index="01"
          kicker="THE DATA FIELD"
          title="Every particle is an observation."
          body="Vibration samples, acoustic frames, feature vectors — thousands of tiny measurements from a running machine, existing together in one live field."
        />
        <Station
          id="s3"
          index="02"
          kicker="EMERGENCE"
          title="The machine comes into focus."
          body="As the observations organise, the asset itself appears — the real motor, pump and coupling EdgeSense is watching. No icon, no illustration: the machine."
          align="right"
        />
        <Station
          id="s4"
          index="03"
          kicker="SENSING"
          title="Two senses on one machine."
          body="An ADXL345 accelerometer reads vibration. An INMP441 microphone listens to acoustics. Blue and orange signal threads leave their physical positions on the housing."
        />
        <Station
          id="s5"
          index="04"
          kicker="SIGNALS"
          title="Raw signals become features."
          body="Waveforms become RMS, variance, kurtosis, peak, dominant frequency, spectral energy — compact fingerprints of how the machine actually behaves right now."
          align="right"
        />
        <Station
          id="s6"
          index="05"
          kicker="LEARNING"
          title="Normal is learned, not configured."
          body="From healthy running data alone, an Isolation Forest learns this specific machine's behaviour envelope. No labelled faults. No hand-tuned thresholds."
        />
        <Station
          id="s7"
          index="06"
          kicker="INTELLIGENCE"
          title="The envelope knows where you are."
          body="Every new window lands inside the learned normal region, near its boundary — or outside it. Distance from normal is the whole story."
          align="right"
        />
        <Station
          id="s8"
          index="07"
          kicker="DEVIATION"
          title="An anomaly disturbs the field."
          body="When behaviour drifts outside the envelope, the field itself agitates — and a restrained, deliberate warning colour enters. Never an alarm wall."
        />
        <Station
          id="s9"
          index="08"
          kicker="EXPLANATION"
          title="Every verdict carries evidence."
          body="Which features moved, by how much, against what baseline, and whether both sensors independently agree. No black box — an investigation, not a siren."
        />

        {/* SECTION 10: CTA */}
        <section className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ margin: "-20%" }}
            transition={{ duration: 0.8 }}
          >
            <p className="label-tech text-primary/70">DATA → SENSING → NORMAL → DEVIATION → EXPLANATION</p>
            <h2 className="mt-6 max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
              Enter the command center.
            </h2>
            <p className="mx-auto mt-5 max-w-md text-sm leading-6 text-muted-foreground">
              Start the machine, watch the sensors wake up, push it into load and
              anomaly — and see the entire intelligence pipeline respond live.
            </p>
            <a
              href={cta}
              className="group mt-10 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-[12px] font-bold tracking-[0.2em] text-primary-foreground shadow-[0_0_36px_rgba(56,189,248,0.3)] transition-all hover:shadow-[0_0_52px_rgba(56,189,248,0.5)]"
            >
              ENTER THE COMMAND CENTER
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          </motion.div>
          <footer className="absolute inset-x-0 bottom-8 text-[10px] tracking-[0.25em] text-muted-foreground/60">
            EDGESENSE · SIMULATED SENSOR STREAM UNTIL HARDWARE INTEGRATION
          </footer>
        </section>
      </div>
    </div>
  );
}
