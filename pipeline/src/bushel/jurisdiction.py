"""SRA clip (T020): keep the part of the perimeter inside State Responsibility Area.

Vector geometry in EPSG:3310 (metres), so acreages here are exact; raster counts are used for
everything downstream of them (implementation-notes.md, Geography).
"""

import geopandas as gpd

ACRE_M2 = 4046.8564224
EXCLUDED_REASON = "Outside State Responsibility Area"
NO_RETAINED_AREA = {
    "result": "no_retained_area",
    "message": "Entire perimeter lies outside State Responsibility Area.",
}


def retained_geometry(perimeter_gdf: gpd.GeoDataFrame, sra_gdf: gpd.GeoDataFrame):
    """Perimeter ∩ SRA as one shapely geometry (EPSG:3310). Empty if nothing is retained."""
    return perimeter_gdf.union_all().intersection(sra_gdf.union_all())


def clip(perimeter_gdf: gpd.GeoDataFrame, sra_gdf: gpd.GeoDataFrame) -> dict:
    """Retained and excluded acres. Excluded is the vector difference, so the sum is checked."""
    for name, gdf in (("perimeter", perimeter_gdf), ("sra", sra_gdf)):
        if gdf.crs is None or gdf.crs.to_epsg() != 3310:
            raise ValueError(f"{name} must be in EPSG:3310 (metres), got {gdf.crs}")
    perimeter = perimeter_gdf.union_all()
    sra = sra_gdf.union_all()
    return {
        "perimeter_acres": perimeter.area / ACRE_M2,
        "retained_acres": perimeter.intersection(sra).area / ACRE_M2,
        "excluded_acres": perimeter.difference(sra).area / ACRE_M2,
        "excluded_reason": EXCLUDED_REASON,
    }


def finding(clipped: dict) -> dict | None:
    """The no_retained_area finding when nothing of the perimeter lies in SRA, else None."""
    if clipped["retained_acres"] < 0.01:  # an empty intersection, allowing float slivers
        return dict(NO_RETAINED_AREA)
    return None
