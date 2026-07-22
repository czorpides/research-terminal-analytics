"""Deterministic PCA for aligned, standardised market features."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

MODEL_KEY = "market_engine.us.pca_factor"
MODEL_VERSION = "pca.v1.0"


@dataclass
class PCAFit:
    scores: np.ndarray
    loadings: np.ndarray
    explained_variance_ratio: np.ndarray
    feature_means: np.ndarray
    feature_scales: np.ndarray
    missing_fraction: float


def fit_pca(matrix: list[list[float | None]], n_components: int = 2, max_missing_fraction: float = 0.2) -> PCAFit:
    x = np.asarray([[np.nan if value is None else float(value) for value in row] for row in matrix], dtype=float)
    if x.ndim != 2 or x.shape[1] < 2:
        raise ValueError("PCA requires a two-dimensional matrix with at least two features")
    if x.shape[0] < max(24, x.shape[1] + 2):
        raise ValueError("PCA requires at least 24 aligned observations")
    missing_fraction = float(np.isnan(x).mean())
    if missing_fraction > max_missing_fraction:
        raise ValueError(f"missing fraction {missing_fraction:.3f} exceeds {max_missing_fraction:.3f}")
    medians = np.nanmedian(x, axis=0)
    if np.isnan(medians).any():
        raise ValueError("one or more PCA features are entirely missing")
    x = np.where(np.isnan(x), medians, x)
    means = x.mean(axis=0)
    scales = x.std(axis=0)
    if np.any(scales < 1e-12):
        raise ValueError("one or more PCA features have zero variance")
    z = (x - means) / scales
    _, singular_values, vt = np.linalg.svd(z, full_matrices=False)
    count = min(max(1, n_components), z.shape[1])
    loadings = vt[:count].T
    scores = z @ loadings
    # SVD signs are arbitrary. Orient each component by its largest loading.
    for component in range(count):
        anchor = int(np.argmax(np.abs(loadings[:, component])))
        if loadings[anchor, component] < 0:
            loadings[:, component] *= -1
            scores[:, component] *= -1
    variance = singular_values**2
    explained = variance[:count] / variance.sum()
    return PCAFit(scores, loadings, explained, means, scales, missing_fraction)
