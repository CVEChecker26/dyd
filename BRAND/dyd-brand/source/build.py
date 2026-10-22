import sys, json
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geom import *

# ---- parametri (unitati de design; baseline la y=BASE) ----
S = 22.0            # grosimea trasului
R = 30.0            # raza liniei mediane a bolții
BASE = 116.0        # linia de baza (varful ascendentului la y=0)
CY = BASE - R - S / 2   # centrul bolții
H2 = S / 2
GAP_DH = 12.0       # tija d -> tija h
GAP_HD = 9.0        # picior h -> bolta d (optic)
GAP_DR = 10.0       # tija d -> inel ↻
ARR_A0, ARR_A1 = 46.0, 298.0   # inel ↻: de la 38° la 300° (sens orar)


def letter_d(x0):
    cx = x0 + R + H2
    bowl = annulus(cx, CY, R, S)
    stem = stadium_v(cx + R, H2, CY, S)
    return union_paths([bowl, stem]), x0 + 2 * R + S


def letter_h(x0):
    xs = x0 + H2
    xl = xs + 2 * R
    stem = stadium_v(xs, H2, BASE - H2, S)
    ar = arch(xs + R, CY, R, S)
    leg = stadium_v(xl, CY, BASE - H2, S)
    return union_paths([stem, ar, leg]), x0 + 2 * R + S


def glyph_cycle(cx, a0=ARR_A0, a1=ARR_A1, hw=1.15, ln=1.5, rho=0.28):
    arc = ring_arrow_arc_flat_end(cx, CY, R, S, a0, a1)
    head = arrowhead(cx, CY, R, a1, S, hw_k=hw, len_k=ln, rho_k=rho)
    return union_paths([arc, head])


def letter_y(x0):
    """y = h rotit cu 180° în jurul centrului benzii x (y=CY): d și y sunt p și h rotite."""
    h, x1 = letter_h(x0)
    cxh = x0 + R + H2
    return rotate180(h, cxh, CY), x1


def wordmark_parts():
    d1, x = letter_d(0)
    y, x = letter_y(x + GAP_DH)
    d2, x = letter_d(x + GAP_HD)
    cx = x + GAP_DR + R + H2
    cyc = glyph_cycle(cx)
    return d1, y, d2, cyc


if __name__ == "__main__":
    d1, h, d2, cyc = wordmark_parts()
    word = union_paths([d1, h, d2])
    b = cyc.bounds
    print("cycle bounds", b, "word bounds", word.bounds)
