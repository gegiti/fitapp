"""Draws the exercise figures as flat line-art SVG.

Each pose is a dict of named joints in a 200x200 box (floor at y=180).
Segments are drawn as rounded strokes; the head is a filled circle.
"far_*" joints belong to the limb further from the viewer and are drawn muted.
"""

ORANGE = "#F5A524"   # strength
TEAL   = "#2DD4BF"   # stretch
MUTED  = "#7C8290"   # relaxed figure
CARD   = "#1C1F26"

W = 9  # stroke width

def seg(a, b, col, op=1.0, w=W):
    return (f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" '
            f'stroke="{col}" stroke-width="{w}" stroke-linecap="round" opacity="{op}"/>')

def curve(a, c, b, col, op=1.0, w=W):
    return (f'<path d="M{a[0]} {a[1]} Q{c[0]} {c[1]} {b[0]} {b[1]}" fill="none" '
            f'stroke="{col}" stroke-width="{w}" stroke-linecap="round" opacity="{op}"/>')

def head(p, col, r=13):
    return f'<circle cx="{p[0]}" cy="{p[1]}" r="{r}" fill="{col}"/>'

def chain(pts, col, op=1.0):
    out = []
    for a, b in zip(pts, pts[1:]):
        out.append(seg(a, b, col, op))
    return out

def figure(pose, col, bg=CARD, floor=True):
    """pose: dict with keys head, neck, hip, and chains: arm, leg, far_arm, far_leg, spine_ctrl"""
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">',
             f'<rect width="200" height="200" rx="24" fill="{bg}"/>']
    if floor:
        parts.append(seg((22, 186), (178, 186), "#FFFFFF", 0.08, 3))
    # far limbs first (behind)
    for k in ("far_arm", "far_leg"):
        if k in pose:
            parts += chain(pose[k], col, 0.38)
    # spine
    if "spine_ctrl" in pose:
        parts.append(curve(pose["neck"], pose["spine_ctrl"], pose["hip"], col))
    else:
        parts.append(seg(pose["neck"], pose["hip"], col))
    for k in ("arm", "leg", "arm2", "leg2"):
        if k in pose:
            parts += chain(pose[k], col)
    parts.append(head(pose["head"], col))
    parts.append("</svg>")
    return "\n".join(parts)

# ---- poses -------------------------------------------------------------
# Figure faces right. Coordinates: x to the right, y down. Floor y=180.

STAND = dict(head=(100, 32), neck=(100, 56), hip=(100, 112),
             arm=[(100, 60), (104, 88), (108, 112)],
             far_arm=[(100, 60), (96, 88), (92, 112)],
             leg=[(100, 112), (103, 146), (103, 180)],
             far_leg=[(100, 112), (97, 146), (97, 180)])

ALL_FOURS = dict(head=(164, 96), neck=(138, 108), hip=(78, 108),
                 arm=[(138, 108), (140, 145), (142, 180)],
                 far_arm=[(138, 108), (130, 145), (128, 180)],
                 leg=[(78, 108), (80, 180), (40, 180)],
                 far_leg=[(78, 108), (68, 180), (30, 180)])

PLANK = dict(head=(160, 92), neck=(136, 104), hip=(78, 128),
             arm=[(136, 104), (140, 142), (144, 180)],
             far_arm=[(136, 104), (128, 142), (130, 180)],
             leg=[(78, 128), (48, 152), (16, 176)],
             far_leg=[(78, 128), (42, 156), (10, 180)])

PUSHUP_DOWN = dict(head=(166, 138), neck=(140, 150), hip=(80, 160),
                   arm=[(140, 150), (108, 166), (140, 180)],
                   far_arm=[(140, 150), (104, 170), (132, 182)],
                   leg=[(80, 160), (48, 170), (16, 178)],
                   far_leg=[(80, 160), (44, 172), (10, 180)])

SQUAT = dict(head=(118, 60), neck=(110, 82), hip=(82, 130),
             arm=[(110, 86), (140, 82), (168, 78)],
             far_arm=[(110, 86), (138, 88), (164, 86)],
             leg=[(82, 130), (122, 146), (110, 180)],
             far_leg=[(82, 130), (116, 152), (100, 180)])

BRIDGE_DOWN = dict(head=(22, 170), neck=(46, 170), hip=(104, 170),
                   arm=[(50, 170), (72, 172), (94, 176)],
                   leg=[(104, 170), (130, 132), (146, 180)],
                   far_leg=[(104, 170), (124, 136), (136, 180)])

BRIDGE_UP = dict(head=(22, 170), neck=(46, 168), hip=(108, 122),
                 arm=[(50, 170), (76, 174), (100, 178)],
                 leg=[(108, 122), (136, 126), (146, 180)],
                 far_leg=[(108, 122), (128, 130), (136, 180)])

LUNGE = dict(head=(102, 46), neck=(102, 70), hip=(100, 126),
             arm=[(102, 74), (106, 100), (110, 126)],
             far_arm=[(102, 74), (98, 100), (94, 126)],
             leg=[(100, 126), (140, 140), (140, 180)],          # front leg
             far_leg=[(100, 126), (70, 172), (36, 174)])        # back knee hovering

HIP_FLEX_RELAXED = dict(head=(100, 46), neck=(100, 70), hip=(98, 126),
                        arm=[(100, 74), (104, 100), (108, 126)],
                        far_arm=[(100, 74), (96, 100), (92, 126)],
                        leg=[(98, 126), (136, 140), (136, 180)],
                        far_leg=[(98, 126), (96, 180), (56, 180)])   # back knee down

HIP_FLEX_FLEXED = dict(head=(110, 42), neck=(108, 66), hip=(118, 126),
                       arm=[(108, 70), (94, 44), (96, 12)],         # arms overhead, behind head
                       far_arm=[(108, 70), (90, 46), (90, 14)],
                       leg=[(118, 126), (156, 140), (156, 180)],
                       far_leg=[(118, 126), (92, 180), (48, 180)])

HAM_RELAXED = dict(head=(78, 84), neck=(80, 108), hip=(80, 166),
                   arm=[(80, 112), (92, 140), (104, 166)],
                   leg=[(80, 166), (128, 170), (172, 172)],       # leg straight out
                   far_leg=[(80, 166), (104, 140), (96, 176)])    # other leg folded

HAM_FLEXED = dict(head=(150, 118), neck=(128, 132), hip=(80, 166),
                  arm=[(128, 134), (154, 152), (170, 168)],
                  far_arm=[(128, 134), (150, 156), (166, 172)],
                  leg=[(80, 166), (128, 170), (172, 172)],
                  far_leg=[(80, 166), (104, 140), (96, 176)])

KNEEL = dict(head=(100, 46), neck=(100, 70), hip=(100, 126),
             arm=[(100, 74), (104, 100), (108, 126)],
             far_arm=[(100, 74), (96, 100), (92, 126)],
             leg=[(100, 126), (104, 180), (60, 180)],
             far_leg=[(100, 126), (96, 180), (52, 180)])

CHILD = dict(head=(158, 166), neck=(134, 158), hip=(76, 156),
             arm=[(134, 160), (164, 172), (190, 178)],
             far_arm=[(134, 160), (160, 176), (184, 182)],
             leg=[(76, 156), (104, 180), (60, 180)],
             far_leg=[(76, 156), (96, 180), (52, 180)])

COW = dict(head=(166, 92), neck=(138, 106), hip=(78, 106), spine_ctrl=(108, 132),
           arm=[(138, 106), (140, 145), (142, 180)],
           far_arm=[(138, 106), (130, 145), (128, 180)],
           leg=[(78, 106), (80, 180), (40, 180)],
           far_leg=[(78, 106), (68, 180), (30, 180)])

CAT = dict(head=(156, 132), neck=(136, 110), hip=(78, 110), spine_ctrl=(108, 74),
           arm=[(136, 110), (140, 145), (142, 180)],
           far_arm=[(136, 110), (130, 145), (128, 180)],
           leg=[(78, 110), (80, 180), (40, 180)],
           far_leg=[(78, 110), (68, 180), (30, 180)])

CHEST_OPEN = dict(head=(104, 30), neck=(100, 56), hip=(100, 112),
                  arm=[(100, 60), (84, 90), (68, 116)],
                  far_arm=[(100, 60), (80, 92), (64, 118)],
                  leg=[(100, 112), (103, 146), (103, 180)],
                  far_leg=[(100, 112), (97, 146), (97, 180)])

PRONE = dict(head=(172, 170), neck=(148, 172), hip=(80, 172),
             arm=[(146, 172), (118, 176), (92, 178)],
             far_arm=[(146, 172), (116, 180), (90, 182)],
             leg=[(80, 172), (44, 174), (14, 176)],
             far_leg=[(80, 172), (42, 178), (10, 180)])

COBRA = dict(head=(168, 102), neck=(146, 120), hip=(80, 172), spine_ctrl=(136, 172),
             arm=[(146, 122), (150, 150), (154, 180)],
             far_arm=[(146, 122), (140, 152), (142, 182)],
             leg=[(80, 172), (44, 174), (14, 176)],
             far_leg=[(80, 172), (42, 178), (10, 180)])

SUPINE_ARMS_UP = dict(head=(26, 170), neck=(50, 170), hip=(108, 170),
                      arm=[(52, 166), (30, 148), (8, 144)],
                      far_arm=[(52, 166), (28, 152), (6, 150)],
                      leg=[(108, 170), (146, 172), (184, 174)],
                      far_leg=[(108, 170), (144, 176), (182, 178)])

JACKKNIFE = dict(head=(46, 88), neck=(62, 110), hip=(100, 166),
                 arm=[(64, 112), (102, 94), (140, 80)],
                 far_arm=[(64, 112), (100, 98), (136, 86)],
                 leg=[(100, 166), (140, 124), (176, 86)],
                 far_leg=[(100, 166), (136, 128), (170, 92)])

EXERCISES = [
    # id, name, type, sided, seconds, rest seconds, relaxed pose, flexed pose, cue
    ("pushups",   "Push-ups",           "strength", False, 60, 20, PLANK,          PUSHUP_DOWN, "Elbows tucked, chest to floor"),
    ("jackknife", "Jackknife sit-ups",  "strength", False, 60, 20, SUPINE_ARMS_UP, JACKKNIFE,   "Reach hands to feet, fold at the hips"),
    ("cat_cow",   "Cat / cow",          "stretch",  False, 60,  5, COW,            CAT,         "Move with the breath"),
    ("cobra",     "Cobra",              "stretch",  False, 60,  0, PRONE,          COBRA,       "Hips down, shoulders away from ears"),
]

def colour_for(t):
    return ORANGE if t == "strength" else TEAL

def svg_pair(ex):
    _id, name, t, sided, secs, rest, relaxed, flexed, cue = ex
    return figure(relaxed, MUTED), figure(flexed, colour_for(t))
