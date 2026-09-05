"""Render a candidate exercise pair for review without touching the bank. Usage: python3 preview.py <name> <RELAXED_POSE> <FLEXED_POSE> <strength|stretch>"""
import sys, cairosvg, figures as F
name, rel, flx, typ = sys.argv[1:5]
col = F.ORANGE if typ == "strength" else F.TEAL
r = F.figure(getattr(F, rel), F.MUTED); f = F.figure(getattr(F, flx), col)
strip = lambda s: s.split("\n", 1)[1].rsplit("</svg>", 1)[0]
W, H = 24 + 2 * 224, 24 + 224 + 30
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#0F1115"/>'
       f'<text x="{24+100}" y="20" fill="#9AA0AB" font-family="DejaVu Sans" font-size="13" text-anchor="middle">RELAXED</text>'
       f'<text x="{24+224+100}" y="20" fill="#9AA0AB" font-family="DejaVu Sans" font-size="13" text-anchor="middle">FLEXED</text>'
       f'<g transform="translate(24,30)">{strip(r)}</g><g transform="translate({24+224},30)">{strip(f)}</g>'
       f'<text x="24" y="{H-8}" fill="#F3F4F6" font-family="DejaVu Sans" font-size="15" font-weight="bold">{name}</text></svg>')
out = f"../docs/mocks/figures/preview/{name.lower().replace(' ', '_')}.png"
cairosvg.svg2png(bytestring=svg.encode(), write_to=out, output_width=W * 2)
print(out)
