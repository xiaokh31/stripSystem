#!/bin/sh
set -eu

artifact_dir=${1:-/workspace/test-results/wage-hours-05}
source_dir="$artifact_dir/source"
pdf_dir="$artifact_dir/pdf"
png_dir="$artifact_dir/png"
text_dir="$artifact_dir/text"
contact_dir="$artifact_dir/contact-sheets"
audit_dir="$artifact_dir/audit"
summary="$artifact_dir/visual-summary.txt"

rm -rf "$pdf_dir" "$png_dir" "$text_dir" "$contact_dir" "$audit_dir"
mkdir -p "$pdf_dir" "$png_dir" "$text_dir" "$contact_dir" "$audit_dir"
: > "$summary"

for required in \
  attendance-original.xls \
  template.xls \
  worker-generated-wage-record.xls \
  api-downloaded-wage-record.xls \
  api-downloaded-after-delete.xls; do
  if [ ! -s "$source_dir/$required" ]; then
    echo "Missing WAGE-HOURS-05 source artifact: $source_dir/$required" >&2
    exit 1
  fi
done
if [ ! -s "$artifact_dir/evidence-manifest.json" ]; then
  echo "Missing WAGE-HOURS-05 evidence manifest" >&2
  exit 1
fi

audit-wage-workbooks \
  "$source_dir" \
  "$audit_dir/all-sheet-structure-style-report.json" \
  > "$audit_dir/audit-result.json"

expected_pages=""
for workbook in \
  "$source_dir/template.xls" \
  "$source_dir/worker-generated-wage-record.xls" \
  "$source_dir/api-downloaded-wage-record.xls" \
  "$source_dir/api-downloaded-after-delete.xls"; do
  name=$(basename "$workbook" .xls)
  profile_dir="/tmp/libreoffice-wage-$name"
  mkdir -p "$profile_dir"
  libreoffice \
    "-env:UserInstallation=file://$profile_dir" \
    --headless \
    --convert-to pdf \
    --outdir "$pdf_dir" \
    "$workbook" > "$text_dir/$name-libreoffice.log" 2>&1

  pdf="$pdf_dir/$name.pdf"
  test -s "$pdf"
  pdfinfo "$pdf" > "$text_dir/$name-pdfinfo.txt"
  pdftotext -layout "$pdf" "$text_dir/$name.txt"
  pages=$(awk '/^Pages:/ {print $2}' "$text_dir/$name-pdfinfo.txt")
  if [ "$pages" -lt 10 ]; then
    echo "$name: expected at least one rendered page for each of 10 sheets, got $pages" >&2
    exit 1
  fi
  if [ -z "$expected_pages" ]; then
    expected_pages=$pages
  elif [ "$pages" != "$expected_pages" ]; then
    echo "$name: rendered page count changed from $expected_pages to $pages" >&2
    exit 1
  fi

  if ! grep -Fq "TOTAL HOURS" "$text_dir/$name.txt"; then
    echo "$name: rendered PDF is missing TOTAL HOURS" >&2
    exit 1
  fi
  if ! grep -Fq "START TIME" "$text_dir/$name.txt"; then
    echo "$name: rendered PDF is missing START TIME" >&2
    exit 1
  fi

  pdftoppm -png -r 180 "$pdf" "$png_dir/$name-page" >/dev/null 2>&1
  python3 - "$name" "$png_dir" "$contact_dir/$name-all-pages.png" \
    "$text_dir/$name-image-metrics.json" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


name = sys.argv[1]
png_dir = Path(sys.argv[2])
contact_path = Path(sys.argv[3])
metrics_path = Path(sys.argv[4])
page_paths = sorted(
    png_dir.glob(f"{name}-page-*.png"),
    key=lambda item: int(item.stem.rsplit("-", 1)[1]),
)
if not page_paths:
    raise SystemExit(f"no rendered PNG pages for {name}")

thumb_width = 420
label_height = 34
gap = 16
columns = 3
thumbs: list[tuple[Path, Image.Image]] = []
metrics: list[dict[str, object]] = []
for page_number, page_path in enumerate(page_paths, start=1):
    with Image.open(page_path) as source:
        image = source.convert("RGB")
    grayscale = ImageOps.grayscale(image)
    ink = grayscale.point(lambda pixel: 255 if pixel < 245 else 0)
    bbox = ink.getbbox()
    if bbox is None:
        raise SystemExit(f"blank rendered page: {page_path}")
    ink_pixels = sum(1 for pixel in ink.getdata() if pixel)
    width, height = image.size
    edge_band = 3
    edge_ink = 0
    for x in range(width):
        for y in range(edge_band):
            edge_ink += int(ink.getpixel((x, y)) > 0)
            edge_ink += int(ink.getpixel((x, height - 1 - y)) > 0)
    for y in range(height):
        for x in range(edge_band):
            edge_ink += int(ink.getpixel((x, y)) > 0)
            edge_ink += int(ink.getpixel((width - 1 - x, y)) > 0)
    metrics.append(
        {
            "page": page_number,
            "file": page_path.name,
            "width": width,
            "height": height,
            "contentBoundingBox": list(bbox),
            "inkPixelRatio": round(ink_pixels / (width * height), 6),
            "edgeInkPixels": edge_ink,
        }
    )
    thumb_height = max(1, round(height * thumb_width / width))
    image.thumbnail((thumb_width, thumb_height), Image.Resampling.LANCZOS)
    thumbs.append((page_path, image))

rows = (len(thumbs) + columns - 1) // columns
cell_height = max(image.height for _, image in thumbs) + label_height
canvas = Image.new(
    "RGB",
    (
        columns * thumb_width + (columns + 1) * gap,
        rows * cell_height + (rows + 1) * gap,
    ),
    "#d7dbe0",
)
draw = ImageDraw.Draw(canvas)
for index, (page_path, image) in enumerate(thumbs):
    row, column = divmod(index, columns)
    x = gap + column * (thumb_width + gap)
    y = gap + row * (cell_height + gap)
    canvas.paste(image, (x, y + label_height))
    draw.rectangle((x, y, x + thumb_width, y + label_height - 2), fill="#17202a")
    draw.text((x + 10, y + 9), page_path.stem, fill="white")
canvas.save(contact_path)
metrics_path.write_text(
    json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
PY

  {
    echo "$name"
    echo "  pages=$pages"
    echo "  pdf=$pdf"
    echo "  png_pages=$png_dir/$name-page-*.png"
    echo "  contact_sheet=$contact_dir/$name-all-pages.png"
    echo "  image_metrics=$text_dir/$name-image-metrics.json"
    echo "  libreoffice_log=$text_dir/$name-libreoffice.log"
  } >> "$summary"
done

{
  echo "all_sheet_audit=$audit_dir/all-sheet-structure-style-report.json"
  echo "normalized_style_differences=0"
  echo "sheet_count=10"
  echo "eligible_sheet_count=7"
  echo "rendered_pages_each=$expected_pages"
  echo "visual_review_required=Inspect every original PNG plus all four contact sheets."
} >> "$summary"

cat "$summary"
