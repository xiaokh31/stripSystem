#!/bin/sh
set -eu

artifact_dir=${1:-}
case "$artifact_dir" in
  /workspace/test-results/unload-report-02/*) ;;
  *)
    echo "UNLOAD-REPORT-02 artifact path must be a unique run directory." >&2
    exit 1
    ;;
esac

source_dir="$artifact_dir/source"
pdf_dir="$artifact_dir/pdf"
png_dir="$artifact_dir/png"
text_dir="$artifact_dir/text"
summary="$artifact_dir/visual-verification.txt"

for output_dir in "$pdf_dir" "$png_dir" "$text_dir"; do
  if [ -e "$output_dir" ]; then
    echo "Refusing to reuse visual output directory: $output_dir" >&2
    exit 1
  fi
done
mkdir -p "$pdf_dir" "$png_dir" "$text_dir"
: > "$summary"

for required_workbook in \
  template.xlsx \
  worker-generated-report.xlsx \
  api-downloaded-report.xlsx \
  long-english.xlsx \
  long-cjk.xlsx \
  multiline.xlsx \
  boundary-16-long.xlsx \
  height-overflow.xlsx; do
  if [ ! -s "$source_dir/$required_workbook" ]; then
    echo "Missing required visual source: $source_dir/$required_workbook" >&2
    exit 1
  fi
done

found=0
for workbook in "$source_dir"/*.xlsx; do
  if [ ! -f "$workbook" ]; then
    continue
  fi
  found=1
  name=$(basename "$workbook" .xlsx)
  profile_dir="/tmp/unload-report-02-libreoffice-$name"
  mkdir -p "$profile_dir"

  libreoffice \
    "-env:UserInstallation=file://$profile_dir" \
    --headless \
    --convert-to pdf \
    --outdir "$pdf_dir" \
    "$workbook" >"/tmp/$name-libreoffice.log" 2>&1

  pdf="$pdf_dir/$name.pdf"
  test -s "$pdf"
  pdfinfo "$pdf" > "$text_dir/$name-pdfinfo.txt"
  pdftotext -layout "$pdf" "$text_dir/$name.txt"
  pages=$(awk '/^Pages:/ {print $2}' "$text_dir/$name-pdfinfo.txt")
  worksheet_count=$(python3 - "$workbook" <<'PY'
from pathlib import Path
import re
import sys
from xml.etree import ElementTree as ET
from zipfile import ZipFile

ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
with ZipFile(Path(sys.argv[1])) as archive:
    printable = 0
    for name in archive.namelist():
        if not re.fullmatch(r"xl/worksheets/sheet[0-9]+\.xml", name):
            continue
        sheet = ET.fromstring(archive.read(name))
        dimension = sheet.find("m:dimension", ns)
        if dimension is not None and dimension.attrib.get("ref") not in {"A1", "A1:A1"}:
            printable += 1
    print(printable)
PY
  )

  if [ "$pages" != "$worksheet_count" ]; then
    echo "$name: expected one PDF page per populated worksheet ($worksheet_count), got $pages" >&2
    exit 1
  fi
  if [ "$worksheet_count" -lt 1 ]; then
    echo "$name: no populated worksheet found" >&2
    exit 1
  fi

  page=1
  while [ "$page" -le "$pages" ]; do
    page_text="$text_dir/$name-page-$page.txt"
    page_pdfinfo="$text_dir/$name-page-$page-pdfinfo.txt"
    pdfinfo -f "$page" -l "$page" "$pdf" > "$page_pdfinfo"
    page_size=$(awk -F: '/^Page( +[0-9]+)? size:/ {sub(/^[[:space:]]+/, "", $2); print $2}' "$page_pdfinfo")
    case "$page_size" in
      841.*x*595.*pts*|842.*x*595.*pts*) ;;
      *)
        echo "$name page $page: expected A4 landscape page size, got $page_size" >&2
        exit 1
        ;;
    esac
    pdftotext -f "$page" -l "$page" -layout "$pdf" "$page_text"
    for required_text in \
      "Palletizing Standards" "1.8M" "2.0M" "YEG1" "YYC6" "when stored."; do
      if ! grep -Fq "$required_text" "$page_text"; then
        echo "$name page $page: missing $required_text in rendered PDF text" >&2
        exit 1
      fi
    done
    page=$((page + 1))
  done

  case "$name" in
    long-english)
      grep -Fq "Private Address" "$text_dir/$name.txt"
      grep -Fq "Appointment" "$text_dir/$name.txt"
      grep -Fq "Required" "$text_dir/$name.txt"
      ;;
    long-cjk)
      grep -Fq "贵司卡尔加里仓" "$text_dir/$name.txt"
      grep -Fq "提前预约" "$text_dir/$name.txt"
      ;;
    multiline)
      grep -Fq "YYC4 Receiving" "$text_dir/$name.txt"
      grep -Fq "Door A Appointment" "$text_dir/$name.txt"
      grep -Fq "Contact Before" "$text_dir/$name.txt"
      grep -Fq "Arrival" "$text_dir/$name.txt"
      ;;
    boundary-16-long)
      grep -Fq "BOUNDARY-15" "$text_dir/$name.txt"
      grep -Fq "FINAL-ROW-LONG-" "$text_dir/$name.txt"
      grep -Fq "TOKEN-END" "$text_dir/$name.txt"
      ;;
    height-overflow)
      grep -Fq "HEIGHT-01" "$text_dir/$name.txt"
      grep -Fq "HEIGHT-16" "$text_dir/$name.txt"
      if [ "$pages" -le 1 ]; then
        echo "$name: expected content-aware early pagination" >&2
        exit 1
      fi
      ;;
  esac

  pdftoppm -png -r 200 "$pdf" "$png_dir/$name-page" >/dev/null 2>&1
  for full_png in "$png_dir/$name-page"-*.png; do
    case "$full_png" in
      *-standards.png|*-table.png) continue ;;
    esac
    page_name=$(basename "$full_png" .png)
    standards_png="$png_dir/$page_name-standards.png"
    table_png="$png_dir/$page_name-table.png"
    python3 - "$full_png" "$standards_png" "$table_png" <<'PY'
from pathlib import Path
import sys
from PIL import Image

source = Path(sys.argv[1])
standards = Path(sys.argv[2])
table = Path(sys.argv[3])
with Image.open(source) as image:
    width, height = image.size
    image.crop((0, int(height * 0.57), width, height)).save(standards)
    image.crop((0, int(height * 0.07), width, int(height * 0.76))).save(table)
PY
  done

  {
    echo "$name"
    echo "  pages=$pages"
    echo "  populated_worksheets=$worksheet_count"
    echo "  page_size_each=A4 landscape"
    echo "  pdf=$pdf"
    echo "  text=$text_dir/$name.txt"
    echo "  png_prefix=$png_dir/$name-page"
  } >> "$summary"
done

if [ "$found" -ne 1 ]; then
  echo "No source .xlsx files found in $source_dir" >&2
  exit 1
fi

cat "$summary"
