"""Small deterministic diagonal-Gaussian HMM for shadow regime diagnostics."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

MODEL_KEY = "regime_monitor.us.hmm"
MODEL_VERSION = "hmm.v1.0-shadow"


@dataclass
class HMMFit:
    probabilities: np.ndarray
    states: np.ndarray
    means: np.ndarray
    variances: np.ndarray
    transition: np.ndarray
    labels: list[str]
    converged: bool
    iterations: int
    log_likelihood: float


def _log_gaussian(x: np.ndarray, means: np.ndarray, variances: np.ndarray) -> np.ndarray:
    return -0.5 * (((x[:, None, :] - means[None, :, :]) ** 2 / variances[None, :, :]).sum(axis=2) + np.log(2 * np.pi * variances).sum(axis=1)[None, :])


def _forward_backward(log_emission: np.ndarray, transition: np.ndarray, initial: np.ndarray):
    emission = np.exp(log_emission - log_emission.max(axis=1, keepdims=True))
    n, states = emission.shape
    alpha = np.zeros((n, states)); scales = np.zeros(n)
    alpha[0] = initial * emission[0]; scales[0] = max(alpha[0].sum(), 1e-300); alpha[0] /= scales[0]
    for t in range(1, n):
        alpha[t] = (alpha[t - 1] @ transition) * emission[t]
        scales[t] = max(alpha[t].sum(), 1e-300); alpha[t] /= scales[t]
    beta = np.ones((n, states))
    for t in range(n - 2, -1, -1):
        beta[t] = transition @ (emission[t + 1] * beta[t + 1])
        beta[t] /= max(beta[t].sum(), 1e-300)
    gamma = alpha * beta; gamma /= np.maximum(gamma.sum(axis=1, keepdims=True), 1e-300)
    xi = np.zeros((n - 1, states, states))
    for t in range(n - 1):
        value = alpha[t, :, None] * transition * (emission[t + 1] * beta[t + 1])[None, :]
        xi[t] = value / max(value.sum(), 1e-300)
    return gamma, xi, float(np.log(scales).sum() + log_emission.max(axis=1).sum())


def fit_hmm(matrix: list[list[float]], n_states: int = 3, max_iter: int = 100, tolerance: float = 1e-5) -> HMMFit:
    x = np.asarray(matrix, dtype=float)
    if x.ndim != 2 or x.shape[0] < 36 or x.shape[1] < 1:
        raise ValueError("HMM requires at least 36 aligned observations")
    if not np.isfinite(x).all():
        raise ValueError("HMM input must be finite and complete")
    if not 2 <= n_states <= 5:
        raise ValueError("n_states must be between 2 and 5")
    scales = x.std(axis=0); scales[scales < 1e-12] = 1
    z = (x - x.mean(axis=0)) / scales
    order = np.argsort(z[:, 0]); buckets = np.array_split(order, n_states)
    means = np.vstack([z[bucket].mean(axis=0) for bucket in buckets])
    variances = np.vstack([z[bucket].var(axis=0) + 0.1 for bucket in buckets])
    transition = np.full((n_states, n_states), 0.08 / max(1, n_states - 1)); np.fill_diagonal(transition, 0.92)
    initial = np.full(n_states, 1 / n_states)
    previous = -np.inf; converged = False; likelihood = -np.inf
    for iteration in range(1, max_iter + 1):
        gamma, xi, likelihood = _forward_backward(_log_gaussian(z, means, variances), transition, initial)
        weights = np.maximum(gamma.sum(axis=0), 1e-9)
        initial = gamma[0] / gamma[0].sum()
        transition = xi.sum(axis=0) / np.maximum(gamma[:-1].sum(axis=0)[:, None], 1e-9)
        transition = np.maximum(transition, 1e-6); transition /= transition.sum(axis=1, keepdims=True)
        means = (gamma.T @ z) / weights[:, None]
        variances = np.vstack([((gamma[:, state, None] * (z - means[state]) ** 2).sum(axis=0) / weights[state]) for state in range(n_states)])
        variances = np.maximum(variances, 1e-4)
        if abs(likelihood - previous) < tolerance:
            converged = True; break
        previous = likelihood
    # Feature zero is defined by the caller as stress, low to high.
    rank = np.argsort(means[:, 0]); names = ["transition"] * n_states
    names[int(rank[0])] = "risk_on"; names[int(rank[-1])] = "risk_off"
    if n_states == 4:
        names[int(rank[1])] = "neutral"; names[int(rank[2])] = "fragile"
    elif n_states == 3:
        names[int(rank[1])] = "neutral"
    probabilities = gamma
    states = probabilities.argmax(axis=1)
    return HMMFit(probabilities, states, means, variances, transition, names, converged, iteration, likelihood)
