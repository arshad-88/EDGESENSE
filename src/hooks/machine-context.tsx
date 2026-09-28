/**
 * One machine. One simulation engine. One source of truth.
 *
 * ROOT-CAUSE FIX — the machine state used to live inside `useMachine()` called
 * by `ObservatoryShell`, and every page renders its own shell. So moving from
 * COMMAND → SIGNALS unmounted the shell, threw away the engine, reset
 * `power` to OFF and re-ran baseline training: START MOTOR appeared to have no
 * effect on the next page.
 *
 * `MachineLayout` is a routing *layout*: React keeps it mounted while the
 * child route swaps underneath it, so the engine (timer, audio, pipeline,
 * edge transmitter, waveform history) is created exactly once for a signed-in
 * session and every page reads the same live state through context.
 *
 * Mount it once, above the authenticated routes. Never call `useMachine()`
 * directly in a page.
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

/** Layout route element: keeps the engine alive across page navigation. */
export function MachineLayout() {
  return (
    <MachineProvider>
      <Outlet />
    </MachineProvider>
  );
}
