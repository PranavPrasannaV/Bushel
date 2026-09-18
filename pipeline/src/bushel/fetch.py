"""Fetch + cache source layers and build one aligned raster stack per demo fire (T007, T008).

    python -m bushel.fetch --cache ../data/cache [--fires caldor-2021,...] [--refresh]
    python -m bushel.fetch --species-only   # add LEMMA species to existing stacks, no network

Statewide vector layers are cached once as GeoJSON (EPSG:4326) with a manifest.json recording the
source URL and retrieval time. Each fire gets data/cache/fires/{id}/stack.npz + meta.json on a
30 m EPSG:3310 grid (perimeter bbox + 1 km, snapped to 30 m), plus perimeter.gpkg / sra.gpkg
(EPSG:3310).
"""

import argparse
import csv
import datetime as dt
import json
import math
import time
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
import requests
from rasterio import Affine
from rasterio.features import rasterize
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

from bushel.species import SPECIES

DEFAULT_CACHE = Path(__file__).resolve().parents[3] / "data" / "cache"
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh) Bushel/0.1 hackathon pipeline (public data)"}
CRS, RES, BUFFER_M = "EPSG:3310", 30, 1000

AGOL = "https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services"
VECTORS = {
    "seed_zones": {
        "url": f"{AGOL}/California_Seed_Zones/FeatureServer/0",
        "where": "1=1",
        "fields": ["SEED_ZONE"],
    },
    "sra": {
        "url": f"{AGOL}/State_Responsibility_Area/FeatureServer/0",
        "where": "1=1",
        "fields": ["SRA"],
    },
    "perimeters_2018_2024": {
        "url": f"{AGOL}/California_Historic_Fire_Perimeters/FeatureServer/0",
        "where": "STATE='CA' AND YEAR_>=2018 AND YEAR_<=2024",
        "fields": ["YEAR_", "FIRE_NAME", "GIS_ACRES", "ALARM_DATE", "INC_NUM", "IRWINID", "AGENCY"],
    },
    "mtbs_perimeters": {
        "url": "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MTBS_01/MapServer/63",
        "where": "fire_id LIKE 'CA%' AND year>=2018 AND year<=2024",
        "fields": ["fire_id", "fire_name", "year", "acres", "ig_date", "asmnt_type"],
        "page": 100,  # this MapServer errors on larger geometry responses
    },
}
MTBS_IMAGE = "https://imagery.geoplatform.gov/iipp/rest/services/Fire_Aviation/USFS_EDW_MTBS_CONUS/ImageServer"
DEM_IMAGE = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer"
LEMMA_DOWNLOAD = "https://lemmadownload.forestry.oregonstate.edu"

# id, display name, FRAP FIRE_NAME (trimmed), year, MTBS fire_id (from the MTBS boundaries layer).
DEMO_FIRES = [
    ("camp-2018", "Camp", "CAMP", 2018, "CA3982012144020181108"),
    ("carr-2018", "Carr", "CARR", 2018, "CA4065012263020180723"),
    ("north-complex-2020", "North Complex", "NORTH COMPLEX", 2020, "CA4009112093120200817"),
    ("creek-2020", "Creek", "CREEK", 2020, "CA3720111927220200905"),
    ("caldor-2021", "Caldor", "CALDOR", 2021, "CA3858612053820210815"),
    ("dixie-2021", "Dixie", "DIXIE", 2021, "CA3987612137920210714"),
    ("mosquito-2022", "Mosquito", "MOSQUITO", 2022, "CA3900612074520220907"),
    ("mckinney-2022", "McKinney", "MCKINNEY", 2022, "CA4183012289520220729"),
]

# LEMMA GNN species symbols (as listed by the LEMMA downloader) -> canonical AON name.
# ABPRSH and ABGRC are LEMMA's own species groups; in California they are red fir (incl. Shasta
# red fir) and white fir respectively. Any other symbol -> -1.
LEMMA_TO_CANONICAL = {
    "PSMA": "Big-Cone Douglas Fir",
    "SESE3": "Coast Redwood",
    "PICO3": "Coulter Pine",
    "PSME": "Douglas Fir",
    "SEGI2": "Giant Sequoia",
    "CADE27": "Incense Cedar",
    "PIJE": "Jeffrey Pine",
    "PIAT": "Knobcone Pine",
    "PICO": "Lodgepole Pine",
    "PIPO": "Ponderosa Pine",
    "ABPRSH": "Red Fir",
    "ABLA": "Subalpine Fir",
    "PILA": "Sugar Pine",
    "PIMO3": "Western White Pine",
    "ABGRC": "White Fir",
}


def species_index(symbol: str) -> int:
    """Index into bushel.species.SPECIES for a LEMMA species symbol; -1 if not one of the 15."""
    name = LEMMA_TO_CANONICAL.get(symbol.strip().upper())
    return SPECIES.index(name) if name else -1


# Gap text that stacks built before LEMMA was obtained carry; add_species strips it from meta.
LEMMA_GAP = (
    "LEMMA GNN.2023.1 (TREEPLBA, dominant tree species by basal area) is distributed only through "
    f"{LEMMA_DOWNLOAD}, which requires a name, organisation and email before download. It was not "
    "obtained, so no species array is built. No other vegetation layer was substituted."
)
LEMMA_ACCESS = (
    "Downloaded manually through the LEMMA download form (asks for name, organisation and email; "
    "no key, no login): GNN.2023.1, attribute TREEPLBA, preset California, model years 2017 and "
    "2021. Files live in data/cache/lemma/ (not committed)."
)


def lemma_year(fire_year: int) -> int:
    """Pre-fire LEMMA model year. Public years are 2017 and 2021; the 2021 map is post-fire for
    2018-2021 fires, so those use 2017."""
    return 2017 if fire_year <= 2021 else 2021


def lemma_lut(cache: Path) -> np.ndarray:
    """LEMMA TREEPLBA code -> int16 index into SPECIES (-1 = not one of the 15)."""
    with open(cache / "lemma" / "treeplba_codes.csv", newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows or set(rows[0]) != {"TREEPLBA_CODE", "TREEPLBA"}:
        raise SchemaError("treeplba_codes.csv: expected columns TREEPLBA_CODE, TREEPLBA")
    symbols = {int(r["TREEPLBA_CODE"]): r["TREEPLBA"] for r in rows}
    if missing := set(LEMMA_TO_CANONICAL) - set(symbols.values()):
        raise SchemaError(f"treeplba_codes.csv lacks species symbols {sorted(missing)}")
    lut = np.full(max(symbols) + 1, -1, dtype=np.int16)
    for code, symbol in symbols.items():
        lut[code] = species_index(symbol)
    return lut


def lemma_lookup(codes: np.ndarray, lut: np.ndarray) -> np.ndarray:
    """int16 species index for raw LEMMA codes; non-forest (-1), nodata and unknown codes -> -1."""
    out = np.full(codes.shape, -1, dtype=np.int16)
    ok = (codes >= 0) & (codes < len(lut))
    out[ok] = lut[codes[ok]]
    return out


def fortypba_lut(cache: Path) -> np.ndarray:
    """LEMMA FORTYPBA code (up to two dominant species, e.g. PSME/QUKE) -> True if either is one
    of the 15. Used only for the statewide validation sensitivity figure."""
    with open(cache / "lemma" / "fortypba_codes.csv", newline="") as f:
        rows = {int(r["FORTYPBA_CODE"]): r["FORTYPBA"] for r in csv.DictReader(f)}
    lut = np.zeros(max(rows) + 1, dtype=bool)
    for code, label in rows.items():
        lut[code] = any(species_index(s) >= 0 for s in label.split("/"))
    return lut


def open_lemma(model_year: int, cache: Path, attribute: str = "treeplba"):
    path = cache / "lemma" / f"{attribute}_{model_year}.tif"
    src = rasterio.open(path)
    if src.crs.to_epsg() != 5070 or src.dtypes[0] != "int32":
        src.close()
        raise SchemaError(f"{path.name}: expected int32 EPSG:5070, got {src.crs}")
    return src


def lemma_species(fire_year: int, transform, shape, cache: Path) -> np.ndarray:
    """int16 index into SPECIES per grid pixel (-1 = non-forest or not one of the 15), from the
    pre-fire LEMMA TREEPLBA raster (EPSG:5070, 30 m, int32 codes) reprojected nearest-neighbour."""
    lut = lemma_lut(cache)
    codes = np.full(shape, -1, dtype=np.int32)
    with open_lemma(lemma_year(fire_year), cache) as src:
        reproject(
            rasterio.band(src, 1),
            codes,
            src_nodata=src.nodata,
            dst_transform=transform,
            dst_crs=CRS,
            dst_nodata=-1,
            resampling=Resampling.nearest,
        )
    return lemma_lookup(codes, lut)


def species_meta(fire_year: int, cache: Path) -> dict:
    path = cache / "lemma" / f"treeplba_{lemma_year(fire_year)}.tif"
    obtained = dt.datetime.fromtimestamp(path.stat().st_mtime, dt.UTC).date().isoformat()
    return {
        "source_url": LEMMA_DOWNLOAD,
        "status": "obtained",
        "file": f"lemma/{path.name}",
        "model_year": lemma_year(fire_year),
        "retrieved_at": obtained,
        "note": LEMMA_ACCESS,
    }


def add_species(fire_id: str, cache: Path) -> dict:
    """Add the LEMMA `species` array to an already-built stack (no network). Returns meta."""
    arrays, meta = load_stack(fire_id, cache)
    transform = Affine(*meta["transform"])
    arrays["species"] = lemma_species(meta["year"], transform, tuple(meta["shape"]), cache)
    d = cache / "fires" / fire_id
    np.savez_compressed(d / "stack.npz", **arrays)
    meta["layers"]["species"] = species_meta(meta["year"], cache)
    meta["arrays"] = sorted(arrays)
    meta["gaps"] = [g for g in meta.get("gaps", []) if g != LEMMA_GAP]
    (d / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta


class SchemaError(RuntimeError):
    """A source layer no longer looks the way the pipeline expects."""


def now_iso() -> str:
    return dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat()


def get(url: str, params: dict, tries: int = 3) -> requests.Response:
    """GET with a browser-ish User-Agent, retrying transient failures (flaky TLS/5xx)."""
    for i in range(tries):
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=600)
            r.raise_for_status()
            return r
        except requests.RequestException:
            if i == tries - 1:
                raise
            time.sleep(5 * (i + 1))


def get_json(url: str, params: dict | None = None) -> dict:
    data = get(url, {**(params or {}), "f": "json"}).json()
    if "error" in data:
        raise RuntimeError(f"{url}: {data['error']}")
    return data


def layer_info(url: str, fields: list[str]) -> dict:
    """Read layer metadata and fail loudly if an expected field is missing (T008)."""
    info = get_json(url)
    have = {f["name"] for f in info.get("fields", [])}
    missing = [f for f in fields if f not in have]
    if missing:
        raise SchemaError(f"{url} is missing expected fields {missing}; has {sorted(have)}")
    edit = info.get("editingInfo", {})
    last = edit.get("dataLastEditDate") or edit.get("lastEditDate")
    return {"name": info.get("name"), "source_last_edit": ms_to_date(last) if last else None}


def query_geojson(url: str, where: str, fields: list[str], page: int = 2000) -> list[dict]:
    """Page through an ArcGIS layer query, returning GeoJSON features in EPSG:4326."""
    features, offset = [], 0
    while True:
        params = {
            "where": where,
            "outFields": ",".join(fields),
            "outSR": 4326,
            "geometryPrecision": 6,
            "resultOffset": offset,
            "resultRecordCount": page,
            "f": "geojson",
        }
        data = get(f"{url}/query", params).json()
        if "error" in data:
            raise RuntimeError(f"{url}: {data['error']}")
        features += data["features"]
        offset += len(data["features"])
        if not data["features"] or not data.get("properties", {}).get("exceededTransferLimit"):
            return features


def fetch_vectors(cache: Path, refresh: bool = False) -> dict:
    """Download each statewide vector layer once; write manifest.json. Returns the manifest."""
    cache.mkdir(parents=True, exist_ok=True)
    manifest = read_manifest(cache)
    for name, spec in VECTORS.items():
        path = cache / f"{name}.geojson"
        if path.exists() and name in manifest and not refresh:
            continue
        info = layer_info(spec["url"], spec["fields"])
        feats = query_geojson(spec["url"], spec["where"], spec["fields"], spec.get("page", 2000))
        if not feats:
            raise SchemaError(f"{name}: query returned no features ({spec['where']})")
        for f in feats[:50]:
            missing = [k for k in spec["fields"] if k not in f["properties"]]
            if missing:
                raise SchemaError(f"{name}: downloaded features lack {missing}")
        path.write_text(json.dumps({"type": "FeatureCollection", "features": feats}))
        manifest[name] = {
            "source_url": spec["url"],
            "query": spec["where"],
            "retrieved_at": now_iso(),
            "source_last_edit": info["source_last_edit"],
            "layer_name": info["name"],
            "feature_count": len(feats),
            "path": path.name,
        }
        write_manifest(cache, manifest)
        print(f"  {name}: {len(feats)} features")
    return manifest


def read_manifest(cache: Path) -> dict:
    p = cache / "manifest.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def write_manifest(cache: Path, manifest: dict) -> None:
    (cache / "manifest.json").write_text(json.dumps(manifest, indent=2))


def ms_to_date(ms) -> str:
    return dt.datetime.fromtimestamp(ms / 1000, dt.UTC).date().isoformat()


def grid_for(geom) -> tuple:
    """30 m grid over the geometry bounds + 1 km, snapped to 30 m. Returns (transform, (h, w))."""
    minx, miny, maxx, maxy = geom.bounds
    x0 = math.floor((minx - BUFFER_M) / RES) * RES
    y0 = math.floor((miny - BUFFER_M) / RES) * RES
    x1 = math.ceil((maxx + BUFFER_M) / RES) * RES
    y1 = math.ceil((maxy + BUFFER_M) / RES) * RES
    return from_origin(x0, y1, RES, RES), ((y1 - y0) // RES, (x1 - x0) // RES)


def export_image(url: str, transform, shape, resampling, dtype, tile=1500, **params) -> np.ndarray:
    """exportImage over the grid from an ArcGIS ImageServer, in tiles, warped onto the grid."""
    out = np.zeros(shape, dtype=dtype)
    for r0 in range(0, shape[0], tile):
        for c0 in range(0, shape[1], tile):
            h, w = min(tile, shape[0] - r0), min(tile, shape[1] - c0)
            x0, y1 = transform @ (c0, r0)
            query = {
                "bbox": f"{x0},{y1 - h * RES},{x0 + w * RES},{y1}",
                "bboxSR": 3310,
                "imageSR": 3310,
                "size": f"{w},{h}",
                "format": "tiff",
                "f": "image",
            }
            r = get(f"{url}/exportImage", query | params)
            kind = r.headers.get("content-type", "")
            if "tiff" not in kind:
                raise SchemaError(f"{url}: expected a TIFF, got {kind}: {r.text[:300]}")
            with MemoryFile(r.content) as mem, mem.open() as src:
                reproject(
                    source=src.read(1),
                    destination=out[r0 : r0 + h, c0 : c0 + w],
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=transform @ Affine.translation(c0, r0),
                    dst_crs=CRS,
                    resampling=resampling,
                )
    return out


def check_image(url: str, pixel_type: str) -> None:
    """Fail loudly if an image service stops being the single-band raster we expect (T008)."""
    info = get_json(url)
    if info.get("pixelType") != pixel_type or info.get("bandCount") != 1:
        raise SchemaError(
            f"{url}: expected 1-band {pixel_type}, got "
            f"{info.get('bandCount')}-band {info.get('pixelType')}"
        )


def mtbs_for(year: int, transform, shape) -> np.ndarray:
    rule = {"mosaicMethod": "esriMosaicAttribute", "where": f"year={year}", "sortField": "year"}
    arr = export_image(
        MTBS_IMAGE,
        transform,
        shape,
        Resampling.nearest,
        np.uint8,
        pixelType="U8",
        interpolation="RSP_NearestNeighbor",
        mosaicRule=json.dumps(rule),
        renderingRule=json.dumps({"rasterFunction": "None"}),
    )
    if arr.max() > 6:
        raise SchemaError(f"MTBS {year}: class values outside 0-6: {np.unique(arr)}")
    return arr


def dem_for(transform, shape) -> np.ndarray:
    arr = export_image(
        DEM_IMAGE,
        transform,
        shape,
        Resampling.bilinear,
        np.float32,
        pixelType="F32",
        interpolation="RSP_BilinearInterpolation",
    )
    arr[(arr < -500) | (arr > 5000)] = np.nan  # service nodata -> NaN
    return arr


def demo_fires() -> list[dict]:
    """The demo fire set: California fires 2018-2023 with MTBS severity."""
    keys = ("id", "name", "frap_name", "year", "mtbs_fire_id")
    return [dict(zip(keys, row, strict=True)) for row in DEMO_FIRES]


def load_layers(cache: Path) -> dict:
    return {name: gpd.read_file(cache / f"{name}.geojson").to_crs(CRS) for name in VECTORS}


def build_stack(fire: dict, cache: Path, layers: dict, manifest: dict) -> dict:
    """Build and save one fire's aligned stack. Returns meta."""
    perims = layers["perimeters_2018_2024"]
    rows = perims[
        (perims["FIRE_NAME"].str.strip().str.upper() == fire["frap_name"])
        & (perims["YEAR_"] == fire["year"])
    ]
    if rows.empty:
        raise SchemaError(f"{fire['id']}: no FRAP perimeter for {fire['frap_name']} {fire['year']}")
    row = rows.sort_values("GIS_ACRES", ascending=False).iloc[0]  # the named large fire
    mtbs = layers["mtbs_perimeters"]
    if not (mtbs["fire_id"] == fire["mtbs_fire_id"]).any():
        raise SchemaError(f"{fire['id']}: MTBS fire {fire['mtbs_fire_id']} not in MTBS boundaries")

    geom = gpd.GeoSeries([row.geometry], crs=CRS).make_valid().buffer(0).iloc[0]
    transform, shape = grid_for(geom)
    minx, maxy = transform.c, transform.f
    maxx, miny = minx + shape[1] * RES, maxy - shape[0] * RES

    def burn(shapes, fill, dtype):
        shapes = list(shapes)
        if not shapes:
            return np.full(shape, fill, dtype=dtype)
        return rasterize(shapes, out_shape=shape, transform=transform, fill=fill, dtype=dtype)

    sra = layers["sra"].cx[minx:maxx, miny:maxy]
    sra = sra[sra["SRA"] == "SRA"]
    sra = sra.set_geometry(sra.geometry.make_valid().buffer(0))  # source rings self-intersect
    zones = layers["seed_zones"].cx[minx:maxx, miny:maxy]
    retrieved = now_iso()
    arrays = {
        "perimeter": burn([(geom, 1)], 0, np.uint8).astype(bool),
        "sra": burn(((g, 1) for g in sra.geometry), 0, np.uint8).astype(bool),
        "seed_zone": burn(
            ((g, int(z)) for g, z in zip(zones.geometry, zones["SEED_ZONE"], strict=True)),
            -1,
            np.int16,
        ),
        "mtbs": mtbs_for(fire["year"], transform, shape),
        "dem_m": dem_for(transform, shape),
        "species": lemma_species(fire["year"], transform, shape, cache),
    }

    out = cache / "fires" / fire["id"]
    out.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out / "stack.npz", **arrays)
    # Vectors stay in EPSG:3310: a round trip through 4326 re-breaks ring validity.
    gpd.GeoDataFrame({"id": [fire["id"]]}, geometry=[geom], crs=CRS).to_file(out / "perimeter.gpkg")
    sra.clip((minx, miny, maxx, maxy))[["SRA", "geometry"]].to_file(out / "sra.gpkg")

    layer = {
        k: {"source_url": v["source_url"], "retrieved_at": v["retrieved_at"]}
        for k, v in manifest.items()
        if k in VECTORS
    }
    layer["mtbs"] = {
        "source_url": MTBS_IMAGE,
        "retrieved_at": retrieved,
        "note": f"MTBS CONUS thematic burn severity mosaic, year {fire['year']}",
    }
    layer["dem_m"] = {"source_url": DEM_IMAGE, "retrieved_at": retrieved}
    layer["species"] = species_meta(fire["year"], cache)
    meta = {
        "id": fire["id"],
        "name": fire["name"],
        "year": fire["year"],
        "discovery_date": ms_to_date(row["ALARM_DATE"]),
        "perimeter_source_date": manifest["perimeters_2018_2024"]["source_last_edit"],
        "provisional": False,
        "mtbs_fire_id": fire["mtbs_fire_id"],
        "frap": {
            "fire_name": row["FIRE_NAME"].strip(),
            "inc_num": row["INC_NUM"],
            "irwin_id": row["IRWINID"],
            "agency": row["AGENCY"],
            "gis_acres": float(row["GIS_ACRES"]),
        },
        "crs": CRS,
        "resolution_m": RES,
        "transform": list(transform)[:6],
        "shape": list(shape),
        "arrays": sorted(arrays),
        "layers": layer,
        "gaps": [],
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta


def load_stack(fire_id: str, cache_dir: Path | str = DEFAULT_CACHE) -> tuple[dict, dict]:
    """(arrays, meta) for one fire."""
    d = Path(cache_dir) / "fires" / fire_id
    with np.load(d / "stack.npz") as z:
        arrays = {k: z[k] for k in z.files}
    return arrays, json.loads((d / "meta.json").read_text(encoding="utf-8"))


def load_fire_vectors(fire_id: str, cache_dir: Path | str = DEFAULT_CACHE) -> tuple:
    """(perimeter, sra) GeoDataFrames in EPSG:3310 for the vector acreage clip."""
    d = Path(cache_dir) / "fires" / fire_id
    per, sra = gpd.read_file(d / "perimeter.gpkg"), gpd.read_file(d / "sra.gpkg")
    return (
        per.set_geometry(per.geometry.make_valid().buffer(0)),
        sra.set_geometry(sra.geometry.make_valid().buffer(0)),
    )


def summarize(arrays: dict, min_acres: float = 100) -> dict:
    """Seed zones covering at least `min_acres` inside the perimeter, SRA share, high px."""
    p = arrays["perimeter"]
    zones, counts = np.unique(arrays["seed_zone"][p], return_counts=True)
    return {
        "shape": arrays["perimeter"].shape,
        "seed_zones": [
            int(z)
            for z, n in zip(zones, counts, strict=True)
            if z >= 0 and n * RES * RES / 4046.8564224 >= min_acres
        ],
        "sra_fraction": round(float(arrays["sra"][p].mean()), 3),
        "high_px": int(((arrays["mtbs"] == 4) & p).sum()),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--fires", help="comma-separated fire ids (default: all demo fires)")
    ap.add_argument("--refresh", action="store_true", help="re-download statewide layers")
    ap.add_argument(
        "--species-only", action="store_true", help="add LEMMA species to existing stacks"
    )
    args = ap.parse_args()
    wanted = set(args.fires.split(",")) if args.fires else None
    lemma = {
        "source_url": LEMMA_DOWNLOAD,
        "status": "obtained",
        "files": [f"lemma/treeplba_{y}.tif" for y in (2017, 2021)],
        "note": LEMMA_ACCESS,
    }

    if args.species_only:
        manifest = read_manifest(args.cache)
        manifest["lemma_species"] = lemma
        write_manifest(args.cache, manifest)
        for fire in demo_fires():
            if wanted and fire["id"] not in wanted:
                continue
            add_species(fire["id"], args.cache)
            arrays, _ = load_stack(fire["id"], args.cache)
            n = int((arrays["species"] >= 0).sum())
            print(f"{fire['id']}: {n} conifer px of {arrays['species'].size}")
        return

    print("Fetching statewide layers ...")
    manifest = fetch_vectors(args.cache, args.refresh)
    for name, url, kind in (("mtbs_severity", MTBS_IMAGE, "U8"), ("dem_3dep", DEM_IMAGE, "F32")):
        check_image(url, kind)
        manifest[name] = {"source_url": url, "retrieved_at": now_iso(), "access": "exportImage"}
    manifest["lemma_species"] = lemma
    write_manifest(args.cache, manifest)

    layers = load_layers(args.cache)
    for fire in demo_fires():
        if wanted and fire["id"] not in wanted:
            continue
        print(f"Building {fire['id']} ...")
        build_stack(fire, args.cache, layers, manifest)
        s = summarize(load_stack(fire["id"], args.cache)[0])
        print(
            f"  shape={s['shape']} zones={s['seed_zones']} sra_fraction={s['sra_fraction']} "
            f"high_px={s['high_px']}"
        )


if __name__ == "__main__":
    main()
