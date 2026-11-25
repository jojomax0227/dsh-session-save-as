"""Crop regions of the rendered PDF page for close inspection."""

import sys

from PIL import Image

source, target = sys.argv[1], sys.argv[2]
box = tuple(int(value) for value in sys.argv[3].split(","))
scale = float(sys.argv[4]) if len(sys.argv) > 4 else 2.0

image = Image.open(source)
crop = image.crop(box)
crop = crop.resize((int(crop.width * scale), int(crop.height * scale)), Image.LANCZOS)
crop.save(target)
print(crop.size)
