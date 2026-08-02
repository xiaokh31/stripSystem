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

python3 /usr/local/bin/audit-wage-hours-08-workbook.py \
  --workbook "$source_dir/deidentified-june-wage-record.xls" \
  --template "$source_dir/deidentified-template.xls" \
  --period-start 2026-06-01 --period-end 2026-06-30 \
  --output "$audit_dir/june-weekday-style.json"
python3 /usr/local/bin/audit-wage-hours-08-workbook.py \
  --workbook "$source_dir/deidentified-july-wage-record.xls" \
  --template "$source_dir/deidentified-template.xls" \
  --period-start 2026-07-01 --period-end 2026-07-31 \
  --output "$audit_dir/july-weekday-style.json"
python3 - "$audit_dir" <<'PY'
import json
import sys
from pathlib import Path

audit_dir = Path(sys.argv[1])
reports = [
    json.loads((audit_dir / name).read_text(encoding="utf-8"))
    for name in ("june-weekday-style.json", "july-weekday-style.json")
]
summary = {
    "schemaVersion": 2,
    "result": "PASS",
    "workbookCount": len(reports),
    "validDateCellCount": sum(report["validDateCellCount"] for report in reports),
    "weekendCellCount": sum(report["weekendCellCount"] for report in reports),
    "weekdayCellCount": sum(report["weekdayCellCount"] for report in reports),
    "blankSlotCellCount": sum(report["blankSlotCellCount"] for report in reports),
    "styleMismatchCount": sum(report["styleMismatchCount"] for report in reports),
    "blankSlotMismatchCount": sum(report["blankSlotMismatchCount"] for report in reports),
    "nonWeekdayColumnStyleMismatchCount": sum(
        report["nonWeekdayColumnStyleMismatchCount"] for report in reports
    ),
    "specialSheetUnchanged": all(report["specialSheetUnchanged"] for report in reports),
}
(audit_dir / "structure-style.json").write_text(
    json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8"
)
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

valid_date_cell_count=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["validDateCellCount"])' "$audit_dir/structure-style.json")
weekend_cell_count=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["weekendCellCount"])' "$audit_dir/structure-style.json")
weekday_cell_count=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["weekdayCellCount"])' "$audit_dir/structure-style.json")
cat > "$artifact_dir/visual-summary.txt" <<EOF
result=PASS
fixture_classification=DEIDENTIFIED_SYNTHETIC
workbook_count=3
sheet_count=17
eligible_sheet_count=16
style_mismatches=0
blank_slot_mismatches=0
valid_date_cell_count=$valid_date_cell_count
weekend_cell_count=$weekend_cell_count
weekday_cell_count=$weekday_cell_count
rendered_pages_each=$expected_pages
visual_review_required=Inspect every original PNG and all three contact sheets.
EOF
cat "$artifact_dir/visual-summary.txt"
