"""Cut the white background out of the generated 2D sprites and save trimmed RGBA WebP files.

    python tools/cut.py SRC_DIR OUT_DIR

- Background = near-white pixels connected to the image border (flood fill), so white inside a figure stays.
- White pockets fully enclosed by the figure (between an arm and the body) are removed too when they are big and
  pure white.
- Edges are eroded by one pixel and feathered so no white halo remains on a dark background.
- Each sprite is trimmed to its content. A small JSON file records the original size and the trim box.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

NEAR_WHITE = 236
POCKET_WHITE = 247
POCKET_MIN_AREA = 350


def cut(im: Image.Image) -> Image.Image:
    rgb = np.asarray(im.convert("RGB")).astype(np.int16)
    cand = rgb.min(axis=2) >= NEAR_WHITE
    labels, n = ndi.label(cand)
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    bg = np.isin(labels, border[border > 0])
    # enclosed pure-white pockets
    pure = (rgb.min(axis=2) >= POCKET_WHITE) & ~bg
    plabels, pn = ndi.label(pure)
    if pn:
        areas = ndi.sum(pure, plabels, index=np.arange(1, pn + 1))
        big = np.where(areas >= POCKET_MIN_AREA)[0] + 1
        bg |= np.isin(plabels, big)
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    a = Image.fromarray(alpha, "L").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    out = im.convert("RGBA")
    out.putalpha(a)
    return out


def trim(im: Image.Image, pad: int = 3):
    box = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    if not box:
        return im, (0, 0, im.width, im.height)
    l, t, r, b = box
    l, t, r, b = max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad)
    return im.crop((l, t, r, b)), (l, t, r, b)


def main(src: Path, out: Path, max_side: int = 760) -> None:
    out.mkdir(parents=True, exist_ok=True)
    meta = {}
    for path in sorted(src.glob("*.png")):
        name = path.stem
        if name.startswith("scene-") or name in ("share-og",):
            continue
        im = Image.open(path)
        cut_im, box = trim(cut(im))
        scale = min(1.0, max_side / max(cut_im.size))
        if scale < 1:
            cut_im = cut_im.resize((round(cut_im.width * scale), round(cut_im.height * scale)), Image.LANCZOS)
        cut_im.save(out / f"{name}.webp", "WEBP", quality=88, method=6)
        meta[name] = {"w": cut_im.width, "h": cut_im.height, "orig": [im.width, im.height], "box": list(box), "scale": round(scale, 4)}
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    print(f"{len(meta)} sprites -> {out}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
