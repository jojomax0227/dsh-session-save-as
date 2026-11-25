"""Report the leftmost dark pixel of each text row band, to check alignment."""

import sys

from PIL import Image

path = sys.argv[1]
y0, y1 = int(sys.argv[2]), int(sys.argv[3])

image = Image.open(path).convert("L")
width, height = image.size
pixels = image.load()

rows = []
for y in range(y0, min(y1, height)):
    left = None
    for x in range(0, width):
        if pixels[x, y] < 140:
            left = x
            break
    rows.append((y, left))

# Collapse consecutive rows that share a left edge into bands.
bands = []
for y, left in rows:
    if left is None:
        continue
    if bands and y == bands[-1][1] + 1 and abs((left or 0) - (bands[-1][2] or 0)) <= 2:
        bands[-1] = (bands[-1][0], y, bands[-1][2])
    else:
        bands.append((y, y, left))

for start, end, left in bands:
    print(f"y {start}-{end}: leftmost dark x = {left}")
