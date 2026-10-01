/**
 * MachineSignal — the bridge between the one machine engine and the renderer.
 *
 * There is exactly one source of machine state in this app (`MachineProvider`,
 * mounted above the router). It updates about four times a second, and it is
 * deliberately NOT pushed into props or React state anywhere near the particle
 * field: the field reads its own ref sixty times a second, and a React re-render
 * per tick would be both pointless and expensive.
 *
 * This component is the smallest possible adapter between the two. It consumes
 * the context, so IT re-renders four times a second (it renders nothing at all,
 * which costs nothing) and publishes the values outward through a callback the
 * caller owns. The heavy trees around it therefore stay completely out of the
 * machine context.
 *
 * The callback is published through a function rather than by handing this
 * component a ref to write into: mutating something you were given as a prop is
 * exactly the kind of aliasing that makes a component impossible to reason
 * about, and the caller's `useCallback` keeps the identity stable so the effect
 * only runs when the machine actually changes.
 */
import { useEffect } from "react";
import { useMachineContext } from "@/hooks/machine-context";
import type { UniverseState } from "@/three/ParticleUniverse";

export function MachineSignal({ onState }: { onState: (state: UniverseState) => void }) {
  const { machine } = useMachineContext();

  useEffect(() => {
    onState({
      power: machine.power,
      rpm: machine.rpm,
      vibrationRms: machine.vibrationRms,
      acousticLevel: machine.acousticLevel,
      fusedAnomalyScore: machine.fusedAnomalyScore,
      behaviour: machine.behaviour,
    });
  }, [
    onState,
    machine.power,
    machine.rpm,
    machine.vibrationRms,
    machine.acousticLevel,
    machine.fusedAnomalyScore,
    machine.behaviour,
  ]);

  return null;
}
