"""T025/T026: species allocation inside cells, and the no_conifer finding."""

import numpy as np
import pytest

from bushel.build import _close
from bushel.partition import PIXEL_ACRES, acres, partition
from bushel.species import (
    ALLOCATION_SOURCE,
    NO_CONIFER,
    SPECIES,
    allocate,
    check_species,
    conifer,
    no_conifer_finding,
)

DF, PP, WF = (SPECIES.index(s) for s in ("Douglas Fir", "Ponderosa Pine", "White Fir"))


def grid():
    """3 x 4: two zones side by side, one band; mixed species; one non-conifer pixel off-mask."""
    zone = np.array([[522, 522, 523, 523]] * 3, dtype=np.int16)
    dem = np.full((3, 4), 1000.0, dtype=np.float32)
    species = np.array(
        [[DF, DF, WF, WF], [DF, PP, WF, DF], [PP, PP, -1, WF]],
        dtype=np.int16,
    )
    mask = conifer(species)  # the interior is always restricted to conifer
    return zone, dem, species, mask


def test_allocation_sums_equal_cell_acres():
    zone, dem, species, mask = grid()
    labels, cells, _ = partition(mask, zone, dem)
    allocation = allocate(labels, species, len(cells))
    assert [c["cell_id"] for c in cells] == ["522_3000", "523_3000"]
    assert allocation[0] == [
        {"species": "Douglas Fir", "acres": acres(3)},
        {"species": "Ponderosa Pine", "acres": acres(3)},
    ]
    assert allocation[1] == [
        {"species": "White Fir", "acres": acres(4)},
        {"species": "Douglas Fir", "acres": acres(1)},
    ]
    for cell, species_acres in zip(cells, allocation, strict=True):
        assert _close(sum(s["acres"] for s in species_acres), acres(cell["pixels"]))
        assert all(s["species"] in SPECIES for s in species_acres)


def test_allocation_on_a_large_random_grid_is_exact():
    rng = np.random.default_rng(3)
    shape = (300, 300)
    zone = rng.choice([522, 523, 781], size=shape).astype(np.int16)
    dem = rng.uniform(300, 2500, size=shape).astype(np.float32)
    species = rng.integers(-1, len(SPECIES), size=shape).astype(np.int16)
    labels, cells, _ = partition(conifer(species) & (rng.random(shape) < 0.5), zone, dem)
    allocation = allocate(labels, species, len(cells))
    for i, (cell, species_acres) in enumerate(zip(cells, allocation, strict=True)):
        expected = np.bincount(species[labels == i], minlength=len(SPECIES))
        got = {s["species"]: s["acres"] for s in species_acres}
        assert got == {SPECIES[j]: acres(n) for j, n in enumerate(expected) if n}
        assert sum(got.values()) == pytest.approx(cell["pixels"] * PIXEL_ACRES, abs=1e-3)


def test_allocate_refuses_non_conifer_pixels_in_a_cell():
    zone, dem, species, _ = grid()
    labels, cells, _ = partition(np.ones((3, 4), dtype=bool), zone, dem)
    with pytest.raises(ValueError, match="no species of interest"):
        allocate(labels, species, len(cells))


def test_no_conifer_is_a_stated_finding():
    retained = np.ones((3, 3), dtype=bool)
    none = np.full((3, 3), -1, dtype=np.int16)
    assert no_conifer_finding(none, retained) == {
        "result": "no_conifer",
        "message": "No conifer species present in pre-fire vegetation.",
    }
    assert no_conifer_finding(none, retained) is not NO_CONIFER
    some = none.copy()
    some[1, 1] = DF
    assert no_conifer_finding(some, retained) is None
    # Conifer only outside the retained (SRA) area still counts as none.
    assert no_conifer_finding(some, ~(some >= 0)) == NO_CONIFER


def test_empty_interior_allocates_nothing():
    labels = np.full((2, 2), -1, dtype=np.int32)
    assert allocate(labels, np.zeros((2, 2), dtype=np.int16), 0) == []


def test_species_layer_is_checked():
    check_species(np.full((2, 2), -1, dtype=np.int16), (2, 2))
    with pytest.raises(ValueError, match="shape"):
        check_species(np.zeros((2, 3), dtype=np.int16), (2, 2))
    with pytest.raises(ValueError, match="integer"):
        check_species(np.zeros((2, 2), dtype=np.float32), (2, 2))
    with pytest.raises(ValueError, match="-1..14"):
        check_species(np.full((2, 2), 15, dtype=np.int16), (2, 2))


def test_allocation_source_names_lemma():
    assert ALLOCATION_SOURCE == "LEMMA 2023.1 GNN, dominant tree species by basal area"
