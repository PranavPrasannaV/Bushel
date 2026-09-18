"""Fill the statewide {{TOKENS}} in the writeup and video script from the build's own artifacts.

    python scripts/fill_numbers.py [--check]

Reads web/public/data/reference/validation.json, reference/statewide.json and fires/index.json, and
replaces each {{TOKEN}} in docs/06-DEVPOST.md and docs/07-VIDEO.md. No figure is typed by hand.
--check lists the values and any token left unfilled, and writes nothing.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data"
DOCS = [ROOT / "docs" / "06-DEVPOST.md", ROOT / "docs" / "07-VIDEO.md"]


def signed(value: float, unit: str) -> str:
    sign = "+" if value > 0 else "−" if value < 0 else ""
    return f"{sign}{abs(value):.1f}{unit}"


def values() -> dict[str, str]:
    v = json.loads((DATA / "reference" / "validation.json").read_text(encoding="utf-8"))
    s = json.loads((DATA / "reference" / "statewide.json").read_text(encoding="utf-8"))
    ic, high, roll = v["interior_crosscheck"], v["acreage_check"]["high_severity"], v["rollup"]
    return {
        "N_FIRES": f"{s['built']:,}",
        "N_NOT_BUILT": f"{len(s['not_built']):,}",
        "POOLED_PCT": f"{ic['computed_fraction'] * 100:.1f}%",
        "POOLED_DIFF": f"{signed(ic['difference_pts'], ' points')} from the published figure",
        "HS_COMPUTED": f"{high['computed']:,.0f} acres",
        "HS_DIFF": signed(high["difference_pct"], "%"),
        "HS_COVERAGE": f"{(high['coverage_fraction'] or 0) * 100:.1f}%",
        "ROLLUP": f"{roll['computed_total_bushels']:,.1f}",
        "ROLLUP_DIFF": signed(roll["difference_pct"], "%"),
        "ROLLUP_COVERAGE": f"{(roll['coverage_fraction'] or 0) * 100:.1f}%",
    }


def main() -> None:
    check = "--check" in sys.argv
    vals = values()
    for k, val in vals.items():
        print(f"{k:16} {val}")
    for doc in DOCS:
        text = doc.read_text(encoding="utf-8")
        filled = re.sub(r"\{\{(\w+)\}\}", lambda m: vals.get(m.group(1), m.group(0)), text)
        left = sorted(set(re.findall(r"\{\{(\w+)\}\}", filled)))
        print(f"{doc.name}: {'unfilled ' + ', '.join(left) if left else 'all tokens filled'}")
        if not check and filled != text:
            doc.write_text(filled, encoding="utf-8")


if __name__ == "__main__":
    main()
