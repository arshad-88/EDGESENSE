/**
 * Where each sensor physically sits on the machine.
 *
 * ── How these were derived ─────────────────────────────────────────────
 * Earlier revisions of this file were wrong because they assumed the motor
 * occupied negative X. That assumption was never verified, and it was
 * backwards.
 *
 * These values come from *solving for the render camera*. The previous anchors
 * are placed by the app at known model coordinates, so their rendered pixels
 * are ground truth: fitting azimuth / distance / height / scale to two observed
 * marker positions reproduces them to within 0.001 of the image width
 * (rms 0.0008). That camera was then used to project every mesh component and
 * find which ones land where the sensors appear in the annotated screenshot.
 *
 * The fit settled the orientation definitively:
 *
 *     +X projects to screen LEFT  →  the MOTOR is at positive X
 *                                     the PUMP  is at negative X
 *                                     the yellow coupling guard sits at x ≈ 0.01
 *
 * ── The parts ──────────────────────────────────────────────────────────
 * ADXL345 — 3-axis accelerometer bolted on top of the motor housing. Screen
 *           position from the side-on view pins x = 0.372 exactly; the local
 *           surface there (z ≈ 0.075) tops out at y = 0.153, so the marker
 *           sits just above it. Sitting higher than this made the marker
 *           float above the box rather than on it.
 *
 * INMP441 — MEMS microphone on the pump side: a ~34 mm near-spherical head
 *           (sphericity 1.22) centred at (−0.250, 0.111, −0.031), top at
 *           y = 0.133, carried on a 26 × 63 mm stem below it. Projects to
 *           within 0.002 of the annotated position.
 *
 * Both sit on the TOP surface of the part each one names, so the marker reads
 * as a reticle on that component rather than floating near it.
 */
export type SensorId = "ADXL345" | "INMP441";

export const SENSOR_ANCHORS: Record<SensorId, [number, number, number]> = {
  ADXL345: [0.372, 0.156, 0.075],
  INMP441: [-0.25, 0.135, -0.031],
};
