import cairosvg, os
from figures import EXERCISES, svg_pair, MUTED

out = "../assets/figures"
sheet_dir = "../docs/mocks/figures"
os.makedirs(out, exist_ok=True); os.makedirs(sheet_dir, exist_ok=True)
cells = []
for ex in EXERCISES:
    _id, name, t, sided, secs, rest, *_ = ex
    r, f = svg_pair(ex)
    for tag, svg in (("relaxed", r), ("flexed", f)):
        p = f"{out}/{_id}_{tag}.svg"
        open(p, "w").write(svg)
        cairosvg.svg2png(bytestring=svg.encode(), write_to=f"{sheet_dir}/{_id}_{tag}.png", output_width=400)
    cells.append((name, t, sided, secs, rest, r, f))

# contact sheet: one row per exercise, relaxed + flexed
row_h, col_w, pad = 230, 230, 24
label_w = 330
W, H = pad + label_w + 2 * col_w + pad, pad + len(cells) * row_h + pad
sheet = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
         f'<rect width="{W}" height="{H}" fill="#0F1115"/>',
         f'<text x="{pad+label_w+100}" y="{pad-4}" fill="#9AA0AB" font-family="DejaVu Sans" font-size="14" text-anchor="middle">RELAXED</text>',
         f'<text x="{pad+label_w+col_w+100}" y="{pad-4}" fill="#9AA0AB" font-family="DejaVu Sans" font-size="14" text-anchor="middle">FLEXED</text>']
for i, (name, t, sided, secs, rest, r, f) in enumerate(cells):
    y = pad + i * row_h + 10
    col = "#F5A524" if t == "strength" else "#2DD4BF"
    sheet.append(f'<text x="{pad}" y="{y+90}" fill="#F3F4F6" font-family="DejaVu Sans" font-size="24" font-weight="bold">{name}</text>')
    sheet.append(f'<text x="{pad}" y="{y+118}" fill="{col}" font-family="DejaVu Sans" font-size="15">{t.capitalize()}{" · L/R" if sided else ""} · {secs}s + {rest}s rest</text>')
    for j, svg in enumerate((r, f)):
        inner = svg.replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">', '').replace('</svg>', '')
        x = pad + label_w + j * col_w
        sheet.append(f'<g transform="translate({x},{y})">{inner}</g>')
sheet.append("</svg>")
s = "\n".join(sheet)
open(f"{sheet_dir}/_all_figures.svg", "w").write(s)
cairosvg.svg2png(bytestring=s.encode(), write_to=f"{sheet_dir}/_all_figures.png", output_width=W*2)
print("figures:", len(cells) * 2, "sheet", W, H)
