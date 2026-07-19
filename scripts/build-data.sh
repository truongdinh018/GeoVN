#!/usr/bin/env bash
# Rebuild simplified GeoJSON from upstream vietnamese-provinces-database
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="${TMPDIR:-/tmp}/geovn-build"
ZIP_URL="https://raw.githubusercontent.com/thanglequoc/vietnamese-provinces-database/master/json/vn_provinces_wards_geojson_2026-07-12__19_50_51.zip"

mkdir -p "$BUILD" "$ROOT/data/wards"
echo "Downloading GeoJSON zip…"
curl -L -o "$BUILD/geojson.zip" "$ZIP_URL"
python3 - <<PY
import zipfile
from pathlib import Path
z = zipfile.ZipFile("$BUILD/geojson.zip")
z.extractall("$BUILD/raw")
print("extracted", len(z.namelist()), "files")
PY

echo "Building provinces…"
mapfile -t PROV_FILES < <(find "$BUILD/raw/geojson" -mindepth 2 -maxdepth 2 -name '*.geojson' | sort)
npx -y mapshaper -i "${PROV_FILES[@]}" combine-files \
  -merge-layers name=provinces \
  -simplify dp 20% keep-shapes \
  -o format=geojson gj2008 "$ROOT/data/provinces.geojson"

echo "Building wards per province…"
for dir in "$BUILD/raw/geojson"/*/; do
  code="$(basename "$dir" | cut -d_ -f1)"
  mapfile -t WARD_FILES < <(find "$dir/wards" -name '*.geojson' | sort)
  [[ ${#WARD_FILES[@]} -eq 0 ]] && continue
  npx -y mapshaper -i "${WARD_FILES[@]}" combine-files \
    -merge-layers "name=wards_${code}" \
    -simplify dp 8% keep-shapes \
    -o format=geojson gj2008 "$ROOT/data/wards/${code}.geojson"
  echo "  $code (${#WARD_FILES[@]} wards)"
done

python3 - <<PY
import json
from pathlib import Path
root = Path("$ROOT/data/wards")
features = []
for f in sorted(root.glob("*.geojson")):
    data = json.load(open(f, encoding="utf-8"))
    for feat in data["features"]:
        feat["properties"]["provinceCode"] = f.stem
    json.dump(data, open(f, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    features.extend(data["features"])
out = {"type": "FeatureCollection", "features": features}
json.dump(out, open("$ROOT/data/wards.geojson", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("wards total", len(features))
PY

echo "Done → $ROOT/data"
