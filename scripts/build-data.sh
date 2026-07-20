#!/usr/bin/env bash
# Rebuild simplified GeoJSON from the canonical GIS data fork.
# Primary source: truongdinh018/vietnamese-provinces-database
# Upstream origin: thanglequoc/vietnamese-provinces-database (MIT)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="${TMPDIR:-/tmp}/geovn-build"

DATA_OWNER="${DATA_OWNER:-truongdinh018}"
DATA_REPO="${DATA_REPO:-vietnamese-provinces-database}"
DATA_BRANCH="${DATA_BRANCH:-master}"
DATA_ZIP="${DATA_ZIP:-vn_provinces_wards_geojson_2026-07-12__19_50_51.zip}"
ZIP_URL="${ZIP_URL:-https://raw.githubusercontent.com/${DATA_OWNER}/${DATA_REPO}/${DATA_BRANCH}/json/${DATA_ZIP}}"

mkdir -p "$BUILD" "$ROOT/data/wards"
echo "Data source: ${DATA_OWNER}/${DATA_REPO}@${DATA_BRANCH}"
echo "Downloading GeoJSON zip…"
echo "  $ZIP_URL"
curl -fL -o "$BUILD/geojson.zip" "$ZIP_URL"
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

# Record canonical source used for this build
python3 - <<PY
import json
from datetime import datetime, timezone
meta = {
  "primaryRepo": "${DATA_OWNER}/${DATA_REPO}",
  "branch": "${DATA_BRANCH}",
  "zip": "${DATA_ZIP}",
  "zipUrl": "${ZIP_URL}",
  "upstreamOrigin": "thanglequoc/vietnamese-provinces-database",
  "builtAt": datetime.now(timezone.utc).isoformat(),
}
json.dump(meta, open("$ROOT/data/source.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("wrote data/source.json")
PY

echo "Done → $ROOT/data"
