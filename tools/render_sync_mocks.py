"""Mock screens for the Dropbox sync feature. Run from tools/: python3 render_sync_mocks.py"""
import cairosvg, os

BG, CARD, CARD2, TXT, SUB, LINE = "#0F1115", "#1C1F26", "#262A33", "#F3F4F6", "#9AA0AB", "#2E323B"
ORANGE, TEAL, RED = "#F5A524", "#2DD4BF", "#F0645C"
F = 'font-family="DejaVu Sans"'
PW, PH = 390, 844
out = "../docs/mocks/screens"; os.makedirs(out, exist_ok=True)

def t(x, y, s, size=16, col=TXT, anchor="start", bold=False, op=1):
    w = ' font-weight="bold"' if bold else ''
    s = s.replace("&", "&amp;").replace("<", "&lt;")
    return f'<text x="{x}" y="{y}" {F} font-size="{size}" fill="{col}" text-anchor="{anchor}"{w} opacity="{op}">{s}</text>'

def rect(x, y, w, h, col=CARD, r=14, op=1, stroke=None):
    st = f' stroke="{stroke}" stroke-width="1.5"' if stroke else ''
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{col}" opacity="{op}"{st}/>'

def frame(title_parts, body, tab=None):
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{PW}" height="{PH}" viewBox="0 0 {PW} {PH}">',
         rect(0, 0, PW, PH, BG, 44),
         t(28, 30, "9:41", 14, TXT, bold=True), t(PW-28, 30, "●●● ▮", 12, TXT, "end"),
         rect(PW/2-60, 12, 120, 30, "#000", 15)]
    s += title_parts + body
    if tab:
        s.append(f'<line x1="0" y1="{PH-84}" x2="{PW}" y2="{PH-84}" stroke="{LINE}"/>')
        s.append(rect(0, PH-84, PW, 84, "#14161C", 0))
        for i, (name, icon) in enumerate((("Plan", "☰"), ("Train", "▶"))):
            x = PW/4 + i*PW/2
            active = name == tab
            col = ORANGE if active else SUB
            s.append(t(x, PH-46, icon, 22, col, "middle"))
            s.append(t(x, PH-24, name, 12, col, "middle", bold=active))
        s.append(rect(PW/2-67, PH-12, 134, 5, TXT, 3))
    s.append("</svg>")
    return "\n".join(s)

def header(title):
    return [t(24, 92, title, 34, TXT, bold=True), t(PW-24, 92, "+", 28, ORANGE, "end")]

def workout_card(x, y, name, dur, sub):
    return [rect(x, y, PW-2*x, 78, CARD, 16),
            t(x+18, y+34, name, 19, TXT, bold=True), t(PW-x-18, y+34, dur, 17, SUB, "end"),
            t(x+18, y+58, sub, 14, SUB)]

def plan_body(workouts):
    body = [t(24, 138, "WORKOUTS", 12, SUB, bold=True)]
    y = 150
    for name, dur, sub in workouts:
        body += workout_card(20, y, name, dur, sub); y += 90
    y += 20
    body += [rect(20, y, PW-40, 60, CARD, 16), t(38, y+36, "Exercise bank", 17, TXT), t(PW-38, y+36, "12  ›", 16, SUB, "end")]
    return body, y + 60

BOTTOM = PH - 84 - 26   # baseline of the sync line, just above the tab bar

def sync_line(y, main, col, sub=None, chevron=True):
    if sub and y == BOTTOM: y -= 22
    p = [t(24, y, main, 15, col)]
    if chevron: p.append(t(PW-24, y, "›", 18, SUB, "end"))
    if sub: p.append(t(24, y+22, sub, 13, SUB))
    return p

def toast(text):
    w = min(PW-40, 40 + len(text)*7.2)
    return [rect(PW/2-w/2, PH-196, w, 40, CARD2, 12), t(PW/2, PH-170, text, 14, TXT, "middle")]

THREE = [("Morning", "4:50", "2 strength · 2 stretch"), ("Evening", "6:10", "3 strength · 2 stretch"), ("Short", "2:30", "1 strength · 1 stretch")]
SEED = [("Morning", "4:50", "2 strength · 2 stretch")]

# S1 not connected
body, y = plan_body(THREE)
body += sync_line(BOTTOM, "Connect Dropbox", ORANGE, "Workouts are only on this phone", chevron=False)
open(f"{out}/S1_not_connected.svg", "w").write(frame(header("Plan"), body, "Plan"))

# S2 connected, synced
body, y = plan_body(THREE)
body += sync_line(BOTTOM, "Synced to Dropbox · today 07:12", SUB)
open(f"{out}/S2_synced.svg", "w").write(frame(header("Plan"), body, "Plan"))

# S2b the four states of the line, as a swatch
body = [t(24, 130, "STATES OF THE SYNC LINE", 12, SUB, bold=True)]
states = [("Synced to Dropbox · today 07:12", SUB, None, "after every successful save"),
          ("Saving to Dropbox…", SUB, None, "a push is in flight"),
          ("Offline · will sync when online", SUB, None, "no connectivity, changes queued"),
          ("Sync failed · tap to retry", ORANGE, None, "push kept failing while online"),
          ("Connect Dropbox", ORANGE, "Workouts are only on this phone", "never connected, or disconnected")]
y = 160
for main, col, sub, note in states:
    body += [rect(20, y, PW-40, 84 if sub else 64, CARD, 14)]
    body += sync_line(y+36, main, col, sub, chevron=(col == SUB or "failed" in main))
    body[-1:] = body[-1:]
    body.append(t(PW-24, y+(74 if sub else 54), note, 12, SUB, "end", op=0.8))
    y += (84 if sub else 64) + 12
open(f"{out}/S2b_states.svg", "w").write(frame(header("Plan"), body, "Plan"))

# S3 confirm alert (native iOS confirm)
body, y = plan_body(THREE)
body += sync_line(BOTTOM, "Synced to Dropbox · today 07:12", SUB)
body.append(rect(0, 0, PW, PH, "#000", 44, 0.5))
ax, ay, aw, ah = PW/2-135, 330, 270, 150
body += [rect(ax, ay, aw, ah, "#2A2D35", 14),
         t(PW/2, ay+38, "Load a saved configuration?", 16, TXT, "middle", bold=True),
         t(PW/2, ay+62, "Your current workouts will be kept", 13, SUB, "middle"),
         t(PW/2, ay+80, "in Dropbox as a new .bak file first.", 13, SUB, "middle"),
         f'<line x1="{ax}" y1="{ay+ah-44}" x2="{ax+aw}" y2="{ay+ah-44}" stroke="{LINE}"/>',
         f'<line x1="{PW/2}" y1="{ay+ah-44}" x2="{PW/2}" y2="{ay+ah}" stroke="{LINE}"/>',
         t(ax+aw/4, ay+ah-16, "Cancel", 16, "#4C9BFF", "middle"),
         t(ax+3*aw/4, ay+ah-16, "Choose", 16, "#4C9BFF", "middle", bold=True)]
open(f"{out}/S3_confirm.svg", "w").write(frame(header("Plan"), body, "Plan"))

# S4 config list sheet
body, y = plan_body(THREE)
body += sync_line(BOTTOM, "Synced to Dropbox · today 07:12", SUB)
body.append(rect(0, 0, PW, PH, "#000", 44, 0.55))
sh = 520; sy = PH - sh
body += [rect(0, sy, PW, sh, CARD, 24), rect(PW/2-20, sy+10, 40, 5, LINE, 3),
         t(24, sy+52, "Saved configurations", 20, TXT, bold=True),
         t(24, sy+76, "Dropbox / Apps / fitapp", 14, SUB)]
rows = [("fitapp.cfg", "current", "today 07:12", "3 workouts · Morning, Evening, Short"),
        ("fitapp.cfg.bak.3", None, "5 Sep 2026 06:58", "3 workouts · Morning, Evening, Short"),
        ("fitapp.cfg.bak.2", None, "4 Sep 2026 22:15", "1 workout · Morning"),
        ("fitapp.cfg.bak.1", None, "4 Sep 2026 18:40", "2 workouts · Morning A, Morning B")]
ry = sy + 96
for name, tag, when, detail in rows:
    body += [rect(20, ry, PW-40, 72, CARD2, 14), t(38, ry+28, name, 16, TXT, bold=True)]
    if tag:
        body += [rect(154, ry+13, 62, 22, CARD, 6), t(185, ry+29, tag, 12, TEAL, "middle", bold=True)]
    body += [t(PW-38, ry+28, when, 13, SUB, "end"), t(38, ry+52, detail, 13, SUB)]
    ry += 80
body += [t(PW/2, ry+30, "Disconnect Dropbox", 14, SUB, "middle"),
         rect(20, ry+50, PW-40, 44, CARD2, 12), t(PW/2, ry+78, "Cancel", 16, TXT, "middle", bold=True),
         rect(PW/2-67, PH-12, 134, 5, TXT, 3)]
open(f"{out}/S4_config_list.svg", "w").write(frame(header("Plan"), body))

# S5 after reinstall: seed loaded, connected, old file archived, toast
body, y = plan_body(SEED)
body += sync_line(BOTTOM, "Synced to Dropbox · today 07:30", SUB)
body += toast("Previous Dropbox config kept as fitapp.cfg.bak.4")
open(f"{out}/S5_reinstall.svg", "w").write(frame(header("Plan"), body, "Plan"))

# S6 after loading a config
body, y = plan_body(THREE)
body += sync_line(BOTTOM, "Synced to Dropbox · today 07:31", SUB)
body += toast("Loaded fitapp.cfg.bak.4 · 3 workouts")
open(f"{out}/S6_loaded.svg", "w").write(frame(header("Plan"), body, "Plan"))

names = sorted(n for n in os.listdir(out) if n.startswith("S") and n.endswith(".svg"))
for n in names:
    cairosvg.svg2png(url=f"{out}/{n}", write_to=f"{out}/{n[:-4]}.png", output_width=PW*2)

def sheet(fname, items, cols):
    gap, lab = 30, 40
    rows = (len(items)+cols-1)//cols
    W = gap + cols*(PW+gap); H = gap + rows*(PH+lab+gap)
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#06070A"/>']
    for i, (n, label) in enumerate(items):
        x = gap + (i%cols)*(PW+gap); y = gap + (i//cols)*(PH+lab+gap)
        s.append(t(x, y+26, label, 18, "#C9CDD4", bold=True))
        inner = open(f"{out}/{n}.svg").read().split("\n", 1)[1].rsplit("</svg>", 1)[0]
        s.append(f'<g transform="translate({x},{y+lab})">{inner}</g>')
    s.append("</svg>")
    open(f"{out}/{fname}.svg", "w").write("\n".join(s))
    cairosvg.svg2png(url=f"{out}/{fname}.svg", write_to=f"{out}/{fname}.png", output_width=W*1.5)
sheet("_sync_screens", [("S1_not_connected", "S1 Not connected"), ("S2_synced", "S2 Connected"), ("S2b_states", "S2 Line states"),
                        ("S3_confirm", "S3 Tap the line"), ("S4_config_list", "S4 Pick a config"), ("S5_reinstall", "S5 After reinstall"),
                        ("S6_loaded", "S6 After loading")], 4)
print("done", len(names))
