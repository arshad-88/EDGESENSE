/**
 * PCA for 2D projection of feature space — VISUALIZATION ONLY.
 *
 * EdgeSense's anomaly detection is Isolation Forest; PCA here merely lets the
 * dashboard draw "learned normal behaviour" vs "current behaviour" in 2D.
 * It performs no detection itself.
 */
import type { PcaModel } from "./types";
import { mean } from "./rng";

export type { PcaModel };

/**
 * Fit a 2-component PCA via covariance-matrix power iteration.
 * X: rows = samples, columns = features. Returns null if data is degenerate.
 */
export function fitPca(X: readonly number[][]): PcaModel | null {
  const n = X.length;
  if (n < 3) return null;
  const d = X[0].length;

  // Column means.
  const mu = new Array<number>(d).fill(0);
  for (const row of X) {
    for (let j = 0; j < d; j++) mu[j] += row[j];
  }
  for (let j = 0; j < d; j++) mu[j] /= n;

  // Centre the data.
  const C = X.map((row) => row.map((v, j) => v - mu[j]));

  // Covariance matrix (d × d).
  const cov: number[][] = Array.from({ length: d }, () => new Array<number>(d).fill(0));
  for (const row of C) {
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) cov[i][j] += row[i] * row[j];
    }
  }
  const denom = Math.max(1, n - 1);
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) cov[i][j] /= denom;
  }

  // Power iteration with deflation for the top-2 eigenvectors.
  const rng = () => Math.random();
  const components: number[][] = [];
  const explained: number[] = [];
  const work = cov.map((r) => [...r]);

  for (let comp = 0; comp < 2 && comp < d; comp++) {
    let v = new Array<number>(d).fill(0).map(() => rng());
    let lambda = 0;
    for (let iter = 0; iter < 128; iter++) {
      const w = new Array<number>(d).fill(0);
      for (let i = 0; i < d; i++) {
        let s = 0;
        for (let j = 0; j < d; j++) s += work[i][j] * v[j];
        w[i] = s;
      }
      let norm = 0;
      for (const x of w) norm += x * x;
      norm = Math.sqrt(norm);
      if (norm < 1e-12) break;
      v = w.map((x) => x / norm);
      lambda = norm;
    }
    components.push([...v]);
    explained.push(lambda);

    // Deflate: work -= lambda * v vᵀ
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) {
        work[i][j] -= lambda * v[i] * v[j];
      }
    }
  }

  if (components.length < 2) return null;
  return { mean: mu, components, explained };
}

/** Project a feature vector into the PCA 2D space. */
export function projectPca(model: PcaModel, x: readonly number[]): { pc1: number; pc2: number } {
  const c = x.map((v, j) => v - model.mean[j]);
  const pc1 = c.reduce((acc, v, j) => acc + v * model.components[0][j], 0);
  const pc2 = c.reduce((acc, v, j) => acc + v * model.components[1][j], 0);
  return { pc1, pc2 };
}
