import cairosvg, os
from figures import EXERCISES, figure, MUTED, ORANGE, TEAL, colour_for

BG, CARD, CARD2, TXT, SUB, LINE = "#0F1115", "#1C1F26", "#262A33", "#F3F4F6", "#9AA0AB", "#2E323B"
F = 'font-family="DejaVu Sans"'
PW, PH = 390, 844
EX = {e[0]: e for e in EXERCISES}
out = "../screens"; os.makedirs(out, exist_ok=True)

def t(x, y, s, size=16, col=TXT, anchor="start", bold=False, op=1):
    w = ' font-weight="bold"' if bold else ''
    s = s.replace("&", "&amp;").replace("<", "&lt;")
    return f'<text x="{x}" y="{y}" {F} font-size="{size}" fill="{col}" text-anchor="{anchor}"{w} opacity="{op}">{s}</text>'

def rect(x, y, w, h, col=CARD, r=14, op=1, stroke=None):
    st = f' stroke="{stroke}" stroke-width="1.5"' if stroke else ''
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{col}" opacity="{op}"{st}/>'

def fig(ex_id, which, x, y, size, bg=CARD):
    e = EX[ex_id]
    pose = e[6] if which == "relaxed" else e[7]
    col = MUTED if which == "relaxed" else colour_for(e[2])
    inner = figure(pose, col, bg).split("\n", 1)[1].rsplit("</svg>", 1)[0]
    sc = size / 200
    return f'<g transform="translate({x},{y}) scale({sc})">{inner}</g>'

def frame(title_parts, body, tab=None):
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{PW}" height="{PH}" viewBox="0 0 {PW} {PH}">',
         rect(0, 0, PW, PH, BG, 44),
         # status bar
         t(28, 30, "9:41", 14, TXT, bold=True), t(PW-28, 30, "●●● ▮", 12, TXT, "end"),
         rect(PW/2-60, 12, 120, 30, "#000", 15)]  # dynamic island
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
        s.append(rect(PW/2-67, PH-12, 134, 5, TXT, 3))  # home indicator
    s.append("</svg>")
    return "\n".join(s)

def header(title, left=None, right=None, big=False):
    p = []
    if big:
        p.append(t(24, 92, title, 34, TXT, bold=True))
    else:
        p.append(t(PW/2, 84, title, 17, TXT, "middle", bold=True))
    if left: p.append(t(24, 84, left, 17, ORANGE))
    if right: p.append(t(PW-24, 84 if not big else 92, right, 28 if right == "+" else 17, ORANGE, "end"))
    return p

def workout_card(x, y, name, dur, sub, start=False):
    h = 120 if start else 78
    p = [rect(x, y, PW-2*x, h, CARD, 16),
         t(x+18, y+34, name, 19, TXT, bold=True), t(PW-x-18, y+34, dur, 17, SUB, "end"),
         t(x+18, y+58, sub, 14, SUB)]
    if start:
        p += [rect(x+18, y+74, PW-2*x-36, 34, ORANGE, 10), t(PW/2, y+97, "▶  Start", 16, "#111", "middle", bold=True)]
    return p

def step_row(y, n, ex_id, secs, rest):
    e = EX[ex_id]
    p = [t(24, y+30, "≡", 18, SUB), t(50, y+30, f"{n}", 15, SUB),
         fig(ex_id, "flexed", 72, y+3, 42, CARD2), t(126, y+30, e[1], 17, TXT)]
    if e[3]: p.append(rect(226, y+11, 34, 22, CARD2, 6)); p.append(t(243, y+27, "L/R", 12, TEAL, "middle", bold=True))
    p += [t(PW-84, y+30, f"{secs}s", 16, TXT, "end"),
          t(PW-46, y+30, f"+{rest}s", 13, SUB, "end", op=0.7),       # rest, greyed
          t(PW-24, y+30, "›", 18, SUB, "end"),
          f'<line x1="24" y1="{y+48}" x2="{PW-24}" y2="{y+48}" stroke="{LINE}"/>']
    return p

def bank_row(y, ex_id, pick=False):
    e = EX[ex_id]
    p = [fig(ex_id, "flexed", 24, y+4, 48, CARD2), t(86, y+34, e[1], 17, TXT)]
    if e[3]: p.append(rect(PW-158, y+17, 34, 22, CARD2, 6)); p.append(t(PW-141, y+33, "L/R", 12, TEAL, "middle", bold=True))
    p += [t(PW-84, y+34, f"{e[4]}s", 15, TXT, "end"), t(PW-46, y+34, f"+{e[5]}s", 12, SUB, "end", op=0.7),
          t(PW-24, y+34, "+" if pick else "›", 18, ORANGE if pick else SUB, "end"),
          f'<line x1="24" y1="{y+56}" x2="{PW-24}" y2="{y+56}" stroke="{LINE}"/>']
    return p

def chips(y, active="All"):
    p, x = [], 24
    for c in ("All", "Strength", "Stretch"):
        w = 26 + len(c) * 9
        a = c == active
        p.append(rect(x, y, w, 32, TXT if a else CARD, 16))
        p.append(t(x+w/2, y+21, c, 14, "#111" if a else TXT, "middle", bold=a))
        x += w + 8
    return p

# ---------------------------------------------------------------- P1
body = [t(24, 138, "WORKOUTS", 12, SUB, bold=True)]
body += workout_card(20, 150, "Morning A", "4:45", "2 strength · 2 stretch")
body += workout_card(20, 240, "Morning B", "3:25", "2 strength · 1 stretch")
body += [rect(20, 350, PW-40, 60, CARD, 16), t(38, 386, "Exercise bank", 17, TXT), t(PW-38, 386, "4  ›", 16, SUB, "end"),
         t(24, 460, "Backup", 14, ORANGE), t(88, 460, "·", 14, SUB), t(100, 460, "Restore", 14, ORANGE)]
open(f"{out}/P1_workouts.svg", "w").write(frame(header("Plan", right="+", big=True), body, "Plan"))

# ---------------------------------------------------------------- P2
steps = [("pushups", 60, 20), ("jackknife", 60, 20), ("cat_cow", 60, 5), ("cobra", 60, 0)]
body = [t(24, 130, "Total 4:45  ·  4:00 work + 0:45 rest", 15, SUB)]
y = 142
for i, (ex, secs, rest) in enumerate(steps, 1):
    body += step_row(y, i, ex, secs, rest); y += 50
y += 14
body += [rect(20, y, PW-40, 50, CARD, 14), t(PW/2, y+31, "+ Add exercise", 16, ORANGE, "middle", bold=True),
         t(PW/2, y+90, "Delete workout", 15, "#F0645C", "middle")]
open(f"{out}/P2_workout_editor.svg", "w").write(frame(header("Morning A", left="‹ Plan"), body, "Plan"))

# ---------------------------------------------------------------- P2 sheet (step time)
body = []
for i, (ex, secs, rest) in enumerate(steps, 1):
    body += step_row(142 + (i-1)*50, i, ex, secs, rest)
body.append(rect(0, 0, PW, PH, "#000", 0, 0.55))
def stepper(y, label, value, sub, big=True):
    sz = 34 if big else 26
    return [t(24, y, label, 14, SUB),
            rect(PW/2-110, y+18, 56, 56, CARD2, 28), t(PW/2-82, y+56, "–", 28, TXT, "middle"),
            t(PW/2, y+58, value, sz, TXT if big else SUB, "middle", bold=True),
            rect(PW/2+54, y+18, 56, 56, CARD2, 28), t(PW/2+82, y+56, "+", 28, TXT, "middle"),
            t(PW/2, y+96, sub, 13, SUB, "middle")]
sy = PH - 430
body += [rect(0, sy, PW, 430, CARD, 24), rect(PW/2-20, sy+10, 40, 5, LINE, 3),
         t(24, sy+52, "Push-ups", 20, TXT, bold=True), t(24, sy+76, "Strength", 14, ORANGE)]
body += stepper(sy+112, "Exercise time", "60 s", "default for this exercise: 60 s")
body += stepper(sy+236, "Rest after", "20 s", "default for this exercise: 20 s", big=False)
body += [t(24, sy+362, "Remove from workout", 15, "#F0645C"),
         rect(20, sy+380, PW-40, 44, ORANGE, 12), t(PW/2, sy+408, "Done", 16, "#111", "middle", bold=True)]
body.append(rect(PW/2-67, PH-12, 134, 5, TXT, 3))
open(f"{out}/P2b_step_sheet.svg", "w").write(frame(header("Morning A", left="‹ Plan"), body))

# ---------------------------------------------------------------- P3
def bank(pick):
    body = chips(112)
    y = 164
    body.append(t(24, y+6, "STRENGTH", 12, SUB, bold=True)); y += 16
    for ex in ("pushups", "jackknife"):
        body += bank_row(y, ex, pick); y += 60
    y += 18
    body.append(t(24, y+6, "STRETCH", 12, SUB, bold=True)); y += 16
    for ex in ("cat_cow", "cobra"):
        body += bank_row(y, ex, pick); y += 60
    return body
open(f"{out}/P3_bank.svg", "w").write(frame(header("Exercises", left="‹ Back"), bank(False), "Plan"))
open(f"{out}/P3b_bank_pick.svg", "w").write(frame(header("Add to Morning A", left="‹ Cancel"), bank(True), "Plan"))

# ---------------------------------------------------------------- P3 detail sheet
body = bank(False) + [rect(0, 0, PW, PH, "#000", 0, 0.55)]
sy = PH - 420
body += [rect(0, sy, PW, 420, CARD, 24), rect(PW/2-20, sy+10, 40, 5, LINE, 3),
         t(24, sy+52, "Cobra", 22, TXT, bold=True), t(24, sy+76, "Stretch · 60s · no rest after", 14, TEAL),
         fig("cobra", "relaxed", 24, sy+96, 160, CARD2), fig("cobra", "flexed", PW-184, sy+96, 160, CARD2),
         t(104, sy+278, "Relaxed", 13, SUB, "middle"), t(PW-104, sy+278, "Flexed", 13, SUB, "middle"),
         t(24, sy+316, "Hips down, shoulders away from ears.", 15, TXT),
         rect(20, sy+346, PW-40, 44, CARD2, 12), t(PW/2, sy+374, "Add to workout…", 16, ORANGE, "middle", bold=True)]
body.append(rect(PW/2-67, PH-12, 134, 5, TXT, 3))
open(f"{out}/P3c_bank_detail.svg", "w").write(frame(header("Exercises", left="‹ Back"), body))

# ---------------------------------------------------------------- T1
body = workout_card(20, 130, "Morning A", "4:45", "4 exercises", True) + workout_card(20, 262, "Morning B", "3:25", "3 exercises", True)
open(f"{out}/T1_pick.svg", "w").write(frame(header("Train", big=True), body, "Train"))

# ---------------------------------------------------------------- T2 session (sided, left)
def session2(ex_id, side, remaining, step_i, total, progress, nxt, notes):
    e = EX[ex_id]; col = colour_for(e[2])
    fs = 180
    body = [t(24, 84, "✕", 20, SUB), t(PW-24, 84, f"Morning A  {step_i}/{total}", 14, SUB, "end"),
            rect(24, 100, PW-48, 5, CARD2, 3), rect(24, 100, (PW-48)*progress, 5, col, 3),
            t(24, 148, e[1].upper(), 30, TXT, bold=True),
            t(24, 174, f"{e[2].capitalize()}" + (f"  ·  {side} side" if side else ""), 16, col),
            fig(ex_id, "relaxed", PW/2-fs/2, 188, fs),
            t(PW/2, 470, remaining, 84, TXT, "middle", bold=True),
            rect(60, 488, PW-120, 8, CARD2, 4), rect(60, 488, (PW-120)*0.85, 8, col, 4),
            fig(ex_id, "flexed", PW/2-fs/2, 512, fs),
            t(PW/2, 730, notes, 14, SUB, "middle"),
            t(PW/2, 752, f"Next: {nxt}", 14, TXT, "middle"),
            t(70, PH-38, "‹‹", 26, SUB, "middle"),
            rect(PW/2-70, PH-62, 140, 44, CARD, 22), t(PW/2, PH-33, "▐▐  Pause", 16, TXT, "middle", bold=True),
            t(PW-70, PH-38, "››", 26, SUB, "middle"),
            rect(PW/2-67, PH-12, 134, 5, TXT, 3)]
    return body
open(f"{out}/T2_session_sided.svg", "w").write(frame([], session2("cat_cow", None, "0:38", 3, 4, 0.55, "Cobra 60s (after 5s rest)", "Move with the breath")))
open(f"{out}/T2b_session_strength.svg", "w").write(frame([], session2("pushups", None, "0:52", 1, 4, 0.05, "Jackknife sit-ups 60s (after 20s rest)", "Elbows tucked, chest to floor")))

# ---------------------------------------------------------------- T2 rest
col = ORANGE
body = [t(24, 84, "✕", 20, SUB), t(PW-24, 84, "Morning A  1/4", 14, SUB, "end"),
        rect(24, 100, PW-48, 5, CARD2, 3), rect(24, 100, (PW-48)*0.22, 5, SUB, 3),
        t(24, 148, "REST", 30, TXT, bold=True), t(24, 174, "20s · after Push-ups", 16, SUB),
        t(PW/2, 340, "0:14", 110, TXT, "middle", bold=True),
        rect(60, 370, PW-120, 8, CARD2, 4), rect(60, 370, (PW-120)*0.8, 8, SUB, 4),
        t(PW/2, 450, "Next: Jackknife sit-ups 60s", 18, TXT, "middle", bold=True),
        fig("jackknife", "flexed", PW/2-100, 470, 200), t(PW/2, 700, "Jackknife sit-ups · Strength", 14, ORANGE, "middle"),
        t(70, PH-38, "‹‹", 26, SUB, "middle"),
        rect(PW/2-70, PH-62, 140, 44, CARD, 22), t(PW/2, PH-33, "▐▐  Pause", 16, TXT, "middle", bold=True),
        t(PW-70, PH-38, "››", 26, SUB, "middle"), rect(PW/2-67, PH-12, 134, 5, TXT, 3)]
open(f"{out}/T2c_rest.svg", "w").write(frame([], body))

# ---------------------------------------------------------------- T2 paused
body = session2("cat_cow", None, "0:38", 3, 4, 0.55, "Cobra 60s (after 5s rest)", "Move with the breath")
body += [rect(0, 0, PW, PH, "#000", 44, 0.86), t(PW/2, 400, "▐▐", 60, TXT, "middle"), t(PW/2, 460, "Paused", 30, TXT, "middle", bold=True),
         t(PW/2, 492, "tap anywhere to resume", 15, SUB, "middle")]
open(f"{out}/T2d_paused.svg", "w").write(frame([], body))

# ---------------------------------------------------------------- T3 done
body = [f'<circle cx="{PW/2}" cy="330" r="54" fill="{ORANGE}"/>', t(PW/2, 350, "✓", 56, "#111", "middle", bold=True),
        t(PW/2, 440, "Nice work.", 30, TXT, "middle", bold=True), t(PW/2, 472, "Morning A · 4:45", 16, SUB, "middle"),
        rect(20, PH-140, PW-40, 52, ORANGE, 14), t(PW/2, PH-106, "Done", 17, "#111", "middle", bold=True),
        rect(PW/2-67, PH-12, 134, 5, TXT, 3)]
open(f"{out}/T3_done.svg", "w").write(frame([], body))

# ---------------------------------------------------------------- render all + sheet
names = sorted(n for n in os.listdir(out) if n.endswith(".svg") and not n.startswith("_"))
for n in names:
    cairosvg.svg2png(url=f"{out}/{n}", write_to=f"{out}/{n[:-4]}.png", output_width=PW*2)
# sheets: plan screens and train screens
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
sheet("_plan_screens", [("P1_workouts","P1 Workouts"),("P2_workout_editor","P2 Workout editor"),("P2b_step_sheet","P2 Step sheet (time + rest)"),
                        ("P3_bank","P3 Exercise bank"),("P3b_bank_pick","P3 Bank as picker"),("P3c_bank_detail","P3 Exercise detail")], 3)
sheet("_train_screens", [("T1_pick","T1 Pick workout"),("T2b_session_strength","T2 Session (regular)"),("T2_session_sided","T2 Session (stretch)"),
                         ("T2c_rest","T2 Rest step"),("T2d_paused","T2 Paused"),("T3_done","T3 Done")], 3)
print("done", len(names))
