/**
 * Where each sensor physically sits on the machine.
 *
 * Every value here was MEASURED from `public/motor.glb` by decomposing the
 * mesh into its connected components, not chosen by eye. They are asserted
 * against the real geometry in `__tests__/sensor-anchors.test.ts`, so if an
 * anchor is ever moved onto a neighbouring part the test suite fails.
 *
 *   ADXL345 — 3-axis accelerometer, bolted to the top of the motor housing at
 *             the drive end (negative X). The motor's top deck there reaches
 *             y = 0.179, so the marker sits just clear of the casting rather
 *             than inside it.
 *   INMP441  — MEMS microphone: a ~14 x 15 x 11 mm spherical head centred at
 *             (0.131, 0.225, 0.086), carried on a thin 8 x 63 mm vertical
 *             post (0.121–0.129, 0.140–0.203, 0.073–0.081) that stands well
 *             above the pump deck, between the motor and the coupling guard.
 *
 * Kept in its own module (no React/three imports) so the test can import the
 * anchors without pulling in the whole scene.
 */
export type SensorId = "ADXL345" | "INMP441";

export const SENSOR_ANCHORS: Record<SensorId, [number, number, number]> = {
  ADXL345: [-0.420, 0.186, 0.0],
  INMP441: [0.131, 0.233, 0.086],
};
