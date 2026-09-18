"""The 15 AON species of interest (research.md R5) and their Terms of Sale row names.

Index order is binding: the raster `species` array stores the position in SPECIES (-1 = none).
Also: species allocation inside cells (T025) and the no_conifer finding (T026).
"""

from enum import StrEnum

import numpy as np

from bushel.partition import acres


class Species(StrEnum):
    BIG_CONE_DOUGLAS_FIR = "Big-Cone Douglas Fir"
    COAST_REDWOOD = "Coast Redwood"
    COULTER_PINE = "Coulter Pine"
    DOUGLAS_FIR = "Douglas Fir"
    GIANT_SEQUOIA = "Giant Sequoia"
    INCENSE_CEDAR = "Incense Cedar"
    JEFFREY_PINE = "Jeffrey Pine"
    KNOBCONE_PINE = "Knobcone Pine"
    LODGEPOLE_PINE = "Lodgepole Pine"
    PONDEROSA_PINE = "Ponderosa Pine"
    RED_FIR = "Red Fir"
    SUBALPINE_FIR = "Subalpine Fir"
    SUGAR_PINE = "Sugar Pine"
    WESTERN_WHITE_PINE = "Western White Pine"
    WHITE_FIR = "White Fir"


SPECIES: tuple[str, ...] = tuple(s.value for s in Species)

# Canonical name -> row in data/seed_prices.csv (CAL FIRE Terms of Sale, Feb 2026).
# Ponderosa is the plain row, not "NSTIA Ponderosa Pine". "Knobcone x Monterey Pine" is a hybrid
# and never stands in for Knobcone Pine.
TERMS_OF_SALE_ROW: dict[str, str] = {
    "Big-Cone Douglas Fir": "Big Cone Douglas-Fir",
    "Coast Redwood": "Coast Redwood",
    "Coulter Pine": "Coulter Pine",
    "Douglas Fir": "Douglas-Fir",
    "Giant Sequoia": "Giant Sequoia",
    "Incense Cedar": "Incense Cedar",
    "Jeffrey Pine": "Jeffrey Pine",
    "Ponderosa Pine": "Ponderosa Pine",
    "Red Fir": "Red Fir",
    "Sugar Pine": "Non-BRR Sugar Pine",
    "Western White Pine": "Western White Pine",
    "White Fir": "White Fir",
}

# No Terms of Sale row: a disclosed gap, never filled (Constitution IV).
NO_TERMS_OF_SALE_ROW: tuple[str, ...] = ("Knobcone Pine", "Lodgepole Pine", "Subalpine Fir")


# ---- Allocation (T025, T026) -------------------------------------------------------------------

ALLOCATION_SOURCE = "LEMMA 2023.1 GNN, dominant tree species by basal area"
NO_CONIFER = {
    "result": "no_conifer",
    "message": "No conifer species present in pre-fire vegetation.",
}


def check_species(species: np.ndarray, shape: tuple) -> None:
    """Fail loudly if a species raster is not a grid of indices into SPECIES (-1 = none)."""
    if species.shape != tuple(shape):
        raise ValueError(f"species array shape {species.shape} != grid shape {tuple(shape)}")
    if not np.issubdtype(species.dtype, np.integer):
        raise ValueError(f"species array must be integer indices, got {species.dtype}")
    if species.size and (species.min() < -1 or species.max() >= len(SPECIES)):
        raise ValueError(f"species indices must lie in -1..{len(SPECIES) - 1}")


def conifer(species: np.ndarray) -> np.ndarray:
    """Pre-fire LEMMA dominant species is one of the 15 AON species of interest."""
    return species >= 0


def no_conifer_finding(species: np.ndarray, retained: np.ndarray) -> dict | None:
    """The no_conifer finding when no retained pixel carries one of the 15 species, else None."""
    return None if (conifer(species) & retained).any() else dict(NO_CONIFER)


def allocate(labels: np.ndarray, species: np.ndarray, n_cells: int) -> list[list[dict]]:
    """Per cell, the acres of each LEMMA dominant species among its pixels (largest first).

    labels is partition()'s cell index per pixel (-1 = not in a cell). Every labelled pixel must
    carry a species of interest: the interior is already restricted to conifer, so a labelled
    non-conifer pixel means the mask was built wrong and the per-cell sums could not hold.
    """
    in_cell = labels >= 0
    cell = labels[in_cell].astype(np.int64)
    sp = species[in_cell].astype(np.int64)
    if (sp < 0).any():
        raise ValueError(f"{int((sp < 0).sum())} cell pixels carry no species of interest")
    n = len(SPECIES)
    counts = np.bincount(cell * n + sp, minlength=n_cells * n).reshape(n_cells, n)
    return [
        sorted(
            ({"species": SPECIES[j], "acres": acres(row[j])} for j in np.flatnonzero(row)),
            key=lambda s: -s["acres"],
        )
        for row in counts
    ]
