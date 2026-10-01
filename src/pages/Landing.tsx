/**
 * Landing — the EdgeSense scroll story.
 *
 * The page is one WebGL scene plus seven story sections. The scene is fixed and
 * occupies the whole viewport; the sections are transparent, and scrolling moves
 * a single scalar through `particle-states.ts`, which re-arranges the particle
 * field from the machine into signal streams, into a learned-normal volume, into
 * evidence streams, and back into the machine. The copy never fades a card in
 * and out — it arrives while the sculpture is already becoming something else.
 *
 * Two rules govern the composition, because a particle sculpture this large is
 * easy to ruin:
 *
 *  1. The copy column is always opposite the sculpture. Each keyframe declares
 *     which side it wants (`copy: "left" | "right"`), the renderer pushes the
 *     machine to the other side, and a scrim fades in on the copy side so text
 *     always has a dark bed without hiding the particles.
 *  2. Scroll state comes from the REAL layout. Section centres are measured from
 *     the DOM, and `stateFromSectionCentres` interpolates between them, so a
 *     centred section reads as exactly one state and the transition happens in
 *     the gap between two sections — where there is no copy to fight with.
 *
 * The machine data is real too: `MachineSignal` mirrors the one machine engine
 * into a ref, `START MACHINE` starts that engine, and the ADXL345/INMP441 waves
 * in the scene are driven by the live vibration and acoustic values. With the
 * motor off the sensors show WAITING FOR MACHINE and there is nothing to see,
 * because nothing is being faked.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { ArrowRight, Power } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useMachineContext } from "@/hooks/machine-context";
import { MachineSignal } from "@/components/edgesense/MachineSignal";
import { IntroSequence } from "@/components/edgesense/IntroSequence";
import { introSeen } from "@/components/edgesense/intro-session";
import { ParticleUniverse, type UniverseState } from "@/three/ParticleUniverse";
import {
  STATE_KEYFRAMES,
  stateFromSectionCentres,
} from "@/three/particle-states";
import type { QualityTier } from "@/three/particle-quality";

/** The story sections, in state order. */
interface StoryBeat {
  id: string;
  index: string;
  kicker: string;
  title: string;
  body: string;
}

const BEATS: StoryBeat[] = [
  {
    id: "top",
    index: "00",
    kicker: "THE ASSET",
    title: "It learns what normal means.",
    body: "Self-learning multimodal machine behaviour intelligence. Vibration and acoustic sensing on the edge, one learned baseline per machine, and a verdict that shows its evidence.",
  },
  {
    id: "machine",
    index: "01",
    kicker: "WHAT IT IS",
    title: "One machine, two senses.",
    body: "A motor, a pump, and the coupling between them. An ADXL345 accelerometer is bolted to the motor housing and reads three-axis vibration. An INMP441 microphone on the pump side listens for acoustic emission. Both are mounted on the machine you are looking at — nothing is inferred from a distance.",
  },
  {
    id: "signal",
    index: "02",
    kicker: "WHAT IT SEES",
    title: "Two senses, one pipeline.",
    body: "Every window of both channels is windowed, reduced to a compact feature vector, and compared against everything this machine has already shown while healthy. The field you are watching is the data doing exactly that.",
  },
  {
    id: "baseline",
    index: "03",
    kicker: "WHAT IT LEARNS",
    title: "One machine. One learned baseline.",
    body: "Normal is not configured, it is observed. EdgeSense trains an isolation forest on healthy running data alone — no labelled faults, no hand-tuned thresholds — and the envelope belongs to this specific asset.",
  },
  {
    id: "deviation",
    index: "04",
    kicker: "WHAT CHANGES",
    title: "Normal has an edge.",
    body: "As behaviour drifts, individual windows leave the learned envelope. That is the whole detection problem: not “is this broken”, but “is this further from normal than this machine has ever been”. Both sensors are judged separately, so a single drifting channel is never mistaken for a corroborated event.",
  },
  {
    id: "evidence",
    index: "05",
    kicker: "WHY IT FLAGGED",
    title: "See why it was flagged.",
    body: "Every verdict carries its evidence: which features moved, by how much, against what baseline, and whether both sensors independently agree. A corroborated deviation is a different thing from one sensor drifting alone.",
  },
  {
    id: "enter",
    index: "06",
    kicker: "WHAT NEXT",
    title: "Enter the command center.",
    body: "Start the machine, watch the sensors wake up, push it into load and anomaly — and see the whole intelligence pipeline respond live.",
  },
];

const PIPELINE = [
  ["VIBRATION + ACOUSTIC", "ADXL345 · INMP441"],
  ["FEATURE EXTRACTION", "RMS · kurtosis · peak"],
  ["FFT", "dominant frequency · spectral energy"],
  ["ISOLATION FOREST", "one forest per sensor"],
  ["SENSOR FUSION", "agreement matrix"],
  ["EXPLAINABLE DECISION", "evidence, not a label"],
] as const;

/* ------------------------------- chrome ---------------------------------- */

function Nav({ cta, onJump }: { cta: string; onJump: (id: string) => void }) {
  return (
    <nav className="fixed inset-x-0 top-0 z-30 flex items-center justify-between px-6 py-5 sm:px-12">
      <button
        type="button"
        onClick={() => onJump("top")}
        className="text-[13px] font-bold tracking-[0.34em] text-foreground"
      >
        EDGE<span className="text-primary">SENSE</span>
      </button>
      <div className="hidden items-center gap-8 text-[10px] tracking-[0.22em] text-muted-foreground md:flex">
        {[
          ["MACHINE", "machine"],
          ["SIGNAL PATH", "signal"],
          ["LEARNED NORMAL", "baseline"],
          ["EVIDENCE", "evidence"],
        ].map(([label, id]) => (
          <button
            key={id}
            type="button"
            onClick={() => onJump(id)}
            className="transition-colors hover:text-foreground"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-4">
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
          COMMAND CENTER
        </a>
      </div>
    </nav>
  );
}

/**
 * The state rail. It is the one piece of UI that tells the visitor the particle
 * system is a *machine* and not a background: seven named states, the current
 * one lit, and the current state's note underneath.
 */
function StateRail({
  active,
  onJump,
}: {
  active: number;
  onJump: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed right-6 top-1/2 z-20 hidden -translate-y-1/2 lg:block">
      <div className="pointer-events-auto flex flex-col gap-0">
        {STATE_KEYFRAMES.map((k, i) => {
          const on = i === active;
          return (
            <button
              key={k.id}
              type="button"
              onClick={() => onJump(BEATS[i]?.id ?? "top")}
              className="group flex items-center justify-end gap-3 py-[7px] pl-6 text-right"
            >
              <span
                className={`text-[9px] font-semibold tracking-[0.22em] transition-colors ${
                  on
                    ? "text-primary"
                    : "text-muted-foreground/45 group-hover:text-muted-foreground"
                }`}
              >
                {k.label}
              </span>
              <span
                className={`h-px transition-all duration-500 ${
                  on ? "w-8 bg-primary" : "w-3 bg-muted-foreground/40 group-hover:w-5"
                }`}
              />
            </button>
          );
        })}
      </div>
      <p className="mt-5 max-w-[220px] text-right text-[10px] leading-4 tracking-[0.14em] text-muted-foreground/45">
        {STATE_KEYFRAMES[active]?.note}
      </p>
    </div>
  );
}

/**
 * Live sensor readout. This reads the ONE machine engine, so whatever it shows
 * here is also what the dashboard, the waveforms and the anomaly scores show.
 */
function SensorHUD({
  stats,
}: {
  stats: { machine: number; space: number; tier: QualityTier; bloom: boolean } | null;
}) {
  const { machine } = useMachineContext();
  const running = machine.power !== "OFF";
  const vib = machine.vibrationRms;
  const aco = machine.acousticLevel;

  return (
    <div className="pointer-events-none fixed bottom-5 left-6 z-20 hidden sm:block">
      <div className="flex items-end gap-6">
        <div className="w-[124px]">
          <p className="label-tech text-sky-400/70">ADXL345 · VIBRATION</p>
          <p className="tnum mt-1.5 font-mono text-[15px] text-sky-200">
            {running ? vib.toFixed(3) : "—"}
            <span className="ml-1 text-[9px] text-muted-foreground/60">g rms</span>
          </p>
          <div className="mt-1.5 h-[2px] w-full bg-white/8">
            <div
              className="h-full bg-sky-400 transition-[width] duration-300"
              style={{ width: running ? `${Math.min(100, (vib / 1.6) * 100)}%` : "0%" }}
            />
          </div>
        </div>
        <div className="w-[124px]">
          <p className="label-tech text-orange-400/70">INMP441 · ACOUSTIC</p>
          <p className="tnum mt-1.5 font-mono text-[15px] text-orange-200">
            {running ? aco.toFixed(0) : "—"}
            <span className="ml-1 text-[9px] text-muted-foreground/60">dB</span>
          </p>
          <div className="mt-1.5 h-[2px] w-full bg-white/8">
            <div
              className="h-full bg-orange-400 transition-[width] duration-300"
              style={{ width: running ? `${Math.min(100, ((aco - 40) / 50) * 100)}%` : "0%" }}
            />
          </div>
        </div>
        <div className="w-[150px]">
          <p className="label-tech">
            {running ? `${machine.behaviour.replace("_", " ")} · ${machine.rpm.toFixed(0)} RPM` : "WAITING FOR MACHINE"}
          </p>
          {stats && (
            <p className="mt-1.5 text-[9px] leading-4 tracking-[0.14em] text-muted-foreground/40">
              {stats.machine.toLocaleString()} MACHINE POINTS ·{" "}
              {stats.space.toLocaleString()} SPACE · {stats.tier.toUpperCase()}
              {stats.bloom ? " · BLOOM" : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** The machine's own controls, so the landing page is connected to the product
 *  rather than describing it. Starts the real engine, which then carries into
 *  the command center. */
function MachineControl() {
  const { machine, startMotor, stopMotor, setBehaviour } = useMachineContext();
  const running = machine.power !== "OFF";
  const behaviour = machine.behaviour;

  return (
    <div className="mt-9 panel w-full max-w-[420px] p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="label-tech">MACHINE · {machine.power}</p>
          <p className="mt-1 text-[11px] tracking-[0.08em] text-muted-foreground">
            {running
              ? `running · ${machine.rpm.toFixed(0)} rpm`
              : "start it to wake the sensors"}
          </p>
        </div>
        <button
          type="button"
          onClick={running ? stopMotor : startMotor}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-[10px] font-bold tracking-[0.2em] transition-colors ${
            running
              ? "border border-border/70 text-muted-foreground hover:text-foreground"
              : "bg-primary text-primary-foreground shadow-[0_0_28px_rgba(56,189,248,0.25)] hover:shadow-[0_0_40px_rgba(56,189,248,0.4)]"
          }`}
        >
          <Power className="size-3" />
          {running ? "STOP" : "START MACHINE"}
        </button>
      </div>
      <div className="mt-3 flex gap-1.5 border-t border-border/40 pt-3">
        {(["NORMAL", "HEAVY_LOAD", "ANOMALY"] as const).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBehaviour(b)}
            className={`flex-1 rounded-sm px-2 py-1.5 text-[9px] font-semibold tracking-[0.18em] transition-colors ${
              behaviour === b && running
                ? b === "ANOMALY"
                  ? "bg-[color-mix(in_oklab,var(--status-anomaly)_22%,transparent)] text-[var(--status-anomaly)]"
                  : b === "HEAVY_LOAD"
                    ? "bg-[color-mix(in_oklab,var(--status-suspicious)_22%,transparent)] text-[var(--status-suspicious)]"
                    : "bg-[color-mix(in_oklab,var(--status-healthy)_22%,transparent)] text-[var(--status-healthy)]"
                : "text-muted-foreground/50 hover:text-muted-foreground"
            }`}
          >
            {b.replace("_", " ")}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------- sections -------------------------------- */

function Story({
  beat,
  side,
  register,
  children,
}: {
  beat: StoryBeat;
  side: "left" | "right";
  register: (id: string) => (el: HTMLElement | null) => void;
  children?: React.ReactNode;
}) {
  return (
    <section
      id={beat.id}
      ref={register(beat.id)}
      className="relative flex min-h-[88vh] items-center px-6 sm:px-12 lg:px-16"
    >
      <motion.div
        initial={{ opacity: 0, y: 22 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ margin: "-30% 0px -30% 0px" }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className={`w-full max-w-[430px] ${side === "right" ? "ml-auto" : ""}`}
      >
        <p className="label-tech text-primary/70">
          {beat.index} · {beat.kicker}
        </p>
        <h2 className="mt-4 text-[26px] font-bold leading-[1.12] tracking-tight text-foreground sm:text-[34px]">
          {beat.title}
        </h2>
        <p className="mt-5 text-[13px] leading-6 text-muted-foreground">{beat.body}</p>
        {children}
      </motion.div>
    </section>
  );
}

/* -------------------------------- page ----------------------------------- */

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const cta = isAuthenticated ? "/dashboard" : "/auth";

  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const centres = useRef<number[]>([]);

  /** the scroll-driven state scalar; the engine reads it per frame */
  const storyRef = useRef(0);
  /** the assembly ramp */
  const revealRef = useRef(0);
  /** the one machine engine, mirrored for the renderer */
  const stateRef = useRef<UniverseState | null>(null);

  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);
  const [stats, setStats] = useState<
    { machine: number; space: number; tier: QualityTier; bloom: boolean } | null
  >(null);

  /* the intro plays once per session; REPLAY INTRO forces it back on */
  const [introOpen, setIntroOpen] = useState(() => !introSeen());
  /** bumped by REPLAY INTRO so the sequence remounts from the top */
  const [introRun, setIntroRun] = useState(0);

  const { scrollY } = useScroll({ container: scrollRef });

  /* ---------------------- measure the real layout ---------------------- */
  const measure = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const base = container.getBoundingClientRect().top - container.scrollTop;
    centres.current = BEATS.map((b) => {
      const el = sectionRefs.current[b.id];
      if (!el) return 0;
      const top = el.getBoundingClientRect().top - base;
      return top + el.offsetHeight / 2;
    });
  }, []);

  useEffect(() => {
    measure();
    const container = scrollRef.current;
    const ro = new ResizeObserver(measure);
    if (container) ro.observe(container);
    window.addEventListener("resize", measure);
    // fonts and the first layout settle after mount; re-measure once more
    const id = window.setTimeout(measure, 600);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.clearTimeout(id);
    };
  }, [measure]);

  /* ------------------- scroll → the particle state machine ------------- */
  useMotionValueEvent(scrollY, "change", (y) => {
    const container = scrollRef.current;
    if (!container) return;
    const focus = y + container.clientHeight * 0.5;
    const s = stateFromSectionCentres(centres.current, focus);
    storyRef.current = s;
    const idx = Math.round(s);
    setActive((prev) => (prev === idx ? prev : idx));
  });

  /* --------------------------- assembly ramp -------------------------- */
  const startAssembly = useCallback((duration: number) => {
    const controls = animate(0, 1, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        revealRef.current = v;
      },
    });
    return () => controls.stop();
  }, []);

  useEffect(() => {
    // a returning visitor skips the film but still gets the reveal — nothing
    // should ever appear fully formed out of a page load
    if (introSeen()) return startAssembly(2.4);
    return;
  }, [startAssembly]);

  const onPortal = useCallback(() => {
    // the portal is open: the machine assembles out of the screen (§19)
    startAssembly(3.2);
  }, [startAssembly]);

  const onIntroDone = useCallback(() => setIntroOpen(false), []);

  const replayIntro = useCallback(() => {
    revealRef.current = 0;
    setIntroRun((n) => n + 1);
    setIntroOpen(true);
  }, []);

  /* ------------------------------ jumping ----------------------------- */
  const jumpTo = useCallback(
    (id: string) => {
      const container = scrollRef.current;
      const el = sectionRefs.current[id];
      if (!container || !el) return;
      const base = container.getBoundingClientRect().top - container.scrollTop;
      const top = el.getBoundingClientRect().top - base;
      container.scrollTo({
        top: Math.max(0, top - container.clientHeight * 0.06),
        behavior: "smooth",
      });
    },
    [],
  );

  const register = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      sectionRefs.current[id] = el;
    },
    [],
  );

  /** The one machine state, mirrored where the renderer can read it per frame. */
  const publishState = useCallback((next: UniverseState) => {
    stateRef.current = next;
  }, []);

  const copySide = STATE_KEYFRAMES[active]?.copy ?? "left";
  const beats = useMemo(() => BEATS, []);

  return (
    <div
      ref={scrollRef}
      className={`relative h-screen bg-[#02030a] ${
        introOpen ? "overflow-hidden" : "overflow-y-auto"
      }`}
    >
      {/* ------------------ the particle universe ------------------ */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <ParticleUniverse
          storyRef={storyRef}
          revealRef={revealRef}
          stateRef={stateRef}
          className="absolute inset-0"
          onReady={() => setReady(true)}
          onStats={setStats}
        />
        {/* readability scrims: one per side, cross-faded to the copy column of
            the current state so the sculpture is never washed over by text */}
        <div
          className={`absolute inset-y-0 left-0 hidden w-[58%] bg-gradient-to-r from-[#02030a] from-4% via-[#02030a]/88 via-32% to-transparent transition-opacity duration-700 lg:block ${
            copySide === "left" ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          className={`absolute inset-y-0 right-0 hidden w-[58%] bg-gradient-to-l from-[#02030a] from-4% via-[#02030a]/88 via-32% to-transparent transition-opacity duration-700 lg:block ${
            copySide === "right" ? "opacity-100" : "opacity-0"
          }`}
        />
        {/* portrait: the sculpture sits high and the copy owns the lower half */}
        <div className="absolute inset-x-0 bottom-0 h-[64%] bg-gradient-to-t from-[#02030a] via-[#02030a]/78 to-transparent lg:hidden" />
        <div className="hud-scanlines pointer-events-none absolute inset-0 opacity-25" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#02030a] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#02030a] to-transparent" />
      </div>

      <Nav cta={cta} onJump={jumpTo} />
      <StateRail active={active} onJump={jumpTo} />
      <SensorHUD stats={stats} />
      <MachineSignal onState={publishState} />

      {/* ------------------------------ copy ------------------------------ */}
      <div className="relative z-10">
        {/* hero */}
        <section
          id="top"
          ref={register("top")}
          className="relative flex min-h-screen items-center px-6 sm:px-12 lg:px-16"
        >
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, ease: "easeOut", delay: introOpen ? 0.6 : 0 }}
            className="w-full max-w-[440px]"
          >
            <h1 className="text-[54px] font-bold leading-[0.9] tracking-[-0.03em] sm:text-[72px]">
              EDGE
              <br />
              <span className="text-primary">SENSE</span>
            </h1>
            <p className="mt-6 text-[18px] leading-7 text-foreground/88">
              It learns what normal means.
            </p>
            <p className="mt-5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold tracking-[0.28em] text-muted-foreground/70">
              <span>MONITOR.</span>
              <span>LEARN.</span>
              <span>DETECT.</span>
              <span>EXPLAIN.</span>
            </p>

            <MachineControl />

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href={cta}
                className="group flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 text-[11px] font-bold tracking-[0.2em] text-primary-foreground shadow-[0_0_36px_rgba(56,189,248,0.28)] transition-all hover:shadow-[0_0_52px_rgba(56,189,248,0.42)]"
              >
                ENTER THE COMMAND CENTER
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </a>
              <button
                type="button"
                onClick={() => jumpTo("signal")}
                className="rounded-full border border-border/70 px-6 py-3.5 text-[11px] font-semibold tracking-[0.2em] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                EXPLORE THE SIGNAL PATH
              </button>
            </div>

            <p className="mt-10 text-[10px] leading-5 tracking-[0.22em] text-muted-foreground/45">
              MOVE THE CURSOR THROUGH IT — THE MACHINE REACTS.
              <br />
              SCROLL AND IT BECOMES THE STORY.
            </p>
          </motion.div>
        </section>

        <Story beat={beats[1]} side={STATE_KEYFRAMES[1].copy} register={register}>
          <div className="mt-8 space-y-3 border-t border-border/40 pt-5">
            {[
              ["ADXL345", "vibration", "bolted to the motor housing", "text-sky-400"],
              ["INMP441", "acoustic", "on the pump side, on a stem", "text-orange-400"],
            ].map(([name, kind, where, tone]) => (
              <div key={name} className="flex items-baseline gap-3">
                <span className={`text-[10px] font-bold tracking-[0.2em] ${tone}`}>{name}</span>
                <span className="text-[12px] leading-5 text-muted-foreground">
                  {kind} — {where}
                </span>
              </div>
            ))}
          </div>
        </Story>

        <Story beat={beats[2]} side={STATE_KEYFRAMES[2].copy} register={register}>
          <ol className="mt-8 border-t border-border/40">
            {PIPELINE.map(([step, detail], i) => (
              <li key={step} className="flex items-baseline gap-4 border-b border-border/40 py-2.5">
                <span className="tnum font-mono text-[10px] text-primary/70">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[12px] tracking-wide text-foreground/90">{step}</span>
                <span className="ml-auto text-right text-[10px] text-muted-foreground/55">
                  {detail}
                </span>
              </li>
            ))}
          </ol>
        </Story>

        <Story beat={beats[3]} side={STATE_KEYFRAMES[3].copy} register={register}>
          <div className="mt-8 grid grid-cols-2 gap-6">
            <div className="border-l border-primary/40 pl-4">
              <p className="label-tech">TRAINING DATA</p>
              <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
                Healthy operation only. Faults are never required to detect one.
              </p>
            </div>
            <div className="border-l border-orange-400/40 pl-4">
              <p className="label-tech">THE ENVELOPE</p>
              <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
                Belongs to this asset. Two identical machines do not share one.
              </p>
            </div>
          </div>
        </Story>

        <Story beat={beats[4]} side={STATE_KEYFRAMES[4].copy} register={register}>
          <div className="mt-8 flex items-center gap-6 border-t border-border/40 pt-5">
            <div>
              <p className="label-tech">INSIDE</p>
              <p className="mt-1 text-[12px] text-muted-foreground">healthy windows</p>
            </div>
            <div className="h-8 w-px bg-border/60" />
            <div>
              <p className="label-tech">OUTSIDE</p>
              <p className="mt-1 text-[12px] text-[var(--status-anomaly)]">the deviation trail</p>
            </div>
          </div>
        </Story>

        <Story beat={beats[5]} side={STATE_KEYFRAMES[5].copy} register={register}>
          <div className="mt-8 space-y-2.5 border-t border-border/40 pt-5">
            {[
              ["vibration + acoustic", "two independent verdicts"],
              ["feature deviation", "which features moved, and by how much"],
              ["sensor agreement", "does the other sense corroborate it"],
              ["fusion → explanation", "a decision with its evidence attached"],
            ].map(([a, b]) => (
              <div key={a} className="flex flex-col gap-0.5">
                <span className="text-[11px] font-semibold tracking-[0.14em] text-foreground/85">
                  {a.toUpperCase()}
                </span>
                <span className="text-[11px] leading-5 text-muted-foreground/70">{b}</span>
              </div>
            ))}
          </div>
        </Story>

        <section
          id="enter"
          ref={register("enter")}
          className="relative flex min-h-[88vh] items-center px-6 sm:px-12 lg:px-16"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ margin: "-30% 0px -30% 0px" }}
            transition={{ duration: 0.7 }}
            className="w-full max-w-[460px]"
          >
            <p className="label-tech text-primary/70">07 · THE MACHINE, RECONSTRUCTED</p>
            <h2 className="mt-4 text-[32px] font-bold leading-[1.08] tracking-tight sm:text-[44px]">
              Enter the command center.
            </h2>
            <p className="mt-5 max-w-[400px] text-[13px] leading-6 text-muted-foreground">
              Start the machine, watch the sensors wake up, push it into load and anomaly
              — and see the whole intelligence pipeline respond live. The machine you
              started here is the same one waiting on the other side.
            </p>
            <a
              href={cta}
              className="group mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-7 py-4 text-[11px] font-bold tracking-[0.2em] text-primary-foreground shadow-[0_0_36px_rgba(56,189,248,0.3)] transition-all hover:shadow-[0_0_52px_rgba(56,189,248,0.45)]"
            >
              ENTER THE COMMAND CENTER
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2">
              <p className="text-[10px] leading-5 tracking-[0.2em] text-muted-foreground/40">
                SIMULATED SENSOR STREAM UNTIL HARDWARE INTEGRATION
              </p>
              <button
                type="button"
                onClick={replayIntro}
                className="text-[10px] tracking-[0.2em] text-muted-foreground/40 underline decoration-dotted underline-offset-4 transition-colors hover:text-muted-foreground"
              >
                REPLAY INTRO
              </button>
            </div>
          </motion.div>
        </section>
      </div>

      {/* ------------------------ loading state ------------------------ */}
      {!ready && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[#02030a]">
          <p className="label-tech text-primary/70">INITIALIZING EDGE INTELLIGENCE</p>
          <div className="h-px w-56 overflow-hidden bg-white/10">
            <motion.div
              className="h-full w-1/3 bg-primary/80"
              animate={{ x: ["-100%", "320%"] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
          <p className="mt-2 text-[10px] tracking-[0.2em] text-muted-foreground/35">
            SAMPLING MACHINE SURFACE · BUILDING PARTICLE FIELD
          </p>
        </div>
      )}

      {/* --------------------------- the intro -------------------------- */}
      {introOpen && (
        <IntroSequence key={introRun} onPortal={onPortal} onDone={onIntroDone} />
      )}
    </div>
  );
}
