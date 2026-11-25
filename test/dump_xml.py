"""Print the paragraph XML of the generated document, indented for reading."""

import sys
import zipfile
from xml.dom import minidom

path = sys.argv[1]
with zipfile.ZipFile(path) as archive:
    data = archive.read("word/document.xml")

pretty = minidom.parseString(data).toprettyxml(indent="  ")
lines = [line for line in pretty.splitlines() if line.strip()]
print("\n".join(lines))
