import numpy as np
import pytest

from app.models.hmm import fit_hmm
from app.models.pca import fit_pca


def test_pca_is_deterministic_and_oriented():
    matrix = [[float(i), float(i) * 2 + (i % 3), float(60 - i)] for i in range(60)]
    first = fit_pca(matrix, n_components=2)
    second = fit_pca(matrix, n_components=2)
    np.testing.assert_allclose(first.scores, second.scores)
    np.testing.assert_allclose(first.loadings, second.loadings)
    assert first.explained_variance_ratio.sum() <= 1.0 + 1e-12
    for component in range(2):
        anchor = int(np.argmax(np.abs(first.loadings[:, component])))
        assert first.loadings[anchor, component] > 0


def test_pca_rejects_excess_missing_data():
    matrix = [[None if j == 0 else float(i + j) for j in range(3)] for i in range(40)]
    with pytest.raises(ValueError, match="missing fraction"):
        fit_pca(matrix, max_missing_fraction=0.2)


def test_hmm_probabilities_transition_and_labels_are_valid():
    matrix = []
    for i in range(90):
        state = -1.2 if i < 30 else (0.0 if i < 60 else 1.2)
        matrix.append([state + (i % 4) * 0.01, state * 0.4, -state * 0.2])
    fit = fit_hmm(matrix, n_states=3, max_iter=120)
    np.testing.assert_allclose(fit.probabilities.sum(axis=1), 1.0, atol=1e-8)
    np.testing.assert_allclose(fit.transition.sum(axis=1), 1.0, atol=1e-8)
    assert set(fit.labels) == {"risk_on", "neutral", "risk_off"}
    assert fit.states.shape == (90,)
