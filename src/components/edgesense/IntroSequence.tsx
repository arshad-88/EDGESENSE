/**
 * IntroSequence — the cinematic opening, and the transition into the particle
 * world.
 *
 * The video is the real one (`public/EDGESENSE_VIDEO.mp4`), full-screen, cover,
 * with no browser chrome of any kind. What matters is not the video itself but
 * how it hands over:
 *
 *   1. PLAYING   the film runs, full-bleed.
 *   2. PORTAL    (~1.1 s) the frame pushes toward the laptop screen — the image
 *                scales up about the screen's position while a radial scrim
 *                darkens everything around it, so attention funnels into the
 *                display. A soft rectangle marks the screen edge and brightens.
 *   3. CLOSING   (~1.4 s) the screen rectangle expands past the laptop and out
 *                to the viewport while the video fades over it, revealing the
 *                particle field that has been assembling underneath the whole
 *                time.
 *
 * That last point is the whole trick: the WebGL canvas is already mounted and
 * already assembling beneath this overlay, and `onPortal` starts the particle
 * assembly exactly when the portal opens. There is no route change, no black
 * frame and no blank state — the laptop screen simply keeps expanding until it
 * *is* the page.
 *
 * The timing is derived from the video's own duration (the portal opens a couple
 * of seconds before the end, which is where the laptop appears), so replacing
 * the video with a different cut still hands over at approximately the right
 * moment. Reduced motion drops the push and cross-fades instead.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { markIntroSeen } from "./intro-session";

/** Where the laptop screen sits in the film, as a fraction of the frame. */
const SCREEN_X = "50%";
const SCREEN_Y = "56%";

/** How long before the end of the video the portal begins to open. */
const PORTAL_LEAD = 2.9;
const PORTAL_MS = 1150;
const CLOSING_MS = 1400;

type Phase = "loading" | "playing" | "portal" | "closing";

export interface IntroSequenceProps {
  /** The portal is open: start assembling the particle machine underneath. */
  onPortal: () => void;
  /** The intro is gone: drop the overlay and unlock the page. */
  onDone: () => void;
}

export function IntroSequence({ onPortal, onDone }: IntroSequenceProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [sound, setSound] = useState(false);
  // a lazy initial state, not a ref: this is read during render and never
  // changes, which is exactly what state is for
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  const timers = useRef<number[]>([]);
  /** The video ending, a SKIP and a media error can all race; first one wins. */
  const started = useRef(false);

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);

  /**
   * Open the portal and schedule the handover. `fast` is the skip path: the
   * film stops immediately and the screen expands straight away, which reads as
   * a cut rather than as a broken transition.
   */
  const enterPortal = useCallback(
    (fast: boolean) => {
      if (started.current) return;
      started.current = true;
      if (fast) videoRef.current?.pause();
      // the particle machine starts assembling the instant the portal opens,
      // so it is already emerging behind the expanding screen
      onPortal();
      if (fast) {
        setPhase("closing");
        timers.current.push(
          window.setTimeout(() => {
            markIntroSeen();
            onDone();
          }, 900),
        );
        return;
      }
      setPhase("portal");
      timers.current.push(window.setTimeout(() => setPhase("closing"), PORTAL_MS));
      timers.current.push(
        window.setTimeout(() => {
          markIntroSeen();
          onDone();
        }, PORTAL_MS + CLOSING_MS),
      );
    },
    [onDone, onPortal],
  );

  useEffect(() => clearTimers, [clearTimers]);

  /* Nothing should ever leave the visitor staring at a black rectangle: if the
   * video cannot play at all, go straight to the particle world. */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const play = () => {
      v.play().catch(() => {
        // autoplay blocked (or an unsupported file): skip the film, keep the site
        enterPortal(true);
      });
    };
    if (v.readyState >= 2) play();
    return () => {
      v.pause();
    };
  }, [enterPortal]);

  const onTime = () => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
    if (v.duration - v.currentTime <= PORTAL_LEAD) enterPortal(false);
  };

  const push = reduced ? { scale: 1.06 } : { scale: 1.55 };
  const closing = reduced ? { scale: 1.1, opacity: 0 } : { scale: 3.6, opacity: 0 };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#02030a]">
      {/* ---- the film ---- */}
      <motion.div
        className="absolute inset-0"
        style={{ originX: SCREEN_X, originY: SCREEN_Y }}
        animate={
          phase === "closing" ? closing : phase === "portal" ? push : { scale: 1, opacity: 1 }
        }
        transition={{
          duration: phase === "closing" ? CLOSING_MS / 1000 : PORTAL_MS / 1000,
          ease: phase === "closing" ? [0.4, 0, 0.9, 1] : [0.3, 0, 0.5, 1],
        }}
      >
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          src="/EDGESENSE_VIDEO.mp4"
          autoPlay
          muted={!sound}
          playsInline
          preload="auto"
          onCanPlay={() => setPhase((p) => (p === "loading" ? "playing" : p))}
          onTimeUpdate={onTime}
          onEnded={() => enterPortal(false)}
          onError={() => enterPortal(true)}
        />
      </motion.div>

      {/* ---- the darkening that funnels attention into the screen ---- */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(44% 36% at ${SCREEN_X} ${SCREEN_Y}, rgba(2,3,10,0) 0%, rgba(2,3,10,0.62) 58%, rgba(2,3,10,0.98) 100%)`,
        }}
        animate={{ opacity: phase === "portal" || phase === "closing" ? 1 : 0 }}
        transition={{ duration: 0.9, ease: "easeInOut" }}
      />

      {/* ---- the laptop screen: marked, then expanded until it is the page ---- */}
      <motion.div
        className="pointer-events-none absolute rounded-[10px]"
        style={{
          left: "29%",
          top: "38%",
          width: "42%",
          height: "36%",
          boxShadow: "0 0 60px 12px rgba(56,189,248,0.28), inset 0 0 40px rgba(56,189,248,0.18)",
          border: "1px solid rgba(125,211,252,0.55)",
        }}
        animate={
          phase === "closing"
            ? {
                left: "-10%",
                top: "-10%",
                width: "120%",
                height: "120%",
                opacity: 0,
                borderRadius: 0,
              }
            : phase === "portal"
              ? { opacity: 1 }
              : { opacity: 0 }
        }
        transition={{
          duration: phase === "closing" ? CLOSING_MS / 1000 : 0.9,
          ease: "easeInOut",
        }}
      />

      {/* ---- the flash of the screen taking over ---- */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 45% at 50% 56%, rgba(120,190,255,0.34), rgba(2,3,10,0) 70%)",
        }}
        animate={
          phase === "closing"
            ? { opacity: [0, 0.85, 0] }
            : { opacity: phase === "portal" ? 0.25 : 0 }
        }
        transition={{ duration: phase === "closing" ? CLOSING_MS / 1000 : 0.9 }}
      />

      {/* ---- controls: always skippable ---- */}
      {phase !== "closing" && (
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between px-6 pb-6 sm:px-10">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold tracking-[0.34em] text-sky-200/70">
              EDGE<span className="text-sky-400">SENSE</span>
            </span>
            {phase === "loading" ? (
              <span className="label-tech text-sky-200/45">INITIALIZING EDGE INTELLIGENCE</span>
            ) : (
              <span className="label-tech text-sky-200/35">REAL INDUSTRIAL WORLD · 00:00</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSound((s) => {
                  const next = !s;
                  const v = videoRef.current;
                  if (v) {
                    v.muted = !next;
                    if (next) void v.play().catch(() => undefined);
                  }
                  return next;
                });
              }}
              className="rounded-full border border-white/15 bg-black/40 px-3.5 py-1.5 text-[10px] font-semibold tracking-[0.24em] text-white/60 backdrop-blur transition-colors hover:border-white/35 hover:text-white/90"
            >
              {sound ? "AUDIO ON" : "AUDIO OFF"}
            </button>
            <button
              type="button"
              onClick={() => enterPortal(true)}
              className="rounded-full border border-sky-300/30 bg-sky-400/10 px-4 py-1.5 text-[10px] font-bold tracking-[0.24em] text-sky-200 backdrop-blur transition-colors hover:bg-sky-400/20"
            >
              SKIP INTRO
            </button>
          </div>
        </div>
      )}

      {/* ---- loading state: never a naked spinner ---- */}
      {phase === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#02030a]/70">
          <p className="label-tech text-sky-200/70">INITIALIZING EDGE INTELLIGENCE</p>
          <div className="h-px w-56 overflow-hidden bg-white/10">
            <motion.div
              className="h-full w-1/3 bg-sky-400/80"
              animate={{ x: ["-100%", "320%"] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
