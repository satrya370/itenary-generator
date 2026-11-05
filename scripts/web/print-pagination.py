import json, pathlib, re, sys
import pymupdf

root = pathlib.Path("output/web-foundation")
locale_dir = pathlib.Path("config/web/locales")
SECTION_KEYS = (
    "modeHalfDay", "modeFullDay", "modeMultiDay", "modeDestinationGuide",
    "tripOverview", "practicalInfo", "exploreDestinations", "closingHeading",
)
labels = {}
for path in locale_dir.glob("*.json"):
    data = json.loads(path.read_text(encoding="utf-8")).get("labels", {})
    labels[path.stem] = {data[key] for key in SECTION_KEYS if key in data}

report = {"pages": {}, "failures": []}
for pdf_path in sorted(root.glob("*.pdf")):
    fixture = pdf_path.stem
    locale = "en"
    if fixture.startswith("full-day-"):
        locale = fixture[len("full-day-"):]
    elif fixture.startswith("guide-") and fixture != "guide-many-en":
        locale = fixture[len("guide-"):]
    heading_labels = labels.get(locale, set())
    doc = pymupdf.open(pdf_path)
    report["pages"][fixture] = len(doc)
    pages_lines = []
    for page in doc:
        lines = []
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                text = "".join(span["text"] for span in line["spans"]).strip()
                if text:
                    lines.append((line["bbox"][3], text))
        lines.sort()
        pages_lines.append(lines)
    for index, lines in enumerate(pages_lines):
        page_number = index + 1
        if len(lines) < 2:
            report["failures"].append(f"{fixture}: page {page_number} has only {len(lines)} line(s)")
        if not lines:
            continue
        height = doc[index].rect.height
        bottom_y, bottom_text = lines[-1]
        is_heading = bottom_text in heading_labels or re.match(r"^Day \d+", bottom_text) or re.match(r"^DAY \d+", bottom_text)
        if is_heading:
            report["failures"].append(f"{fixture}: heading '{bottom_text}' stranded at the bottom of page {page_number}")
        elif bottom_y > height * 0.85 and index + 1 < len(pages_lines):
            next_first = pages_lines[index + 1][0][1] if pages_lines[index + 1] else ""
            if next_first == bottom_text:
                report["failures"].append(f"{fixture}: '{bottom_text}' split across the page {page_number} boundary")
    doc.close()

print(json.dumps(report, indent=2))
sys.exit(1 if report["failures"] else 0)
