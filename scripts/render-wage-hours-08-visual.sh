#!/bin/sh
set -eu

artifact_dir=${1:-/workspace/test-results/wage-hours-08/visual}
source_dir="$artifact_dir/source"
pdf_dir="$artifact_dir/pdf"
png_dir="$artifact_dir/png"
text_dir="$artifact_dir/text"
contact_dir="$artifact_dir/contact-sheets"
audit_dir="$artifact_dir/audit"

rm -rf "$pdf_dir" "$png_dir" "$text_dir" "$contact_dir" "$audit_dir"
mkdir -p "$pdf_dir" "$png_dir" "$text_dir" "$contact_dir" "$audit_dir"

for required in \
  deidentified-template.xls \
  deidentified-june-wage-record.xls \
  deidentified-july-wage-record.xls; do
  test -s "$source_dir/$required"
done
test -s "$artifact_dir/visual-fixtures.json"

python3 - "$source_dir" "$audit_dir/structure-style.json" <<'PY'
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path

import xlrd


source = Path(sys.argv[1])
output = Path(sys.argv[2])
paths = {
    "template": source / "deidentified-template.xls",
    "june": source / "deidentified-june-wage-record.xls",
    "july": source / "deidentified-july-wage-record.xls",
}
books = {key: xlrd.open_workbook(path, formatting_info=True) for key, path in paths.items()}
template = books["template"]
for key, book in books.items():
    if book.sheet_names() != template.sheet_names():
        raise SystemExit(f"{key} changed sheet inventory")

def style(book, sheet, row, column):
    xf = book.xf_list[sheet.cell_xf_index(row, column)]
    font = book.font_list[xf.font_index]
    return (
        tuple(sorted((key, str(value)) for key, value in vars(font).items() if key != "font_index")),
        tuple(sorted((key, str(value)) for key, value in vars(xf.background).items())),
        tuple(sorted((key, str(value)) for key, value in vars(xf.border).items())),
        tuple(sorted((key, str(value)) for key, value in vars(xf.alignment).items())),
        book.format_map[xf.format_key].format_str,
    )

style_differences = 0
for key in ("june", "july"):
    book = books[key]
    for index in range(template.nsheets):
        left = template.sheet_by_index(index)
        right = book.sheet_by_index(index)
        if (left.nrows, left.ncols, left.merged_cells) != (right.nrows, right.ncols, right.merged_cells):
            raise SystemExit(f"{key} changed sheet structure")
        for row in range(left.nrows):
            for column in range(left.ncols):
                if style(template, left, row, column) != style(book, right, row, column):
                    style_differences += 1
if style_differences:
    raise SystemExit(f"normalized style differences: {style_differences}")

adjustment_index = template.nsheets - 1
adjustment_hashes = []
for key in ("template", "june", "july"):
    sheet = books[key].sheet_by_index(adjustment_index)
    payload = json.dumps(
        [[sheet.cell_value(r, c) for c in range(sheet.ncols)] for r in range(sheet.nrows)],
        ensure_ascii=False,
    ).encode()
    adjustment_hashes.append(hashlib.sha256(payload).hexdigest())
if len(set(adjustment_hashes)) != 1:
    raise SystemExit("special adjustment sheet changed")

report = {
    "schemaVersion": 1,
    "result": "PASS",
    "sheetCount": template.nsheets,
    "eligibleSheetCount": template.nsheets - 1,
    "normalizedStyleDifferences": 0,
    "specialSheetUnchanged": True,
}
output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY

expected_pages=""
for workbook in \
  "$source_dir/deidentified-template.xls" \
  "$source_dir/deidentified-june-wage-record.xls" \
  "$source_dir/deidentified-july-wage-record.xls"; do
  name=$(basename "$workbook" .xls)
  profile_dir="/tmp/libreoffice-wage-hours-08-$name-$$"
  mkdir -p "$profile_dir"
  libreoffice \
    "-env:UserInstallation=file://$profile_dir" \
    --headless --convert-to pdf --outdir "$pdf_dir" "$workbook" \
    > "$text_dir/$name-libreoffice.log" 2>&1
  pdf="$pdf_dir/$name.pdf"
  test -s "$pdf"
  pdfinfo "$pdf" > "$text_dir/$name-pdfinfo.txt"
  pdftotext -layout "$pdf" "$text_dir/$name.txt"
  pages=$(awk '/^Pages:/ {print $2}' "$text_dir/$name-pdfinfo.txt")
  test "$pages" -ge 3
  if [ -z "$expected_pages" ]; then
    expected_pages=$pages
  elif [ "$pages" != "$expected_pages" ]; then
    echo "Rendered page count changed: $expected_pages -> $pages" >&2
    exit 1
  fi
  grep -Fq "TOTAL HOURS" "$text_dir/$name.txt"
  pdftoppm -png -r 180 "$pdf" "$png_dir/$name-page" >/dev/null 2>&1

  python3 - "$name" "$png_dir" "$contact_dir/$name-all-pages.png" <<'PY'
from pathlib import Path
import sys
from PIL import Image, ImageDraw

name = sys.argv[1]
paths = sorted(Path(sys.argv[2]).glob(f"{name}-page-*.png"))
if not paths:
    raise SystemExit("no rendered pages")
thumbs = []
for path in paths:
    with Image.open(path) as image:
        rendered = image.convert("RGB")
    if rendered.getbbox() is None:
        raise SystemExit(f"blank rendered page: {path}")
    rendered.thumbnail((420, 560), Image.Resampling.LANCZOS)
    thumbs.append((path.name, rendered))
columns = 3
rows = (len(thumbs) + columns - 1) // columns
canvas = Image.new("RGB", (columns * 440, rows * 600), "#d7dbe0")
draw = ImageDraw.Draw(canvas)
for index, (label, image) in enumerate(thumbs):
    row, column = divmod(index, columns)
    x, y = column * 440 + 10, row * 600 + 10
    draw.text((x, y), label, fill="#111827")
    canvas.paste(image, (x, y + 28))
canvas.save(sys.argv[3])
PY
done

grep -Fq "2026.6.1" "$text_dir/deidentified-june-wage-record.txt"
grep -Fq "2026.7.1" "$text_dir/deidentified-july-wage-record.txt"

cat > "$artifact_dir/visual-summary.txt" <<EOF
result=PASS
fixture_classification=DEIDENTIFIED_SYNTHETIC
workbook_count=3
sheet_count=3
eligible_sheet_count=2
normalized_style_differences=0
rendered_pages_each=$expected_pages
visual_review_required=Inspect every original PNG and all three contact sheets.
EOF
cat "$artifact_dir/visual-summary.txt"
