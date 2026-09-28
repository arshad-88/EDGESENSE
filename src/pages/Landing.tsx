import { motion } from "framer-motion";
import {
  ArrowRight,
  AudioWaveform,
  BrainCircuit,
  CircuitBoard,
  ListTree,
  RadioTower,
  Radar,
  ScanSearch,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { SignalBackdrop } from "@/components/edgesense/SignalBackdrop";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.55, ease: "easeOut" as const },
  }),
};

/** The six stated capabilities — the spine of the whole product. */
const PILLARS = [
  {
    icon: Radar,
    title: "Machine-specific healthy baseline",
    body: "Every machine gets its own idea of normal. EdgeSense learns the baseline from healthy data on that exact asset, so the same reading means different things on different machines — and the baseline sharpens as it runs.",
  },
  {
    icon: AudioWaveform,
    title: "Multimodal vibration + acoustic sensing",
    body: "An ADXL345 accelerometer and an INMP441 microphone watch the same asset independently. Fusing them means a single sensor having a bad day can never raise an alarm on its own.",
  },
  {
    icon: BrainCircuit,
    title: "Self-learning anomaly detection",
    body: "Isolation Forests train on the healthy baseline and then score every window on how unusual it looks. No hand-tuned thresholds, and no retraining label set to maintain.",
  },
  {
    icon: RadioTower,
    title: "Adaptive edge-assisted transmission",
    body: "Edge-side feature extraction means raw high-rate waveforms never need to leave the machine. Only compact feature vectors and verdicts are sent, so link cost tracks events rather than sample rate.",
  },
  {
    icon: ScanSearch,
    title: "Deviations without exhaustive fault labels",
    body: "It does not need a catalogue of every known failure. It measures distance from learned normal behaviour, so it flags novel deviations too — the ones a label list would have missed.",
  },
  {
    icon: ListTree,
    title: "Explainable anomaly alerts",
    body: "Every verdict ships with feature-level evidence: which features moved, by how much, against what baseline, and whether both sensors independently agree. No black box.",
  },
] as const;

const PIPELINE = [
  { icon: CircuitBoard, label: "Edge extraction" },
  { icon: AudioWaveform, label: "Vibration + acoustic" },
  { icon: Activity, label: "Feature vectors" },
  { icon: BrainCircuit, label: "Isolation Forest" },
  { icon: Radar, label: "Baseline distance" },
  { icon: ListTree, label: "Fused verdict + evidence" },
] as const;

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const cta = isAuthenticated ? "/dashboard" : "/auth";

  return (
    <div className="min-h-screen bg-background">
      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden border-b border-border/60">
        <SignalBackdrop className="pointer-events-none absolute inset-0 h-full w-full" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/70 via-background/85 to-background" />

        <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={0}
            className="inline-flex items-center gap-2 rounded-full border border-primary/35 bg-primary/10 px-3 py-1.5"
          >
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            <span className="text-[10px] tracking-[0.2em] text-primary">
              EDGE-ASSISTED · MULTIMODAL · SELF-LEARNING
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={1}
            className="mt-7 max-w-4xl text-5xl font-bold leading-[0.95] tracking-tight sm:text-7xl"
          >
            It learns what
            <br />
            <span className="bg-gradient-to-r from-primary via-primary to-status-suspicious bg-clip-text text-transparent">
              normal
            </span>{" "}
            means.
            <span className="mt-4 block max-w-2xl text-base font-normal leading-7 tracking-normal text-muted-foreground sm:text-lg">
              EdgeSense watches a running machine through vibration and sound,
              teaches itself that machine&apos;s healthy behaviour, and explains
              every deviation it finds — without being handed a list of faults.
            </span>
          </motion.h1>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={2}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Button size="lg" className="gap-2" asChild>
              <a href={cta}>
                {isAuthenticated ? "Open the Observatory" : "Start the demo"}
                <ArrowRight className="size-4" />
              </a>
            </Button>
            <Button size="lg" variant="outline" className="gap-2" asChild>
              <a href="#capabilities">What it does</a>
            </Button>
          </motion.div>

          <motion.dl
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={3}
            className="mt-14 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/40 sm:grid-cols-4"
          >
            {[
              { k: "2", v: "sensing modalities" },
              { k: "0", v: "labelled faults needed" },
              { k: "1", v: "baseline per machine" },
              { k: "∞", v: "novel deviations" },
            ].map((s) => (
              <div key={s.v} className="bg-background/70 px-4 py-4">
                <dt className="label-tech">{s.v}</dt>
                <dd className="tnum mt-1.5 text-2xl font-bold text-primary">
                  {s.k}
                </dd>
              </div>
            ))}
          </motion.dl>
        </div>
      </section>

      {/* ================= SIX CAPABILITIES ================= */}
      <section id="capabilities" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          custom={0}
        >
          <p className="label-tech">CAPABILITIES</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            Six things that make it work
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            Each of these is implemented in the demo, not aspirational. Start
            the machine and you can watch every one of them respond.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border/60 bg-border/40 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p, i) => (
            <motion.article
              key={p.title}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              custom={i + 1}
              className="group relative bg-card/60 p-6 transition-colors hover:bg-card/90"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                  <p.icon className="size-4" />
                </div>
                <span className="label-tech tnum text-primary/60">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-4 text-[15px] font-semibold leading-snug">
                {p.title}
              </h3>
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                {p.body}
              </p>
            </motion.article>
          ))}
        </div>
      </section>

      {/* ================= PIPELINE ================= */}
      <section className="border-y border-border/60 bg-card/30">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <p className="label-tech text-center">SIGNAL PATH</p>
          <h2 className="mt-3 text-center text-2xl font-bold tracking-tight sm:text-3xl">
            From raw edge samples to an explained verdict
          </h2>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {PIPELINE.map((s, i) => (
              <motion.span
                key={s.label}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true }}
                custom={i}
                className="flex items-center gap-2"
              >
                {i > 0 && <span className="text-primary/40">→</span>}
                <span className="flex items-center gap-2 rounded-md border border-border/60 bg-background/70 px-3 py-2 text-[12px]">
                  <s.icon className="size-3.5 text-primary" />
                  {s.label}
                </span>
              </motion.span>
            ))}
          </div>
        </div>
      </section>

      {/* ================= HONESTY ================= */}
      <section className="mx-auto max-w-4xl px-5 py-20 sm:px-8">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          custom={0}
          className="panel rounded-lg p-8"
        >
          <span className="corner corner-tl" />
          <span className="corner corner-tr" />
          <span className="corner corner-bl" />
          <span className="corner corner-br" />
          <p className="label-tech">ON HONESTY</p>
          <p className="mt-4 text-lg leading-8 text-foreground/90">
            &ldquo;Detects abnormal machine behaviour. Identifies deviations
            from learned normal behaviour. Provides explainable,
            feature-level evidence.&rdquo;
          </p>
          <p className="mt-4 text-[13px] leading-6 text-muted-foreground">
            Naming the exact failing component is future work that needs
            labelled fault data. EdgeSense measures distance from normal and
            will not pretend otherwise — which is exactly why it can flag
            failures nobody thought to label.
          </p>
        </motion.div>
      </section>

      {/* ================= CTA ================= */}
      <section className="relative overflow-hidden border-t border-border/60">
        <SignalBackdrop className="pointer-events-none absolute inset-0 h-full w-full opacity-60" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/85 to-background" />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-5 py-24 text-center sm:px-8">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            custom={0}
          >
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              See it drift. Watch it notice.
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-sm leading-6 text-muted-foreground">
              Start the machine, run it healthy, then push it into imbalance,
              bearing disturbance or sensor disagreement and watch the whole
              pipeline respond live.
            </p>
            <Button size="lg" className="mt-9 gap-2" asChild>
              <a href={cta}>
                {isAuthenticated ? "Return to the Observatory" : "Launch the demo"}
                <ArrowRight className="size-4" />
              </a>
            </Button>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-7 text-center text-[11px] text-muted-foreground">
        EdgeSense — Machine Behaviour Observatory · simulated sensor data until
        hardware integration
      </footer>
    </div>
  );
}
