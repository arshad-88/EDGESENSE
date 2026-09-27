/**
 * Isolation Forest, implemented from scratch in TypeScript.
 *
 * Unsupervised anomaly detection: trees isolate samples by random splits;
 * anomalies isolate quickly (short path lengths). The score
 * s(x) = 2^(-E[h]/c(n)) maps path length to a [0, 1] scale where values near 1
 * are easiest to isolate (most anomalous) and near 0.5 are typical.
 *
 * Note: the raw score is NOT a probability. The dashboard shows a separately
 * normalized "anomaly indicator" and never labels the score as probability.
 */
import { makeRng } from "./rng";

const EPS = 1e-12;

interface TreeNode {
  leaf: boolean;
  /** Split feature index (internal nodes only). */
  feature: number;
  /** Split threshold (internal nodes only). */
  threshold: number;
  left: TreeNode | null;
  right: TreeNode | null;
  /** Node depth cap reached / subsample size at leaf. */
  size: number;
}

interface SerializedTree {
  root: SerializedNode;
}

interface SerializedNode {
  leaf: boolean;
  f: number;
  t: number;
  size: number;
  l: SerializedNode | null;
  r: SerializedNode | null;
}

/** Average search length for an unsuccessful BST lookup (Liu et al. 2008). */
function cFactor(n: number): number {
  if (n <= 1) return 1;
  const nMinus1 = n - 1;
  return (
    2 * (Math.log(nMinus1) + 0.5772156649) - (2 * nMinus1) / n
  );
}

class Tree {
  root: TreeNode;

  constructor(
    data: number[][],
    heightLimit: number,
    rng: () => number,
  ) {
    const indices = data.map((_, i) => i);
    this.root = Tree.build(data, indices, 0, heightLimit, rng);
  }

  private static build(
    data: number[][],
    indices: number[],
    depth: number,
    heightLimit: number,
    rng: () => number,
  ): TreeNode {
    if (indices.length <= 1 || depth >= heightLimit) {
      return { leaf: true, feature: -1, threshold: 0, left: null, right: null, size: indices.length };
    }

    // Pick a random feature that has more than one distinct value.
    const nFeatures = data[0].length;
    const candidates: number[] = [];
    for (let f = 0; f < nFeatures; f++) {
      let min = Infinity;
      let max = -Infinity;
      for (const i of indices) {
        const v = data[i][f];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (max - min > EPS) candidates.push(f);
    }
    if (candidates.length === 0) {
      return { leaf: true, feature: -1, threshold: 0, left: null, right: null, size: indices.length };
    }

    const feature = candidates[Math.floor(rng() * candidates.length)];
    let min = Infinity;
    let max = -Infinity;
    for (const i of indices) {
      const v = data[i][feature];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const threshold = min + rng() * (max - min);

    const leftIdx: number[] = [];
    const rightIdx: number[] = [];
    for (const i of indices) {
      if (data[i][feature] < threshold) leftIdx.push(i);
      else rightIdx.push(i);
    }

    // Degenerate split — treat as leaf.
    if (leftIdx.length === 0 || rightIdx.length === 0) {
      return { leaf: true, feature: -1, threshold: 0, left: null, right: null, size: indices.length };
    }

    return {
      leaf: false,
      feature,
      threshold,
      left: Tree.build(data, leftIdx, depth + 1, heightLimit, rng),
      right: Tree.build(data, rightIdx, depth + 1, heightLimit, rng),
      size: indices.length,
    };
  }

  /** Path length h(x): steps to reach a leaf (external nodes add c(size)). */
  pathLength(x: readonly number[]): number {
    let node = this.root;
    let depth = 0;
    while (!node.leaf) {
      node = x[node.feature] < node.threshold
        ? (node.left as TreeNode)
        : (node.right as TreeNode);
      depth++;
    }
    return depth + cFactor(node.size);
  }

  serialize(): SerializedTree {
    const ser = (node: TreeNode): SerializedNode => ({
      leaf: node.leaf,
      f: node.feature,
      t: node.threshold,
      size: node.size,
      l: node.left ? ser(node.left) : null,
      r: node.right ? ser(node.right) : null,
    });
    return { root: ser(this.root) };
  }

  static deserialize(tree: SerializedTree): Tree {
    const deser = (n: SerializedNode): TreeNode => ({
      leaf: n.leaf,
      feature: n.f,
      threshold: n.t,
      size: n.size,
      left: n.l ? deser(n.l) : null,
      right: n.r ? deser(n.r) : null,
    });
    const t = Object.create(Tree.prototype) as Tree;
    t.root = deser(tree.root);
    return t;
  }
}

export interface IsolationForestParams {
  /** Number of trees (default 100). */
  nTrees?: number;
  /** Subsample size per tree (default 256). */
  maxSamples?: number;
  seed?: number;
}

export class IsolationForest {
  private trees: Tree[] = [];
  private sampleSize = 256;
  private nTrees = 100;
  private cFactorTrain = 1;
  private trained = false;
  private trainFeatureCount = 0;

  get isTrained(): boolean {
    return this.trained;
  }

  fit(X: readonly number[][], params: IsolationForestParams = {}): this {
    if (X.length < 2) {
      throw new Error(
        `IsolationForest.fit: need at least 2 samples, got ${X.length}`,
      );
    }
    this.nTrees = params.nTrees ?? 100;
    this.sampleSize = Math.min(params.maxSamples ?? 256, X.length);
    this.trainFeatureCount = X[0].length;
    const rng = makeRng(params.seed ?? 42);
    const heightLimit = Math.ceil(Math.log2(Math.max(2, this.sampleSize)));

    this.trees = [];
    for (let t = 0; t < this.nTrees; t++) {
      // Subsample without replacement (partial Fisher–Yates).
      const all = X.map((_, i) => i);
      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = all[i];
        all[i] = all[j];
        all[j] = tmp;
      }
      const subIdx = all.slice(0, this.sampleSize);
      const sub = subIdx.map((i) => X[i]);
      this.trees.push(new Tree(sub, heightLimit, rng));
    }

    this.cFactorTrain = cFactor(this.sampleSize);
    this.trained = true;
    return this;
  }

  /**
   * Raw anomaly score for one sample.
   * s(x) = 2^(-E[h(x)] / c(n)); ≈0.5 typical, →1 highly anomalous, →0 very normal.
   */
  rawScore(x: readonly number[]): number {
    if (!this.trained) throw new Error("IsolationForest: not trained");
    if (x.length !== this.trainFeatureCount) {
      throw new Error(
        `IsolationForest: expected ${this.trainFeatureCount} features, got ${x.length}`,
      );
    }
    let sum = 0;
    for (const tree of this.trees) sum += tree.pathLength(x);
    const avg = sum / this.trees.length;
    return Math.pow(2, -avg / this.cFactorTrain);
  }

  /**
   * Normalized 0–1 anomaly indicator for display. Maps the raw score via a
   * piecewise stretch around the "typical" band so deviations are visible.
   * NOT a probability — see dashboard labels.
   */
  anomalyIndicator(raw: number): number {
    // Typical band [0.38, 0.62] compresses to [0, 0.35]; above stretches to 1.
    const lo = 0.38;
    const hi = 0.62;
    if (raw <= lo) return Math.max(0, (raw - 0.2) / (lo - 0.2)) * 0.35;
    if (raw >= hi) return 0.35 + Math.min(1, (raw - hi) / (0.95 - hi)) * 0.65;
    return ((raw - lo) / (hi - lo)) * 0.35;
  }

  serialize(): unknown {
    return {
      version: 1,
      nTrees: this.nTrees,
      sampleSize: this.sampleSize,
      cFactorTrain: this.cFactorTrain,
      featureCount: this.trainFeatureCount,
      trees: this.trees.map((t) => t.serialize()),
    };
  }

  static deserialize(data: unknown): IsolationForest {
    const obj = data as {
      version: number;
      nTrees: number;
      sampleSize: number;
      cFactorTrain: number;
      featureCount: number;
      trees: SerializedTree[];
    };
    const forest = Object.create(IsolationForest.prototype) as IsolationForest;
    forest.nTrees = obj.nTrees;
    forest.sampleSize = obj.sampleSize;
    forest.cFactorTrain = obj.cFactorTrain;
    forest.trainFeatureCount = obj.featureCount;
    forest.trees = obj.trees.map((t) => Tree.deserialize(t));
    forest.trained = true;
    return forest;
  }
}
