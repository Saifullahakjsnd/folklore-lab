// Every statistic and verdict in Folklore Lab comes from this file. Pure functions, no
// dependencies, seeded randomness. Semantics follow the R functions named in the locks;
// test/fixtures/stats.json holds reference values from SciPy / statsmodels / NumPy.

// ---------- special functions ----------

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
]

/** log Gamma(x) for x > 0 (Lanczos, g = 7). */
export function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x)
  const z = x - 1
  let a = LANCZOS[0]!
  const t = z + 7.5
  for (let i = 1; i < 9; i++) a += LANCZOS[i]! / (z + i)
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a)
}

const logChoose = (n: number, k: number) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1)

/** Complementary error function, ~1e-14 relative accuracy. */
export function erfc(x: number): number {
  if (x < 0) return 2 - erfc(-x)
  if (x < 2) {
    // erf(x) = 2/sqrt(pi) * exp(-x^2) * sum 2^n x^(2n+1) / (1*3*...*(2n+1)); all terms positive.
    let term = x
    let sum = x
    for (let n = 1; n < 200 && term > sum * 1e-17; n++) {
      term *= (2 * x * x) / (2 * n + 1)
      sum += term
    }
    return 1 - (2 / Math.sqrt(Math.PI)) * Math.exp(-x * x) * sum
  }
  // Continued fraction erfc(x) = exp(-x^2)/sqrt(pi) * 1/(x + (1/2)/(x + 1/(x + (3/2)/(x + ...)))), modified Lentz.
  const tiny = 1e-300
  let f = x
  let c = x
  let d = 0
  for (let n = 1; n < 500; n++) {
    const an = n / 2
    d = x + an * d
    d = Math.abs(d) < tiny ? tiny : d
    c = x + an / c
    c = Math.abs(c) < tiny ? tiny : c
    d = 1 / d
    const delta = c * d
    f *= delta
    if (Math.abs(delta - 1) < 1e-16) break
  }
  return Math.exp(-x * x) / Math.sqrt(Math.PI) / f
}

/** Upper tail of the standard normal, P(Z > z). */
export const normSf = (z: number) => 0.5 * erfc(z / Math.SQRT2)

// ---------- tests ----------

const R_TOLERANCE = 1 + 1e-7

/** Two-sided Fisher's exact test on [[a, b], [c, d]], as R fisher.test. */
export function fisherExact(a: number, b: number, c: number, d: number): number {
  const n1 = a + b
  const n2 = c + d
  const k = a + c
  const n = n1 + n2
  const logDenom = logChoose(n, k)
  const logPmf = (x: number) => logChoose(n1, x) + logChoose(n2, k - x) - logDenom
  const observed = logPmf(a)
  const threshold = observed + Math.log(R_TOLERANCE)
  let p = 0
  for (let x = Math.max(0, k - n2); x <= Math.min(k, n1); x++) {
    const lp = logPmf(x)
    if (lp <= threshold) p += Math.exp(lp)
  }
  return Math.min(1, p)
}

/** Two-sided exact binomial test of k successes in n against probability p, as R binom.test. */
export function binomTest(k: number, n: number, p = 0.5): number {
  const logPmf = (i: number) => logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log1p(-p)
  const threshold = logPmf(k) + Math.log(R_TOLERANCE)
  let total = 0
  for (let i = 0; i <= n; i++) {
    const lp = logPmf(i)
    if (lp <= threshold) total += Math.exp(lp)
  }
  return Math.min(1, total)
}

/**
 * Two-sided Mann-Whitney U, normal approximation with tie and continuity correction,
 * as R wilcox.test(x, y, exact = FALSE, correct = TRUE). U is the statistic for x.
 */
export function mannWhitneyU(x: readonly number[], y: readonly number[]): {U: number; p: number} {
  const n1 = x.length
  const n2 = y.length
  const all = [...x.map((v) => ({v, g: 0})), ...y.map((v) => ({v, g: 1}))].sort((p, q) => p.v - q.v)
  const n = all.length
  let rankSumX = 0
  let tieTerm = 0
  for (let i = 0; i < n; ) {
    let j = i
    while (j + 1 < n && all[j + 1]!.v === all[i]!.v) j++
    const midrank = (i + j + 2) / 2
    const t = j - i + 1
    tieTerm += t * t * t - t
    for (let m = i; m <= j; m++) if (all[m]!.g === 0) rankSumX += midrank
    i = j + 1
  }
  const U = rankSumX - (n1 * (n1 + 1)) / 2
  const mu = (n1 * n2) / 2
  const sigma = Math.sqrt(((n1 * n2) / 12) * (n + 1 - tieTerm / (n * (n - 1))))
  const diff = U - mu
  const z = (diff - Math.sign(diff) * 0.5) / sigma
  return {U, p: Math.min(1, 2 * normSf(Math.abs(z)))}
}

/** Holm-Bonferroni adjusted p-values, as R p.adjust(p, method = "holm"). */
export function holm(p: readonly number[]): number[] {
  const m = p.length
  const order = p.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const adjusted = new Array<number>(m)
  let running = 0
  order.forEach(([v, i], rank) => {
    running = Math.max(running, Math.min(1, (m - rank) * v))
    adjusted[i] = running
  })
  return adjusted
}

/** Quantile of sorted values, linear interpolation (R type 7 / NumPy 'linear'). */
export function quantile7(sorted: readonly number[], prob: number): number {
  if (sorted.length === 0) throw new Error('quantile of an empty sample')
  const h = (sorted.length - 1) * prob
  const lo = Math.floor(h)
  const hi = Math.min(lo + 1, sorted.length - 1)
  return sorted[lo]! + (h - lo) * (sorted[hi]! - sorted[lo]!)
}

// ---------- seeded resampling ----------

/** mulberry32 PRNG: uniform [0, 1) from a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface BootstrapResult {
  /** Bootstrap effects, sorted ascending, undefined resamples removed. */
  effects: number[]
  undefinedResamples: number
  ciLow: number
  ciHigh: number
}

function summarise(effects: number[], undefinedResamples: number): BootstrapResult {
  effects.sort((a, b) => a - b)
  if (effects.length === 0) throw new Error('every bootstrap resample was undefined')
  return {effects, undefinedResamples, ciLow: quantile7(effects, 0.025), ciHigh: quantile7(effects, 0.975)}
}

/**
 * Circular block bootstrap (Politis & Romano): ceil(n / L) block starts drawn uniformly
 * from 0..n-1, L consecutive indices from each (wrapping), truncated to n. `statistic`
 * returns null when the effect is undefined for a resample.
 */
export function circularBlockBootstrap(
  n: number,
  blockLength: number,
  resamples: number,
  seed: number,
  statistic: (indices: Int32Array) => number | null,
): BootstrapResult {
  const rng = mulberry32(seed)
  const blocks = Math.ceil(n / blockLength)
  const indices = new Int32Array(n)
  const effects: number[] = []
  let undefinedResamples = 0
  for (let b = 0; b < resamples; b++) {
    let k = 0
    for (let j = 0; j < blocks; j++) {
      const start = Math.floor(rng() * n)
      for (let o = 0; o < blockLength && k < n; o++) indices[k++] = (start + o) % n
    }
    const e = statistic(indices)
    if (e === null || !Number.isFinite(e)) undefinedResamples++
    else effects.push(e)
  }
  return summarise(effects, undefinedResamples)
}

/**
 * The same circular block bootstrap, specialised for statistics that depend only on how many
 * resampled units fall in each category (e.g. the cells of a 2x2 table). It draws the
 * identical random sequence and covers the identical units as `circularBlockBootstrap`
 * (ceil(n / L) block starts, L consecutive units each, wrapping, truncated to n), but counts
 * each block with prefix sums in O(categories) instead of touching every unit.
 * `codes[i]` is unit i's category, 0..categories-1.
 */
export function circularBlockBootstrapCounts(
  codes: Uint8Array,
  categories: number,
  blockLength: number,
  resamples: number,
  seed: number,
  statistic: (counts: Int32Array) => number | null,
): BootstrapResult {
  const n = codes.length
  // prefix[c * (2n + 1) + i] = units of category c among the first i units of the series doubled,
  // so a wrapping block [s, s + len) is one subtraction.
  const stride = 2 * n + 1
  const prefix = new Int32Array(categories * stride)
  for (let c = 0; c < categories; c++) {
    let run = 0
    for (let i = 0; i < 2 * n; i++) {
      if (codes[i % n] === c) run++
      prefix[c * stride + i + 1] = run
    }
  }
  const rng = mulberry32(seed)
  const blocks = Math.ceil(n / blockLength)
  const counts = new Int32Array(categories)
  const effects: number[] = []
  let undefinedResamples = 0
  for (let b = 0; b < resamples; b++) {
    counts.fill(0)
    let remaining = n
    for (let j = 0; j < blocks; j++) {
      const start = Math.floor(rng() * n)
      const len = Math.min(blockLength, remaining)
      remaining -= len
      for (let c = 0; c < categories; c++) counts[c]! += prefix[c * stride + start + len]! - prefix[c * stride + start]!
    }
    const e = statistic(counts)
    if (e === null || !Number.isFinite(e)) undefinedResamples++
    else effects.push(e)
  }
  return summarise(effects, undefinedResamples)
}

/**
 * Stratified bootstrap: each group is resampled with replacement within itself (group sizes
 * fixed). Groups are drawn in the order given, every index from the same generator.
 */
export function stratifiedBootstrap(
  groupSizes: readonly number[],
  resamples: number,
  seed: number,
  statistic: (groups: Int32Array[]) => number | null,
): BootstrapResult {
  const rng = mulberry32(seed)
  const groups = groupSizes.map((size) => new Int32Array(size))
  const effects: number[] = []
  let undefinedResamples = 0
  for (let b = 0; b < resamples; b++) {
    groups.forEach((g, gi) => {
      for (let i = 0; i < g.length; i++) g[i] = Math.floor(rng() * groupSizes[gi]!)
    })
    const e = statistic(groups)
    if (e === null || !Number.isFinite(e)) undefinedResamples++
    else effects.push(e)
  }
  return summarise(effects, undefinedResamples)
}

// ---------- verdicts ----------

export type Verdict = 'Supported' | 'Contradicted' | 'Not supported' | 'Inconclusive'

/**
 * The locked verdict rules, evaluated top to bottom:
 *   Supported      adjusted p < alpha AND effect > null AND effect >= SESOI
 *   Contradicted   adjusted p < alpha AND effect < null
 *   Not supported  (adjusted p < alpha AND null < effect < SESOI) OR CI high < SESOI
 *   Inconclusive   otherwise
 */
export function verdict(input: {adjustedP: number; effect: number; ciHigh: number; nullValue: number; sesoi: number; alpha?: number}): Verdict {
  const {adjustedP, effect, ciHigh, nullValue, sesoi} = input
  const significant = adjustedP < (input.alpha ?? 0.05)
  if (significant && effect > nullValue && effect >= sesoi) return 'Supported'
  if (significant && effect < nullValue) return 'Contradicted'
  if ((significant && effect > nullValue && effect < sesoi) || ciHigh < sesoi) return 'Not supported'
  return 'Inconclusive'
}
