"""Reference values for lab/stats.ts from established libraries (SciPy, statsmodels, NumPy).

Run:  python lab/scripts/stats_fixtures.py   -> writes lab/test/fixtures/stats.json

The locks name R semantics for each test. Where SciPy differs from R, the R rule is
reproduced here on top of SciPy primitives and the difference is stated:
  - fisher_exact: SciPy treats tables as tied within relative 1e-14; R (fisher.test) uses
    1e-7. We sum scipy.stats.hypergeom pmf values <= p_obs * (1 + 1e-7), and also record
    scipy.stats.fisher_exact for comparison.
  - mannwhitneyu(method='asymptotic', use_continuity=True) with tie correction equals
    R wilcox.test(exact = FALSE, correct = TRUE).
  - binomtest uses R's relative tolerance 1 + 1e-7.
  - Holm: statsmodels multipletests(method='holm') equals R p.adjust(method = 'holm').
  - Quantiles: numpy.quantile(method='linear') equals R quantile type 7.
"""

import json
import platform
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import scipy
import scipy.special
import scipy.stats as st
import statsmodels
from statsmodels.stats.multitest import multipletests

rng = np.random.default_rng(20261004)


def fisher_r(a, b, c, d):
    """Two-sided Fisher exact p with R's relative tolerance, on SciPy's hypergeometric pmf."""
    n1, n2, k = a + b, c + d, a + c
    support = np.arange(max(0, k - n2), min(k, n1) + 1)
    pmf = st.hypergeom.pmf(support, n1 + n2, n1, k)
    p_obs = st.hypergeom.pmf(a, n1 + n2, n1, k)
    return float(min(1.0, pmf[pmf <= p_obs * (1 + 1e-7)].sum()))


fisher_tables = [
    [3, 1, 1, 3],
    [10, 2, 3, 15],
    [0, 5, 5, 0],
    [7, 12, 0, 4],
    [20, 20, 20, 20],
    [1, 0, 0, 0],
    [120, 30, 2900, 1200],
    [1500, 300, 22000, 3594],
    [455, 1205, 9876, 15858],
    [38, 2, 25470, 1884],
]
fisher = []
for a, b, c, d in fisher_tables:
    fisher.append({
        "table": [a, b, c, d],
        "p": fisher_r(a, b, c, d),
        "scipyFisherExact": float(st.fisher_exact([[a, b], [c, d]], alternative="two-sided").pvalue),
    })

mann_whitney = []
for nx, ny, lam_x, lam_y in [(5, 7, 3, 3), (25, 50, 10, 12), (30, 45, 14, 14), (12, 63, 8, 15), (40, 35, 0.4, 0.6)]:
    x = rng.poisson(lam_x, nx).tolist()
    y = rng.poisson(lam_y, ny).tolist()
    r = st.mannwhitneyu(x, y, use_continuity=True, alternative="two-sided", method="asymptotic")
    mann_whitney.append({"x": x, "y": y, "U": float(r.statistic), "p": float(r.pvalue)})

binomial = []
for k, n in [(0, 10), (3, 10), (5, 10), (9, 10), (30, 75), (45, 75), (28, 75), (60, 75), (1, 1), (37, 74)]:
    binomial.append({"k": k, "n": n, "p": float(st.binomtest(k, n, 0.5, alternative="two-sided").pvalue)})

holm = []
for pvals in [
    [0.01, 0.04, 0.03, 0.005, 0.2, 0.5],
    [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    [1e-10, 0.049, 0.0001, 0.9, 0.012, 0.011],
    [0.0, 1.0, 0.04, 0.04, 0.02, 0.6],
]:
    reject, adjusted, _, _ = multipletests(pvals, alpha=0.05, method="holm")
    holm.append({"p": pvals, "adjusted": [float(v) for v in adjusted]})

quantiles = []
for values in [rng.normal(0, 1, 37).tolist(), rng.integers(-5, 5, 10000).astype(float).tolist()[:2001], [1.0], [2.0, 1.0]]:
    quantiles.append({
        "values": values,
        "probs": [0.0, 0.025, 0.5, 0.975, 1.0],
        "quantiles": [float(q) for q in np.quantile(values, [0.0, 0.025, 0.5, 0.975, 1.0], method="linear")],
    })

special = {
    "gammaln": [{"x": x, "value": float(scipy.special.gammaln(x))} for x in [0.5, 1, 2, 3.7, 10, 101.5, 1000, 27394, 1e6]],
    "normSf": [{"z": z, "value": float(st.norm.sf(z))} for z in [0, 0.5, 1, 1.96, 2.5, 3, 4.5, 6, 8.2, 12]],
}

out = {
    "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "generator": "lab/scripts/stats_fixtures.py",
    "libraries": {
        "python": platform.python_version(),
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "statsmodels": statsmodels.__version__,
    },
    "fisher": fisher,
    "mannWhitney": mann_whitney,
    "binomial": binomial,
    "holm": holm,
    "quantileType7": quantiles,
    "special": special,
}
path = Path(__file__).resolve().parent.parent / "test" / "fixtures" / "stats.json"
path.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
print(f"wrote {path}")
for f in fisher:
    if abs(f["p"] - f["scipyFisherExact"]) > 1e-12 * max(f["p"], 1e-300):
        print("R-rule vs scipy differ:", f)
