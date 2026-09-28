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
 * ADXL345 — the small BLUE BOX bolted on the motor's top/front shoulder
 *           (on the finned deck, roughly a third of the way along from the
 *           fan end). Identified by geometry: a compact 97-triangle,
 *           box-like component ~59 × 27 × 19 mm centred at (0.337, 0.115,
 *           0.062) with its top face at y = 0.127 — raised just above the
 *           fin deck, so it reads as a bolted-on cube. Earlier values were
 *           both too far toward the fan end AND ~30 mm too high, so the
 *           marker hovered in mid-air near the terminal box. The anchor sits
 *           ~3 mm above the box's top face, i.e. resting on it.
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
  ADXL345: [0.337, 0.13, 0.062],
  INMP441: [-0.25, 0.135, -0.031],
};
