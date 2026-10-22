"""Geometrie pentru dhd↻: primitive analitice (cubice), uniune booleană cu skia-pathops, export SVG."""
import math
from pathops import Path, PathPen, union

K = 4 / 3


def P(a):  # unghi in grade, y in jos, crestere = sensul acelor de ceasornic
    return math.radians(a)


def arc_pts(cx, cy, r, a0, a1):
    """Arc cu cubice, a0->a1 (grade, orice sens). Returneaza (start, [(c1,c2,end),...])."""
    sweep = a1 - a0
    n = max(1, int(math.ceil(abs(sweep) / 90.0 - 1e-9)))
    d = sweep / n
    t = K * math.tan(P(d) / 4)
    segs = []
    for i in range(n):
        s, e = a0 + i * d, a0 + (i + 1) * d
        ps = (cx + r * math.cos(P(s)), cy + r * math.sin(P(s)))
        pe = (cx + r * math.cos(P(e)), cy + r * math.sin(P(e)))
        c1 = (ps[0] - t * r * math.sin(P(s)), ps[1] + t * r * math.cos(P(s)))
        c2 = (pe[0] + t * r * math.sin(P(e)), pe[1] - t * r * math.cos(P(e)))
        segs.append((c1, c2, pe))
    return (cx + r * math.cos(P(a0)), cy + r * math.sin(P(a0))), segs


def pen_arc(pen, cx, cy, r, a0, a1, move=False):
    start, segs = arc_pts(cx, cy, r, a0, a1)
    if move:
        pen.moveTo(start)
    for c1, c2, e in segs:
        pen.curveTo(c1, c2, e)


def new():
    p = Path()
    return p, p.getPen()


def annulus(cx, cy, r, s):
    p, pen = new()
    pen_arc(pen, cx, cy, r + s / 2, 0, 360, move=True)
    pen.closePath()
    pen_arc(pen, cx, cy, r - s / 2, 360, 0, move=True)
    pen.closePath()
    return p


def stadium_v(x, y1, y2, s):
    """Tija verticala cu capete rotunde (centre y1<y2)."""
    h = s / 2
    p, pen = new()
    pen.moveTo((x - h, y1))
    pen_arc(pen, x, y1, h, 180, 360)
    pen.lineTo((x + h, y2))
    pen_arc(pen, x, y2, h, 0, 180)
    pen.closePath()
    return p


def arch(cx, cy, r, s, a0=180, a1=360):
    """Semi-inel cu capete drepte (butt)."""
    ro, ri = r + s / 2, r - s / 2
    p, pen = new()
    pen_arc(pen, cx, cy, ro, a0, a1, move=True)
    pen.lineTo((cx + ri * math.cos(P(a1)), cy + ri * math.sin(P(a1))))
    pen_arc(pen, cx, cy, ri, a1, a0)
    pen.closePath()
    return p


def ring_arrow_arc(cx, cy, r, s, a0, a1):
    """Arc inelar de la a0 la a1 (sens orar) cu capete rotunde la ambele capete."""
    ro, ri, h = r + s / 2, r - s / 2, s / 2
    p, pen = new()
    pen_arc(pen, cx, cy, ro, a0, a1, move=True)
    ex, ey = cx + r * math.cos(P(a1)), cy + r * math.sin(P(a1))
    pen_arc(pen, ex, ey, h, a1, a1 + 180)  # cap rotund la capatul final
    pen_arc(pen, cx, cy, ri, a1, a0)
    sx, sy = cx + r * math.cos(P(a0)), cy + r * math.sin(P(a0))
    pen_arc(pen, sx, sy, h, a0 + 180, a0 + 360)  # cap rotund la capatul initial
    pen.closePath()
    return p


def ring_arrow_arc_flat_end(cx, cy, r, s, a0, a1):
    """Ca mai sus, dar capatul final (sub sageata) este drept (acoperit de varful sagetii)."""
    ro, ri, h = r + s / 2, r - s / 2, s / 2
    p, pen = new()
    pen_arc(pen, cx, cy, ro, a0, a1, move=True)
    pen.lineTo((cx + ri * math.cos(P(a1)), cy + ri * math.sin(P(a1))))
    pen_arc(pen, cx, cy, ri, a1, a0)
    sx, sy = cx + r * math.cos(P(a0)), cy + r * math.sin(P(a0))
    pen_arc(pen, sx, sy, h, a0 + 180, a0 + 360)
    pen.closePath()
    return p


def rounded_polygon(pts, rho):
    """Poligon convex cu colturi rotunjite (arce circulare exacte, cubice)."""
    n = len(pts)
    p, pen = new()
    corners = []
    for i in range(n):
        a, b, c = pts[i - 1], pts[i], pts[(i + 1) % n]
        v1 = (a[0] - b[0], a[1] - b[1]); v2 = (c[0] - b[0], c[1] - b[1])
        l1 = math.hypot(*v1); l2 = math.hypot(*v2)
        u1 = (v1[0] / l1, v1[1] / l1); u2 = (v2[0] / l2, v2[1] / l2)
        ang = math.acos(max(-1, min(1, u1[0] * u2[0] + u1[1] * u2[1])))
        d = rho / math.tan(ang / 2)
        t1 = (b[0] + u1[0] * d, b[1] + u1[1] * d); t2 = (b[0] + u2[0] * d, b[1] + u2[1] * d)
        bis = (u1[0] + u2[0], u1[1] + u2[1]); bl = math.hypot(*bis)
        bis = (bis[0] / bl, bis[1] / bl)
        cd = rho / math.sin(ang / 2)
        ctr = (b[0] + bis[0] * cd, b[1] + bis[1] * cd)
        a0 = math.degrees(math.atan2(t1[1] - ctr[1], t1[0] - ctr[0]))
        a1 = math.degrees(math.atan2(t2[1] - ctr[1], t2[0] - ctr[0]))
        # alege sensul scurt
        dlt = (a1 - a0 + 540) % 360 - 180
        corners.append((ctr, a0, a0 + dlt))
    first = True
    for ctr, a0, a1 in corners:
        start, segs = arc_pts(ctr[0], ctr[1], rho, a0, a1)
        if first:
            pen.moveTo(start); first = False
        else:
            pen.lineTo(start)
        for c1, c2, e in segs:
            pen.curveTo(c1, c2, e)
    pen.closePath()
    return p


def arrowhead(cx, cy, r, ang, s, hw_k=1.0, len_k=1.55, rho_k=0.16):
    """Varf de sageata pe cerc, la unghiul ang, orientat in sens orar.
    Baza perpendiculara pe tangenta, centrata pe linia mediana a arcului."""
    px, py = cx + r * math.cos(P(ang)), cy + r * math.sin(P(ang))
    tx, ty = -math.sin(P(ang)), math.cos(P(ang))  # tangenta orara
    nx, ny = math.cos(P(ang)), math.sin(P(ang))   # radial
    hw, L = s * hw_k, s * len_k
    base_back = 0.0
    a = (px + nx * hw, py + ny * hw)
    b = (px - nx * hw, py - ny * hw)
    tip = (px + tx * L, py + ty * L)
    return rounded_polygon([a, tip, b], s * rho_k)


def merge(*paths):
    out = Path()
    pen = out.getPen()
    for pth in paths:
        pth.draw(pen)
    out.simplify(fix_winding=True)
    return out


def union_paths(paths):
    out = Path()
    union(paths, out.getPen(), fix_winding=True)
    return out


def translate(path, dx, dy):
    out = Path()
    pen = out.getPen()
    for verb, pts in path.segments:
        q = [(x + dx, y + dy) for x, y in pts]
        if verb == "moveTo": pen.moveTo(q[0])
        elif verb == "lineTo": pen.lineTo(q[0])
        elif verb == "curveTo": pen.curveTo(*q)
        elif verb == "qCurveTo": pen.qCurveTo(*q)
        elif verb == "closePath": pen.closePath()
        elif verb == "endPath": pen.endPath()
    return out


def scale(path, k, dx=0, dy=0):
    out = Path()
    pen = out.getPen()
    for verb, pts in path.segments:
        q = [(x * k + dx, y * k + dy) for x, y in pts]
        if verb == "moveTo": pen.moveTo(q[0])
        elif verb == "lineTo": pen.lineTo(q[0])
        elif verb == "curveTo": pen.curveTo(*q)
        elif verb == "qCurveTo": pen.qCurveTo(*q)
        elif verb == "closePath": pen.closePath()
        elif verb == "endPath": pen.endPath()
    return out


def f(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def svg_d(path):
    out = []
    for verb, pts in path.segments:
        if verb == "moveTo": out.append("M" + " ".join(f"{f(x)} {f(y)}" for x, y in pts))
        elif verb == "lineTo": out.append("L" + " ".join(f"{f(x)} {f(y)}" for x, y in pts))
        elif verb == "curveTo": out.append("C" + " ".join(f"{f(x)} {f(y)}" for x, y in pts))
        elif verb == "qCurveTo": out.append("Q" + " ".join(f"{f(x)} {f(y)}" for x, y in pts))
        elif verb == "closePath": out.append("Z")
    return "".join(out)


def bounds(path):
    return path.bounds


def rotate180(path, cx, cy):
    out = Path()
    pen = out.getPen()
    for verb, pts in path.segments:
        q = [(2 * cx - x, 2 * cy - y) for x, y in pts]
        if verb == "moveTo": pen.moveTo(q[0])
        elif verb == "lineTo": pen.lineTo(q[0])
        elif verb == "curveTo": pen.curveTo(*q)
        elif verb == "qCurveTo": pen.qCurveTo(*q)
        elif verb == "closePath": pen.closePath()
        elif verb == "endPath": pen.endPath()
    return out
