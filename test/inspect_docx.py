"""Inspect the generated .docx with python-docx and validate the ZIP package."""

import sys
import zipfile

import docx

path = sys.argv[1]

with zipfile.ZipFile(path) as archive:
    names = archive.namelist()
    print("entries:", names)
    bad = archive.testzip()
    print("testzip:", bad)
    for name in names:
        info = archive.getinfo(name)
        print(f"  {name}: {info.file_size} bytes, deflated={info.compress_type}")

document = docx.Document(path)
print("paragraphs:", len(document.paragraphs))
for paragraph in document.paragraphs:
    if paragraph.text.strip() == "":
        continue
    print(f"[{paragraph.style.name}] {paragraph.text[:100]}")

core = document.core_properties
print("core.title:", core.title)
print("core.creator:", core.creator)
