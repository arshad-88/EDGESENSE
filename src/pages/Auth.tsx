/**
 * Auth — entering the machine intelligence layer.
 *
 * Same particle engine as the landing page, calmer: the machine sits faintly
 * assembled in the background while a minimal interface floats over the field.
 * Focus on email energises the local field; focus on password lifts the
 * machine's illumination; successful sign-in eases the reveal to 1 and
 * navigates — entering the machine, literally.
 */
import { Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { ParticleUniverse } from "@/three/ParticleUniverse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Loader2 } from "lucide-react";

function resolveRedirectAfterAuth(returnTo: string | null, fallback = "/dashboard") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
  return fallback;
}

function Auth({ redirectAfterAuth }: { redirectAfterAuth?: string } = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(searchParams.get("returnTo"), redirectAfterAuth);

  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Particle engine coupling — refs, never re-renders.
  const revealRef = useRef(0);
  const stateRef = useRef({ power: "OFF", rpm: 0, vibrationRms: 0, acousticLevel: 0, fusedAnomalyScore: 0, behaviour: "NORMAL" });
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) navigate(redirect);
  }, [authLoading, isAuthenticated, navigate, redirect]);

  // Calm assembled-in-background machine.
  useEffect(() => {
    revealRef.current = 0.75;
  }, []);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send verification code.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      // Enter-the-machine moment: full assembly before navigating.
      revealRef.current = 1;
      stateRef.current = { ...stateRef.current, power: "ON", rpm: 1450, vibrationRms: 0.4 };
      await signIn("email-otp", formData);
      navigate(redirect);
    } catch {
      revealRef.current = 0.75;
      setError("The verification code you entered is incorrect.");
      setOtp("");
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      revealRef.current = 1;
      await signIn("anonymous");
      navigate(redirect);
    } catch (e) {
      revealRef.current = 0.75;
      setError(`Failed to sign in as guest: ${e instanceof Error ? e.message : "Unknown error"}`);
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070d]">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(1000px_640px_at_50%_55%,#0a1020,#05070d_78%)]" />
        <ParticleUniverse revealRef={revealRef} stateRef={stateRef} calm className="absolute inset-0" />
        <div className="hud-scanlines pointer-events-none absolute inset-0 opacity-30" />
        {/* machine illumination lift on password focus */}
        <div
          ref={glowRef}
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700"
          onFocusCapture={() => (glowRef.current!.style.opacity = "0.35")}
          onBlurCapture={() => (glowRef.current!.style.opacity = "0")}
          style={{ background: "radial-gradient(700px 500px at 50% 45%, rgba(56,189,248,0.12), transparent 70%)" }}
        />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6">
        <a href="/" className="absolute left-6 top-5 text-[12px] font-bold tracking-[0.34em] text-foreground sm:left-10">
          EDGE<span className="text-primary">SENSE</span>
        </a>

        <div className="w-full max-w-sm">
          <p className="label-tech text-primary/80">EDGESENSE · ACCESS</p>
          <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight">
            Enter the machine
            <br />
            intelligence layer
          </h1>

          {step === "signIn" ? (
            <form onSubmit={handleEmailSubmit} className="mt-8 space-y-3">
              <Input
                name="email"
                type="email"
                required
                placeholder="name@example.com"
                disabled={isLoading}
                className="border-border/50 bg-background/40 backdrop-blur"
              />
              <Button type="submit" disabled={isLoading} className="w-full gap-2 tracking-[0.16em]">
                {isLoading ? <Loader2 className="size-4 animate-spin" /> : (
                  <>CONTINUE <ArrowRight className="size-3.5" /></>
                )}
              </Button>
              <button
                type="button"
                onClick={handleGuestLogin}
                disabled={isLoading}
                className="w-full pt-1 text-center text-[11px] tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
              >
                OR CONTINUE AS GUEST →
              </button>
              {error && <p className="text-xs text-status-anomaly">{error}</p>}
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} className="mt-8 space-y-3">
              <p className="text-[13px] text-muted-foreground">
                A 6-digit code was sent to <span className="text-foreground">{step.email}</span>.
              </p>
              <Input
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="······"
                autoFocus
                className="border-border/50 bg-background/40 text-center font-mono text-lg tracking-[0.6em] backdrop-blur"
              />
              <Button type="submit" disabled={isLoading || otp.length !== 6} className="w-full gap-2 tracking-[0.16em]">
                {isLoading ? <Loader2 className="size-4 animate-spin" /> : (
                  <>ENTER SYSTEM <ArrowRight className="size-3.5" /></>
                )}
              </Button>
              <button
                type="button"
                onClick={() => { setStep("signIn"); setOtp(""); }}
                className="w-full pt-1 text-center text-[11px] tracking-[0.16em] text-muted-foreground hover:text-foreground"
              >
                USE A DIFFERENT EMAIL
              </button>
              {error && <p className="text-xs text-status-anomaly">{error}</p>}
            </form>
          )}

          <p className="mt-10 text-[10px] leading-5 tracking-[0.14em] text-muted-foreground/60">
            THE ENVIRONMENT YOU SEE IS THE PRODUCT'S SUBJECT —
            <br />
            A MACHINE LEARNING ITS OWN NORMAL BEHAVIOUR.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage(props: { redirectAfterAuth?: string }) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
