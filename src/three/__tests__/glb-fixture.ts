/**
 * Shared GLB loader for the `src/three` test suites.
 *
 * Parses `public/motor.glb` straight from the binary (JSON chunk + BIN chunk)
 * so tests exercise the real shipped geometry rather than a fixture.
 *
 * NOTE: `accessor.byteOffset` is OPTIONAL in glTF — when absent it means 0.
 * Reading it as a bare number silently yields `NaN` and corrupts the buffer.
 * That bug is what produced the long-standing false belief that this model was
 * a single welded mesh; see the comment in split-motor.test.ts.
 */
import * as THREE from "three";
import * as fs from "node:fs";

export function loadGeometry(): THREE.BufferGeometry {
  const buf = fs.readFileSync("public/motor.glb");
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
  const binStart = 20 + jsonLen + 8;

  const read = (
    accessorIndex: number,
    Ctor: typeof Float32Array | typeof Uint32Array,
  ) => {
    const acc = json.accessors[accessorIndex];
    const view = json.bufferViews[acc.bufferView];
    return new Ctor(
      buf.buffer,
      buf.byteOffset + binStart + view.byteOffset + (acc.byteOffset ?? 0),
      acc.count * (Ctor === Float32Array ? 3 : 1),
    );
  };

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(read(1, Float32Array), 3));
  geo.setIndex(new THREE.BufferAttribute(read(0, Uint32Array), 1));
  return geo;
}

/** One welded-by-index piece of the mesh. */
export interface Piece {
  tris: number;
  min: THREE.Vector3;
  max: THREE.Vector3;
  centre: THREE.Vector3;
  size: THREE.Vector3;
}

/**
 * Decompose the mesh into its connected components (union-find over the index
 * buffer). The model is ~24k separate pieces, not one welded blob.
 */
export function loadPieces(): Piece[] {
  const geo = loadGeometry();
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const idx = geo.getIndex()!;
  const nv = pos.count;
  const triCount = idx.count / 3;

  const parent = new Int32Array(nv);
  for (let i = 0; i < nv; i++) parent[i] = i;
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const q = parent[x];
      parent[x] = r;
      x = q;
    }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let t = 0; t < triCount; t++) {
    union(idx.getX(t * 3), idx.getX(t * 3 + 1));
    union(idx.getX(t * 3 + 1), idx.getX(t * 3 + 2));
  }

  const acc = new Map<number, Piece & { sum: THREE.Vector3; count: number }>();
  const v = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    const root = find(idx.getX(t * 3));
    let piece = acc.get(root);
    if (!piece) {
      piece = {
        tris: 0,
        min: new THREE.Vector3(Infinity, Infinity, Infinity),
        max: new THREE.Vector3(-Infinity, -Infinity, -Infinity),
        centre: new THREE.Vector3(),
        size: new THREE.Vector3(),
        sum: new THREE.Vector3(),
        count: 0,
      };
      acc.set(root, piece);
    }
    piece.tris++;
    for (let k = 0; k < 3; k++) {
      const i = idx.getX(t * 3 + k);
      v.fromBufferAttribute(pos, i);
      piece.sum.add(v);
      piece.count++;
      piece.min.min(v);
      piece.max.max(v);
    }
  }

  return [...acc.values()].map((p) => {
    p.centre.copy(p.sum).divideScalar(p.count);
    p.size.subVectors(p.max, p.min);
    return p;
  });
}
