"""App icon: orange rounded square with the cobra figure. Writes assets/icons/icon.svg + PNGs."""
import os, cairosvg
from figures import figure, COBRA

out = "../assets/icons"
os.makedirs(out, exist_ok=True)
svg = figure(COBRA, "#141414", bg="#F5A524", floor=False)
svg = svg.replace('rx="24"', 'rx="0"')  # iOS masks its own corners
open(f"{out}/icon.svg", "w").write(svg)
for size in (180, 512):
    cairosvg.svg2png(bytestring=svg.encode(), write_to=f"{out}/icon-{size}.png", output_width=size, output_height=size)
print("icons written")
