import { motion } from "framer-motion";
import {
  ArrowRight,
  Activity,
  BrainCircuit,
  Gauge,
  Radar,
  Waves,
  FlaskConical,
  ScanSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" as const },
  }),
};

const FEATURES = [
  {
    icon: BrainCircuit,
    title: "Self-learning baseline",
    body: "Isolation Forests learn what normal looks like for your machine from healthy data alone — no labelled faults required.",
  },
  {
    icon: Radar,
    title: "Multimodal sensing",
    body: "Vibration and acoustic emission are analysed independently, then fused — so single-sensor surprises never become false alarms.",
  },
  {
    icon: ScanSearch,
    title: "Explainable alerts",
    body: "Every verdict ships with feature-level evidence: what changed, by how much, and whether the sensors agree.",
  },
  {
    icon: FlaskConical,
    title: "What-if simulator",
    body: "Drive the machine into imbalance, bearing disturbance or sensor disagreement and watch the full pipeline respond live.",
  },
] as const;

export default function Landing() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden border-b bg-grid">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background" />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center sm:px-6 sm:py-32">
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}>
            <Badge variant="outline" className="gap-1.5 border-primary/40 px-3 py-1 text-[11px] tracking-widest text-primary">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              EDGE-ASSISTED · MULTIMODAL · SELF-LEARNING
            </Badge>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={1}
            className="mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl"
          >
            EdgeSense
            <span className="mt-2 block text-xl font-medium text-muted-foreground sm:text-2xl">
              A self-learning edge-assisted multimodal system for machine
              behaviour anomaly detection
            </span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={2}
            className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground"
          >
            Vibration and acoustic sensors watch a running machine. EdgeSense
            learns its normal behaviour, flags deviations the moment they
            appear, and explains the evidence behind every alert — without ever
            pretending to know the exact fault.
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={3}
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            <Button size="lg" className="gap-2" asChild>
              <a href={isAuthenticated ? "/dashboard" : "/auth"}>
                Open the Observatory
                <ArrowRight className="size-4" />
              </a>
            </Button>
            <Button size="lg" variant="outline" className="gap-2" asChild>
              <a href="#pipeline">
                How it works
              </a>
            </Button>
          </motion.div>

          {/* Pipeline strip */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={4}
            id="pipeline"
            className="mt-16 flex w-full flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground"
          >
            {[
              { icon: Waves, label: "Sensors" },
              { icon: Activity, label: "Features + FFT" },
              { icon: BrainCircuit, label: "Isolation Forest" },
              { icon: Gauge, label: "Fusion" },
              { icon: ScanSearch, label: "Investigation" },
            ].map((step, i) => (
              <span key={step.label} className="flex items-center gap-2">
                {i > 0 ? <span className="text-border">→</span> : null}
                <span className="flex items-center gap-1.5 rounded-md border border-border/60 bg-card/70 px-2.5 py-1.5">
                  <step.icon className="size-3.5 text-primary" />
                  {step.label}
                </span>
              </span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <motion.h2
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          custom={0}
          className="text-center text-2xl font-bold tracking-tight sm:text-3xl"
        >
          Technical depth, not decoration
        </motion.h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-6 text-muted-foreground">
          Every visualization on the dashboard is driven by real computed
          features — no decorative charts.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              custom={i + 1}
              className="rounded-lg border border-border/60 bg-card/60 p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/15 text-primary">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-4 text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">
                {f.body}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Honesty note */}
      <section className="border-y bg-card/40">
        <div className="mx-auto max-w-4xl px-4 py-14 text-center sm:px-6">
          <motion.blockquote
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            custom={0}
            className="text-lg font-medium leading-8 sm:text-xl"
          >
            “Detects abnormal machine behaviour. Identifies deviations from
            learned normal behaviour. Provides explainable, feature-level
            evidence.”
          </motion.blockquote>
          <p className="mt-4 text-xs text-muted-foreground">
            Exact fault classification is future work requiring labelled fault
            data — EdgeSense won't claim otherwise.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto flex max-w-6xl flex-col items-center px-4 py-20 text-center sm:px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} custom={0}>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            See the machine drift. Watch the system notice.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
            Launch the demo, replay a failure scenario, or push the machine
            yourself with the what-if simulator.
          </p>
          <Button size="lg" className="mt-8 gap-2" asChild>
            <a href={isAuthenticated ? "/dashboard" : "/auth"}>
              {isAuthenticated ? "Return to the Observatory" : "Start exploring"}
              <ArrowRight className="size-4" />
            </a>
          </Button>
        </motion.div>
      </section>

      <footer className="border-t py-6 text-center text-[11px] text-muted-foreground">
        EdgeSense — Machine Behaviour Observatory · simulated sensor data until
        hardware integration
      </footer>
    </div>
  );
}
