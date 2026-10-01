/**
 * One machine. One simulation engine. One source of truth.
 *
 * ROOT-CAUSE FIX — the machine state used to live inside `useMachine()` called
 * by `ObservatoryShell`, and every page renders its own shell. So moving from
 * COMMAND → SIGNALS unmounted the shell, threw away the engine, reset
 * `power` to OFF and re-ran baseline training: START MOTOR appeared to have no
 * effect on the next page.
 *
 * The provider is mounted ONCE, at the root of the app (above the router — see
 * `main.tsx`), so the public landing page, the auth screen and every signed-in
 * page share one engine. That is what lets a visitor start the machine on the
 * landing page and find it already running in the command center, and it is why
 * the landing page's sensor waves show live values instead of invented ones.
 *
 * `MachineLayout` remains as the layout route for the authenticated group: it
 * asserts the provider is above it and renders the outlet. It deliberately does
 * NOT create a second provider — a nested provider would build a second engine,
 * which is the exact bug this file exists to prevent.
 *
 * Never call `useMachine()` directly in a page; read it through
 * `useMachineContext()`, and mirror it into a ref for high-frequency consumers
 * with `<MachineSignal />` rather than subscribing a heavy tree to 4 Hz updates.
 */
import { createContext, useContext, type ReactNode } from "react";
import { Outlet } from "react-router";
import { useMachine, type UseMachineApi } from "./use-machine";

const MachineContext = createContext<UseMachineApi | null>(null);

export function MachineProvider({ children }: { children: ReactNode }) {
  const api = useMachine();
  return <MachineContext.Provider value={api}>{children}</MachineContext.Provider>;
}

/** The single live machine api. Throws outside the provider rather than
 *  silently starting a second engine. */
export function useMachineContext(): UseMachineApi {
  const ctx = useContext(MachineContext);
  if (!ctx) {
    throw new Error("useMachineContext must be used inside <MachineProvider> (see MachineLayout)");
  }
  return ctx;
}

/** Layout route element for the authenticated group. The single provider lives
 *  above the router, so this only needs to render the child route — but it still
 *  asserts the provider exists, turning a wiring mistake into an immediate,
 *  explicit error instead of a silently missing engine. */
export function MachineLayout() {
  useMachineContext();
  return <Outlet />;
}
