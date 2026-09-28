/**
 * ObservatoryShell — the signed-in product chrome, shared by the five pages
 * of the command center. Keeps the identity bar, the SIMULATION MODE badges
 * and a minimal section nav; pages themselves hold only their own content.
 *
 * Each page mounts its own `useMachine()` — the engine is deterministic and
 * cheap, and pages are visited one at a time, so this stays the single source
 * of truth without needing a global store.
 */
import { Link, useLocation, useNavigate } from "react-router";
import { LogOut, Waves, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useMachine } from "@/hooks/use-machine";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SECTIONS = [
  ["/dashboard", "COMMAND"],
  ["/signals", "SIGNALS"],
  ["/behaviour", "BEHAVIOUR"],
  ["/investigation", "INVESTIGATION"],
  ["/simulator", "SIMULATOR"],
] as const;


export function ObservatoryShell({
  children,
  running,
  anomalous,
}: {
  children: (api: ReturnType<typeof useMachine>) => React.ReactNode;
  running?: boolean;
  anomalous?: boolean;
}) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const api = useMachine();
  const isRunning = running ?? (api.machine.power === "ON" || api.machine.power === "STARTING");

  if (!api.baselineReady) {
    return (
      <main className="bg-observatory flex min-h-screen flex-col items-center justify-center gap-3">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Learning what normal looks like — training the isolation forest…
        </p>
      </main>
    );
  }

  return (
    <main className="bg-observatory min-h-screen pb-16">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded border border-primary/30 bg-primary/10 text-primary">
              <Waves className="size-4" />
            </div>
            <div className="leading-tight">
              <p className="text-[13px] font-bold tracking-[0.22em]">EDGESENSE</p>
              <p className="label-tech mt-0.5">Machine Behaviour Observatory</p>
            </div>
          </Link>

          <Badge variant="outline" className="px-1.5 py-0 text-[9px] tracking-widest text-primary">
            ● SIMULATION MODE
          </Badge>
          <Badge
            variant="outline"
            className="hidden px-1.5 py-0 text-[9px] tracking-widest text-muted-foreground sm:inline-flex"
          >
            SYNTHETIC SENSOR STREAM
          </Badge>

          <nav className="ml-auto hidden items-center gap-1 lg:flex">
            {SECTIONS.map(([href, label]) => (
              <Link
                key={href}
                to={href}
                className={cn(
                  "rounded px-3 py-1.5 text-[10px] font-semibold tracking-[0.16em] transition-colors",
                  location.pathname === href
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-card hover:text-foreground",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3 text-[11px] text-muted-foreground lg:ml-4">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  isRunning
                    ? anomalous || api.machine.fusedAnomalyScore > 0.7
                      ? "animate-pulse bg-status-anomaly"
                      : "animate-pulse bg-status-healthy"
                    : "bg-muted-foreground",
                )}
              />
              {isRunning ? "acquisition active" : "acquisition inactive"}
            </span>
            <button
              className="underline-offset-2 hover:text-foreground hover:underline"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
              aria-label="Sign out"
            >
              <LogOut className="inline size-3.5" />
            </button>
          </div>
        </div>
        {/* mobile section nav */}
        <nav className="flex gap-1 overflow-x-auto border-t border-border/40 px-4 py-1.5 lg:hidden">
          {SECTIONS.map(([href, label]) => (
            <Link
              key={href}
              to={href}
              className={cn(
                "whitespace-nowrap rounded px-3 py-1 text-[10px] font-semibold tracking-[0.14em]",
                location.pathname === href ? "bg-primary/15 text-primary" : "text-muted-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-[1560px] space-y-5 px-5 pt-5">{children(api)}</div>
    </main>
  );
}
