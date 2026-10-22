# dyd↻ — brand guidelines (v1.0)

dyd↻ is an independent open-source tool. It is not affiliated with or endorsed by the PHP Group or any platform vendor it mentions.

## 1. Concept

- **Rotation.** The wordmark `dyd` is built so that it can be rotated 180°. `d` is `p` rotated, and `y` is `h` rotated. Turn the wordmark upside down and it reads `php`: the product looks at the same problem from the other side.
- **Palindrome.** `dyd` reads the same in both directions, which fits the idea of checking a claim against a reference.
- **↻.** The clockwise rotation arrow is drawn with the same stroke, the same bowl radius and the same round terminals as the letters, so it is a fourth glyph, not an add-on. It is the only element in the accent colour.
- **Icon.** The letter `d` whose bowl is the rotation arrow. The stem (the letter) is white or ink; the stem turns into the arrow at the baseline of the bowl.
- **Tone.** Precise, calm, no promises. No shield, padlock or other security clichés, no gradients, no effects.

The letterforms are original geometry (circles and straight stems, round caps). They are not a font and not traced from any existing logo.

## 2. Files

| File | Use |
|---|---|
| `svg/dyd-logo-master.svg` | Vector master: `d`, `y`, `d` and the arrow as separate named paths |
| `svg/dyd-logo-primary-light.svg` / `-dark.svg` | Primary logo for light / dark backgrounds, transparent |
| `svg/dyd-logo-mono-black.svg` / `-white.svg` | One-colour logo, transparent |
| `svg/dyd-icon-dark.svg` / `-light.svg` | App icon on a rounded tile |
| `svg/dyd-icon-mono-black.svg` / `-white.svg` | One-colour icon, transparent |
| `svg/dyd-glyph-on-dark.svg` / `-on-light.svg` | Icon without tile, transparent |
| `svg/dyd-avatar-square.svg` | Full-bleed square for GitHub and social avatars (stays inside a circular crop) |
| `svg/favicon.svg` | Favicon that follows the browser's light or dark theme |
| `favicon.ico` | 16, 32 and 48 px |
| `png/` | Transparent PNG exports: logos at 400, 1000 and 2000 px wide; icons from 16 to 1024 px; GitHub avatar 500 px; Apple touch icon 180 px |
| `dyd-brand-sheet.png` | One-page overview |
| `source/` | Python scripts that regenerate every file (needs `skia-pathops`, `cairosvg`, `Pillow`) |

All SVGs contain only filled paths: no fonts, filters, images, scripts or external references. The wordmark is about 70 path commands (under 2 KB). The copies in this package also carry an inert provenance metadata block (C2PA) that the platform added automatically when the files were saved; it marks them as AI-generated and does not affect rendering. Running `source/build_all.py` produces the same artwork without that block.

## 3. Colour

| Name | Hex | RGB | Use |
|---|---|---|---|
| Ink | `#0B1220` | 11, 18, 32 | Letters on light, dark backgrounds |
| Paper | `#F4F6F8` | 244, 246, 248 | Letters on dark, light backgrounds |
| Verify Teal | `#2DD4BF` | 45, 212, 191 | ↻ on dark backgrounds |
| Verify Teal Deep | `#0E7C70` | 14, 124, 112 | ↻ on light backgrounds |
| Slate | `#475569` | 71, 85, 105 | Secondary text on light |

Contrast, computed with the WCAG formula: Paper on Ink 17.3:1; Verify Teal on Ink 10.1:1; Verify Teal Deep on Paper 4.7:1; Slate on Paper 7.0:1.

Use Verify Teal only for ↻ and for status accents. Do not use it for large fills. Do not introduce purple, which belongs to the PHP world and would suggest affiliation.

## 4. Typography

- **Wordmark and icon:** fixed artwork. Never retype `dyd↻` in a font.
- **Construction, in design units (u):** stroke 22u; x-height 82u (outer); ascender 116u; descender 34u (equal to the ascender rise, which is what makes the 180° rotation exact); bowl radius 30u on the stroke centreline; counter diameter 38u; letter gaps 12u (d–y), 9u (y–d), 10u (d–↻). The wordmark box is 360 × 150u.
- **Supporting text:** system sans stack, `ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Inter is a good match if self-hosted (SIL OFL). Headings 600–700, body 400, line height 1.5.
- **Code and versions:** `ui-monospace, "SF Mono", Consolas, monospace`.
- Write the name as `dyd↻` in running text, lowercase; where the arrow is not available, write `dyd`.

## 5. Clear space and minimum size

- Clear space: 2 stroke widths (44u) on every side of the wordmark; 1 stroke width for the icon tile.
- Minimum size: wordmark 72 px wide on screen (20 mm in print); icon 16 px. Below 48 px use the icon, not the wordmark.
- Favicon: use `favicon.svg`, with `favicon.ico` as fallback.

## 6. Do and do not

- Do use the light variant on light backgrounds and the dark variant on dark backgrounds; use mono when only one colour is available (stamps, embossing, fax-grade print).
- Do keep the arrow clockwise.
- Do not recolour outside the palette, stretch, outline, add shadows, gradients or glows, or put the logo on busy photos.
- Do not mirror the arrow, move it before the letters, or separate it from the wordmark in the primary logo.
- Do not rotate the logo in use. The upside-down view is an illustration of the concept only, and the result of that rotation is not a logo.

## 7. Using the files in the checker site

Not part of this task, and no change to the project plan. For reference: the site already allows `img-src 'self' data:`, so these lines are enough once the files are copied next to `index.html`:

```html
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="icon" href="favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="dyd-apple-touch-icon-180.png">
```

## 8. Before public use

- Run a trademark and domain search for `dyd` in the markets you care about (WIPO Global Brand Database, EUIPO, USPTO). This identity has not been cleared.
- Check the mark for confusion with existing security products. Only a preliminary look was possible.
- The artwork is released with the project under the same open licence unless you decide otherwise.
