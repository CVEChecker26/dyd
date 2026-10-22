import sys, os, io, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build as B
from geom import *
import cairosvg
from PIL import Image

OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
for d in ('svg', 'png'): os.makedirs(f'{OUT}/{d}', exist_ok=True)

INK, PAPER, SIGNAL, DEEP = '#0B1220', '#F4F6F8', '#2DD4BF', '#0E7C70'
HW, LN, RHO = 1.35, 1.5, 0.28          # varful sagetii (identic in wordmark si icon)
S, R, CY, BASE, H2 = B.S, B.R, B.CY, B.BASE, B.H2
ASC_TOP, DESC = 0.0, 150.0

# ---------- wordmark ----------
d1, y, d2, _ = B.wordmark_parts()
x_end = 0
_, x = B.letter_d(0); _, x = B.letter_h(x + B.GAP_DH); _, x = B.letter_d(x + B.GAP_HD)
cyc_cx = x + B.GAP_DR + R + H2
cyc = B.glyph_cycle(cyc_cx, 15.0, 300.0, HW, LN, RHO)
letters = union_paths([d1, y, d2])
word_all = union_paths([d1, y, d2, cyc])
wb = word_all.bounds
VB_W, VB_H = math.ceil(wb[2]), 150
def fmt(v): return f.__call__(v) if False else str(round(v, 2))

def doc(viewbox, body, title, desc, extra_attr=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" role="img" aria-labelledby="t d"{extra_attr}>'
            f'<title id="t">{title}</title><desc id="d">{desc}</desc>{body}</svg>\n')

def wordmark_svg(fg, ac, title='dyd↻', mono=False, bg=None):
    bgel = f'<rect width="{VB_W}" height="{VB_H}" fill="{bg}"/>' if bg else ''
    if mono:
        body = f'{bgel}<path fill="{fg}" d="{svg_d(word_all)}"/>'
    else:
        body = f'{bgel}<path id="dyd" fill="{fg}" d="{svg_d(letters)}"/><path id="rotate" fill="{ac}" d="{svg_d(cyc)}"/>'
    return doc(f'0 0 {VB_W} {VB_H}', body, title, 'dyd followed by a clockwise rotation arrow. The y is the letter h rotated 180 degrees.')

# ---------- icon ----------
def icon_parts():
    cx = R + H2
    ring = B.glyph_cycle(cx, 0.0, 250.0, HW, LN, RHO)
    h = S / 2
    stem, pen = new()                       # tija: capat rotund sus, taiere dreapta la CY (continua in inel)
    pen.moveTo((cx + R - h, H2)); pen_arc(pen, cx + R, H2, h, 180, 360)
    pen.lineTo((cx + R + h, CY)); pen.lineTo((cx + R - h, CY)); pen.closePath()
    return ring, stem
ring0, stem0 = icon_parts()
gb = union_paths([ring0, stem0]).bounds     # bbox glif

def icon_svg(size, k, ring_c, stem_c, bg=None, rx=0, mono=False, title='dyd↻ icon'):
    gw, gh = (gb[2]-gb[0])*k, (gb[3]-gb[1])*k
    dx = (size-gw)/2 - gb[0]*k; dy = (size-gh)/2 - gb[1]*k
    r2, s2 = scale(ring0, k, dx, dy), scale(stem0, k, dx, dy)
    bgel = ''
    if bg: bgel = (f'<rect width="{size}" height="{size}" rx="{rx}" fill="{bg}"/>' if rx else f'<rect width="{size}" height="{size}" fill="{bg}"/>')
    if mono:
        body = f'{bgel}<path fill="{ring_c}" d="{svg_d(union_paths([r2, s2]))}"/>'
    else:
        body = f'{bgel}<path id="rotate" fill="{ring_c}" d="{svg_d(r2)}"/><path id="d" fill="{stem_c}" d="{svg_d(s2)}"/>'
    return doc(f'0 0 {size} {size}', body, title, 'The letter d whose bowl is a clockwise rotation arrow.')

def glyph_svg(ring_c, stem_c, mono=False):
    pad = 6
    w, h = gb[2]-gb[0], gb[3]-gb[1]
    r2, s2 = translate(ring0, pad-gb[0], pad-gb[1]), translate(stem0, pad-gb[0], pad-gb[1])
    vb = f'0 0 {round(w+2*pad,2)} {round(h+2*pad,2)}'
    body = (f'<path fill="{ring_c}" d="{svg_d(union_paths([r2, s2]))}"/>' if mono else
            f'<path id="rotate" fill="{ring_c}" d="{svg_d(r2)}"/><path id="d" fill="{stem_c}" d="{svg_d(s2)}"/>')
    return doc(vb, body, 'dyd↻ glyph', 'The letter d whose bowl is a clockwise rotation arrow.')

K_TILE = 3.0
files = {}
files['svg/dyd-logo-primary-light.svg'] = wordmark_svg(INK, DEEP)
files['svg/dyd-logo-primary-dark.svg'] = wordmark_svg(PAPER, SIGNAL)
files['svg/dyd-logo-mono-black.svg'] = wordmark_svg('#000000', None, mono=True)
files['svg/dyd-logo-mono-white.svg'] = wordmark_svg('#FFFFFF', None, mono=True)
files['svg/dyd-icon-dark.svg'] = icon_svg(512, K_TILE, SIGNAL, PAPER, INK, 112)
files['svg/dyd-icon-light.svg'] = icon_svg(512, K_TILE, DEEP, INK, PAPER, 112)
files['svg/dyd-icon-mono-black.svg'] = icon_svg(512, K_TILE, '#000000', '#000000', None, mono=True)
files['svg/dyd-icon-mono-white.svg'] = icon_svg(512, K_TILE, '#FFFFFF', '#FFFFFF', None, mono=True)
files['svg/dyd-glyph-on-dark.svg'] = glyph_svg(SIGNAL, PAPER)
files['svg/dyd-glyph-on-light.svg'] = glyph_svg(DEEP, INK)
files['svg/dyd-avatar-square.svg'] = icon_svg(512, 2.3, SIGNAL, PAPER, INK, 0, title='dyd↻ avatar')
# favicon adaptiv (tema browserului)
fav_glyph_dark = icon_svg(64, 0.34*K_TILE*64/64*1.0, SIGNAL, PAPER)  # placeholder for geometry reuse
def favicon():
    size, k = 64, K_TILE/8.0*1.0
    gw, gh = (gb[2]-gb[0])*k, (gb[3]-gb[1])*k
    dx = (size-gw)/2 - gb[0]*k; dy = (size-gh)/2 - gb[1]*k
    r2, s2 = scale(ring0, k, dx, dy), scale(stem0, k, dx, dy)
    css = ('<style>.bg{fill:#0B1220}.r{fill:#2DD4BF}.s{fill:#F4F6F8}'
           '@media (prefers-color-scheme:light){.bg{fill:#F4F6F8}.r{fill:#0E7C70}.s{fill:#0B1220}}</style>')
    return doc('0 0 64 64', f'{css}<rect class="bg" width="64" height="64" rx="14"/><path class="r" d="{svg_d(r2)}"/><path class="s" d="{svg_d(s2)}"/>',
               'dyd↻ favicon', 'The letter d whose bowl is a clockwise rotation arrow.')
files['svg/favicon.svg'] = favicon()
# master structurat (litere separate, ids)
master_body = ''.join(f'<path id="{n}" fill="{INK}" d="{svg_d(p)}"/>' for n, p in (('d1', d1), ('y', y), ('d2', d2))) + f'<path id="rotate" fill="{DEEP}" d="{svg_d(cyc)}"/>'
files['svg/dyd-logo-master.svg'] = doc(f'0 0 {VB_W} {VB_H}', master_body, 'dyd↻', 'Vector master: d, y, d and the rotation arrow as separate paths.')

for name, s in files.items():
    open(f'{OUT}/{name}', 'w', encoding='utf-8').write(s)

# ---------- PNG ----------
def png(svg_name, out, width, bg=None):
    cairosvg.svg2png(url=f'{OUT}/{svg_name}', write_to=f'{OUT}/png/{out}', output_width=width, background_color=bg)
for w in (2000, 1000, 400):
    for v in ('primary-light', 'primary-dark', 'mono-black', 'mono-white'):
        png(f'svg/dyd-logo-{v}.svg', f'dyd-logo-{v}-{w}.png', w)
for sz in (16, 32, 48, 64, 128, 180, 192, 256, 512, 1024):
    png('svg/dyd-icon-dark.svg', f'dyd-icon-dark-{sz}.png', sz)
    png('svg/dyd-icon-light.svg', f'dyd-icon-light-{sz}.png', sz)
for sz in (512,):
    png('svg/dyd-glyph-on-dark.svg', 'dyd-glyph-on-dark-512.png', 512)
    png('svg/dyd-glyph-on-light.svg', 'dyd-glyph-on-light-512.png', 512)
    png('svg/dyd-icon-mono-black.svg', 'dyd-icon-mono-black-512.png', 512)
    png('svg/dyd-icon-mono-white.svg', 'dyd-icon-mono-white-512.png', 512)
png('svg/dyd-avatar-square.svg', 'dyd-github-avatar-500.png', 500)
png('svg/dyd-avatar-square.svg', 'dyd-apple-touch-icon-180.png', 180)
# favicon.ico din PNG-uri
imgs = []
for sz in (16, 32, 48):
    cairosvg.svg2png(url=f'{OUT}/svg/favicon.svg', write_to=f'{OUT}/png/_fav{sz}.png', output_width=sz)
base = Image.open(f'{OUT}/png/_fav48.png').convert('RGBA')
base.save(f'{OUT}/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
for sz in (16, 32, 48): os.remove(f'{OUT}/png/_fav{sz}.png')
print('ok', VB_W, VB_H, {k: len(v) for k, v in files.items() if 'master' in k or 'primary-light' in k or 'icon-dark' in k})
