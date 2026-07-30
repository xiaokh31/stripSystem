#!/bin/sh
set -eu

artifact_dir=${1:-}
task_slug=${REPORT_VISUAL_TASK_SLUG:-unload-report-03}
case "$artifact_dir" in
  /workspace/test-results/"$task_slug"/*) ;;
  *)
    echo "$task_slug artifact path must be a unique run directory." >&2
    exit 1
    ;;
esac

source_dir="$artifact_dir/source"
pdf_dir="$artifact_dir/pdf"
png_dir="$artifact_dir/png"
text_dir="$artifact_dir/text"
geometry_tsv="$artifact_dir/geometry.tsv"
summary="$artifact_dir/visual-verification.txt"

for output_dir in "$pdf_dir" "$png_dir" "$text_dir"; do
  test ! -e "$output_dir" || {
    echo "Refusing to reuse visual output directory: $output_dir" >&2
    exit 1
  }
done
mkdir -p "$pdf_dir" "$png_dir" "$text_dir"
: > "$geometry_tsv"
: > "$summary"

required_workbooks=${REPORT_VISUAL_REQUIRED_WORKBOOKS:-"template worker-generated-report api-downloaded-report report-0 report-1 report-8 report-9 report-16 report-17 report-32 report-33 duplicate-destinations long-english long-cjk multiline long-token last-row-long"}
for required in $required_workbooks; do
  test -s "$source_dir/$required.xlsx" || {
    echo "Missing required visual source: $source_dir/$required.xlsx" >&2
    exit 1
  }
done
test -s "$source_dir/visual-fixtures.json"

render_workbook() {
  workbook=$1
  name=$(basename "$workbook" .xlsx)
  profile_dir="/tmp/$task_slug-libreoffice-$name"
  mkdir -p "$profile_dir"
  libreoffice "-env:UserInstallation=file://$profile_dir" --headless \
    --convert-to pdf --outdir "$pdf_dir" "$workbook" \
    >"/tmp/$name-libreoffice.log" 2>&1

  pdf="$pdf_dir/$name.pdf"
  test -s "$pdf"
  pdfinfo "$pdf" > "$text_dir/$name-pdfinfo.txt"
  pdftotext -layout "$pdf" "$text_dir/$name.txt"
  pages=$(awk '/^Pages:/ {print $2}' "$text_dir/$name-pdfinfo.txt")
  worksheets=$(python3 - "$workbook" <<'PY'
from pathlib import Path
import re
import sys
from xml.etree import ElementTree as ET
from zipfile import ZipFile

ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
with ZipFile(Path(sys.argv[1])) as archive:
    count = 0
    for name in archive.namelist():
        if not re.fullmatch(r"xl/worksheets/sheet[0-9]+\.xml", name):
            continue
        sheet = ET.fromstring(archive.read(name))
        dimension = sheet.find("m:dimension", ns)
        if dimension is not None and dimension.attrib.get("ref") not in {"A1", "A1:A1"}:
            count += 1
    print(count)
PY
)
  test "$pages" = "$worksheets" || {
    echo "$name: expected $worksheets pages, got $pages" >&2
    exit 1
  }

  pdftoppm -png -r 200 "$pdf" "$png_dir/$name-page" >/dev/null 2>&1
  page=1
  while [ "$page" -le "$pages" ]; do
    page_info="$text_dir/$name-page-$page-pdfinfo.txt"
    page_text="$text_dir/$name-page-$page.txt"
    pdfinfo -f "$page" -l "$page" "$pdf" > "$page_info"
    page_size=$(awk -F: '/^Page( +[0-9]+)? size:/ {sub(/^[[:space:]]+/, "", $2); print $2}' "$page_info")
    case "$page_size" in
      841.*x*595.*pts*|842.*x*595.*pts*) ;;
      *)
        echo "$name page $page: expected A4 landscape, got $page_size" >&2
        exit 1
        ;;
    esac
    pdftotext -f "$page" -l "$page" -layout "$pdf" "$page_text"
    pdftotext -f "$page" -l "$page" -x 620 -y 20 -W 222 -H 410 \
      -layout "$pdf" "$text_dir/$name-page-$page-destination.txt"
    pdftotext -f "$page" -l "$page" -x 620 -y 20 -W 140 -H 410 \
      -layout "$pdf" "$text_dir/$name-page-$page-destination-n.txt"
    for required_text in "Palletizing Standards" "1.8M" "2.0M" "when stored."; do
      grep -Fq "$required_text" "$page_text" || {
        echo "$name page $page: missing $required_text" >&2
        exit 1
      }
    done

    full_png="$png_dir/$name-page-$page.png"
    python3 - "$name" "$page" "$full_png" "$png_dir" "$geometry_tsv" <<'PY'
from pathlib import Path
import sys
from PIL import Image, ImageChops

name, page, source_name, output_name, tsv_name = sys.argv[1:]
source = Path(source_name)
output = Path(output_name)
with Image.open(source).convert("RGB") as image:
    width, height = image.size
    ink = ImageChops.difference(image, Image.new("RGB", image.size, "white"))
    ink = ink.point(lambda value: 255 if value > 10 else 0)
    bbox = ink.getbbox()
    if bbox is None:
        raise SystemExit(f"{name} page {page}: blank rendered page")
    left_mm = bbox[0] * 25.4 / 200.0
    image.crop((0, 0, max(1, int(width * 0.18)), height)).save(
        output / f"{name}-page-{page}-left-edge.png"
    )
    image.crop((int(width * 0.64), int(height * 0.05), width, int(height * 0.76))).save(
        output / f"{name}-page-{page}-destination-table.png"
    )
    image.crop((0, int(height * 0.57), width, height)).save(
        output / f"{name}-page-{page}-standards.png"
    )
with Path(tsv_name).open("a", encoding="utf-8") as target:
    target.write(f"{name}\t{page}\t{left_mm:.6f}\n")
PY
    page=$((page + 1))
  done

  {
    echo "$name"
    echo "  pages=$pages"
    echo "  populated_worksheets=$worksheets"
    echo "  page_size_each=A4 landscape"
  } >> "$summary"
}

# Render the template first so every generated page is checked against the same
# LibreOffice and fixed 200-DPI baseline.
render_workbook "$source_dir/template.xlsx"
for workbook in "$source_dir"/*.xlsx; do
  test "$(basename "$workbook")" = "template.xlsx" && continue
  render_workbook "$workbook"
done

python3 - "$source_dir" "$text_dir" "$geometry_tsv" "$artifact_dir/geometry.json" <<'PY'
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

source, text, geometry_tsv, output = (Path(item) for item in sys.argv[1:])
manifest = json.loads((source / "visual-fixtures.json").read_text(encoding="utf-8"))
if manifest["layoutReview"] != {
    "errorCodes": ["REPORT_LAYOUT_REVIEW_REQUIRED"],
    "outputPublished": False,
}:
    raise SystemExit("Extreme layout-review fixture did not fail closed.")

rows = []
for line in geometry_tsv.read_text(encoding="utf-8").splitlines():
    name, page, left = line.split("\t")
    rows.append({"workbook": name, "page": int(page), "leftWhitespaceMm": float(left)})
baseline = next(row["leftWhitespaceMm"] for row in rows if row["workbook"] == "template")
generated = [row for row in rows if row["workbook"] != "template"]
for row in generated:
    row["generatedLeftWhitespaceMm"] = row.pop("leftWhitespaceMm")
    row["deltaFromTemplateMm"] = round(
        row["generatedLeftWhitespaceMm"] - baseline, 6
    )
    row["passesTolerance"] = row["deltaFromTemplateMm"] >= -2.0
if not generated or not all(row["passesTolerance"] for row in generated):
    raise SystemExit("A generated page moved more than 2 mm left of the template baseline.")


def _destination_chunks(value):
    chunks = []
    for token in re.findall(r"[A-Za-z0-9]+|[\u3400-\u9fff]+", value):
        if len(token) > 24 or re.fullmatch(r"[\u3400-\u9fff]+", token):
            size = 1
        else:
            size = len(token)
        chunks.extend(
            token[index:index + size] for index in range(0, len(token), size)
        )
    if not chunks:
        raise SystemExit("Destination fixture has no printable identity chunks.")
    return chunks


for name, case in manifest["cases"].items():
    pdfinfo = (text / f"{name}-pdfinfo.txt").read_text(encoding="utf-8")
    pages = int(re.search(r"^Pages:\s+(\d+)$", pdfinfo, re.MULTILINE).group(1))
    if pages != case["worksheetCount"]:
        raise SystemExit(f"{name}: manifest/PDF page mismatch")
    if case["expectedDestinationCount"] != case["writtenDestinationCount"]:
        raise SystemExit(f"{name}: destination conservation mismatch")
    page_evidence = case.get("pageEvidence")
    if page_evidence is not None:
        layout_modes = case.get("layoutModes")
        if layout_modes != [page["layoutMode"] for page in page_evidence]:
            raise SystemExit(f"{name}: layout mode evidence mismatch")
        if sum(page["expectedDestinationCount"] for page in page_evidence) != case[
            "expectedDestinationCount"
        ]:
            raise SystemExit(f"{name}: page expected count mismatch")
        for page in page_evidence:
            count = page["expectedDestinationCount"]
            expected_mode = "PRIMARY_ONLY" if count <= 8 else "EXPANDED"
            expected_rows = (
                list(range(4, 4 + count * 2, 2))
                if count <= 8
                else list(range(4, 4 + count))
            )
            if (
                page["layoutMode"] != expected_mode
                or page["expectedPhysicalRows"] != expected_rows
                or page["writtenPhysicalRows"] != expected_rows
                or page["writtenDestinationCount"] != count
            ):
                raise SystemExit(f"{name}: adaptive physical row evidence mismatch")
    rows_by_page = {}
    for row in case["canonicalRows"]:
        rows_by_page.setdefault(row["page"], []).append(row)
    if [len(rows_by_page.get(page, [])) for page in range(1, pages + 1)] != case["pageRows"]:
        raise SystemExit(f"{name}: destination page distribution mismatch")
    if page_evidence is not None:
        for page in page_evidence:
            actual_rows = [
                row["excelRow"]
                for row in rows_by_page.get(page["page"], [])
            ]
            if actual_rows != page["writtenPhysicalRows"]:
                raise SystemExit(f"{name}: canonical physical rows mismatch")
    for page, expected_rows in rows_by_page.items():
        expected_rows = sorted(expected_rows, key=lambda row: row["excelRow"])
        rendered = (
            text / f"{name}-page-{page}-destination.txt"
        ).read_text(encoding="utf-8")
        n_rendered = (
            text / f"{name}-page-{page}-destination-n.txt"
        ).read_text(encoding="utf-8")
        header_end = rendered.find("CTN")
        cursor = header_end + len("CTN") if header_end >= 0 else 0
        n_header_end = n_rendered.find("DEST")
        n_cursor = n_header_end + len("DEST") if n_header_end >= 0 else 0
        first_chunks = [_destination_chunks(row["destination"])[0] for row in expected_rows]
        for index, row in enumerate(expected_rows):
            chunks = _destination_chunks(row["destination"])
            start = rendered.find(chunks[0], cursor)
            n_start = n_rendered.find(chunks[0], n_cursor)
            if start < 0:
                raise SystemExit(f"{name} page {page}: destination missing from N region")
            if n_start < 0:
                raise SystemExit(f"{name} page {page}: destination missing from N-only region")
            if index + 1 < len(expected_rows):
                end = rendered.find(first_chunks[index + 1], start + len(chunks[0]))
                n_end = n_rendered.find(
                    first_chunks[index + 1],
                    n_start + len(chunks[0]),
                )
                if end < 0:
                    raise SystemExit(f"{name} page {page}: destination order mismatch")
                if n_end < 0:
                    raise SystemExit(f"{name} page {page}: N-only destination order mismatch")
            else:
                end = len(rendered)
                n_end = len(n_rendered)
            row_text = n_rendered[n_start:n_end]
            chunk_cursor = 0
            for chunk in chunks:
                flexible_chunk = r"\s*".join(re.escape(character) for character in chunk)
                match = re.search(flexible_chunk, row_text[chunk_cursor:])
                if match is None:
                    raise SystemExit(
                        f"{name} page {page}: destination text clipped in N region"
                    )
                chunk_cursor += match.end()
            full_row_text = rendered[start:end]
            for value in (row["finalPallets"], row["totalCartons"]):
                if not re.search(rf"(?<!\d){value}(?!\d)", full_row_text):
                    raise SystemExit(
                        f"{name} page {page}: PLT/CTN missing beside destination"
                    )
            cursor = end
            n_cursor = n_end

output.write_text(
    json.dumps(
        {
            "dpi": 200,
            "generatedPages": generated,
            "minimumAllowedDeltaMm": -2.0,
            "templateLeftWhitespaceMm": baseline,
        },
        indent=2,
        sort_keys=True,
    )
    + "\n",
    encoding="utf-8",
)
PY

cat "$summary"
