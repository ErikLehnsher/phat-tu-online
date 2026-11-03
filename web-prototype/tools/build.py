"""Build the web assets from the cut sprites (raw/) and the original scenes.

    python tools/build.py

- copies the characters, cushions, doors, statue, props and fx into assets/
- splits the decoration sheets (lanterns, cat, petals, ...) into separate files
- measures each character's head width (in original pixels) and writes assets/meta.json so every pose of every
  character can be drawn at a consistent size: standing/walking poses and seated poses are scaled separately
  so the head stays the same size when a person sits down.
"""
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.ndimage import uniform_filter1d

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
OUT = ROOT / "assets"
SRC = Path("/home/user/eriklehnsher/phat-tu-online/phat-tu-2d")

TYPES = ["laym", "layf", "nun", "monk", "casualm", "casualf", "elder", "kid", "funny-laym"]
STAND = ["stand", "step-l", "step-r"]
SEATED = ["sit", "pray", "mo", "lay1", "lay2", "lay3", "incense", "kneel-mid"]


def head_width(path: Path):
    a = np.asarray(Image.open(path).getchannel("A")) > 128
    h = a.shape[0]
    width = np.array([(np.where(r)[0].max() - np.where(r)[0].min() + 1) if r.any() else 0 for r in a], float)
    s = uniform_filter1d(width, max(3, h // 60))
    peak, pi = s[int(h * 0.02)], int(h * 0.02)
    for y in range(int(h * 0.02), int(h * 0.55)):
        if s[y] > peak:
            peak, pi = s[y], y
        elif peak > 0 and s[y] < peak * 0.88 and y - pi > h * 0.01:
            return float(peak)
    return None


def split_sheet(name: str, min_area: int = 1500, grow: int = 14):
    im = Image.open(RAW / f"{name}.webp").convert("RGBA")
    alpha = np.asarray(im.getchannel("A")) > 40
    grown = ndi.binary_dilation(alpha, iterations=grow)
    labels, n = ndi.label(grown)
    items = []
    for i, sl in enumerate(ndi.find_objects(labels), 1):
        if sl is None:
            continue
        mask = (labels[sl] == i) & alpha[sl]
        if mask.sum() < min_area:
            continue
        crop = im.crop((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop))
        items.append((sl[0].start, sl[1].start, crop))
    # reading order: rows then columns
    items.sort(key=lambda t: (round(t[0] / 120), t[1]))
    names = []
    for k, (_, _, crop) in enumerate(items):
        box = crop.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
        crop = crop.crop(box) if box else crop
        file = f"{name}-{k}.webp"
        crop.save(OUT / file, "WEBP", quality=88, method=6)
        names.append(file)
    return names


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    raw_meta = json.loads((RAW / "meta.json").read_text())
    meta = {"sprites": {}, "types": {}, "deco": {}}

    # characters
    for t in TYPES:
        for view in ("front", "back"):
            stand_heads, seated_heads = [], []
            for p in STAND:
                n = f"{t}-{view}-{p}"
                if n in raw_meta:
                    hw = head_width(RAW / f"{n}.webp")
                    if hw:
                        stand_heads.append(hw / raw_meta[n]["scale"])
            for p in ("sit", "pray"):
                n = f"{t}-{view}-{p}"
                if n in raw_meta:
                    hw = head_width(RAW / f"{n}.webp")
                    if hw:
                        seated_heads.append(hw / raw_meta[n]["scale"])
            hs = float(np.mean(stand_heads)) if stand_heads else None
            hq = float(np.mean(seated_heads)) if seated_heads else None
            if t.startswith("funny"):
                # chibi proportions: the head is half the figure, so size by height relative to the adult set instead
                ref = meta["types"][f"laym-{view}"]
                def orig_h(n):
                    return raw_meta[n]["h"] / raw_meta[n]["scale"]
                hs = ref["stand_head"] * orig_h(f"{t}-{view}-stand") / ref["stand_h"] / 0.46
                hq = ref["seated_head"] * orig_h(f"{t}-{view}-sit") / ref["seated_h"] / 0.56
            meta["types"][f"{t}-{view}"] = {"stand_head": hs, "seated_head": hq}
            if t == "laym":
                meta["types"][f"{t}-{view}"]["stand_h"] = raw_meta[f"{t}-{view}-stand"]["h"] / raw_meta[f"{t}-{view}-stand"]["scale"]
                meta["types"][f"{t}-{view}"]["seated_h"] = raw_meta[f"{t}-{view}-sit"]["h"] / raw_meta[f"{t}-{view}-sit"]["scale"]
            for p in STAND + SEATED:
                n = f"{t}-{view}-{p}"
                if n not in raw_meta:
                    continue
                head = hs if p in STAND else hq
                head = head or hs or hq
                shutil.copy(RAW / f"{n}.webp", OUT / f"{n}.webp")
                m = raw_meta[n]
                # f * (c * spacing_px) = screen px per stored px
                meta["sprites"][n] = {"w": m["w"], "h": m["h"], "f": round((1 / m["scale"]) / head, 6)}

    # scenery, doors, cushions, statue, props, fx
    for n in ["door-cam1", "door-cam2", "cushion-low", "cushion-high", "statue-front", "statue-back", "statue-halo", "altar-table-front", "altar-table-back",
              "prop-mo-idle", "prop-mo-hit", "prop-bowl", "prop-mala", "prop-incense-unlit", "prop-incense-lit", "prop-incense-burnt", "fx-smoke", "fx-ripple",
              "icon-mo", "icon-lay", "icon-incense", "sign-room"]:
        if (RAW / f"{n}.webp").exists():
            shutil.copy(RAW / f"{n}.webp", OUT / f"{n}.webp")
            im = Image.open(OUT / f"{n}.webp")
            meta["deco"][n] = {"w": im.width, "h": im.height}
    for cam in ("cam1", "cam2", "cam3"):
        for tod in ("day", "night"):
            src = SRC / (f"scene-{cam}-day-2560.png" if tod == "day" else f"scene-{cam}-night.png")
            Image.open(src).convert("RGB").resize((2400, 1350), Image.LANCZOS).save(OUT / f"scene-{cam}-{tod}.webp", "WEBP", quality=84, method=6)

    # decoration sheets -> separate items
    for sheet in ("deco-lanterns", "deco-cat", "deco-flames", "deco-petals", "deco-nature", "deco-plants", "deco-altar-goods", "deco-wall", "deco-door-area", "deco-light"):
        names = split_sheet(sheet)
        for f in names:
            im = Image.open(OUT / f)
            meta["deco"][f[:-5]] = {"w": im.width, "h": im.height}
        print(sheet, "->", len(names), "items")
    (OUT / "meta.json").write_text(json.dumps(meta, indent=1))
    import runpy
    runpy.run_path(str(ROOT / "tools" / "statue_mask.py"))
    total = sum(p.stat().st_size for p in OUT.iterdir()) / 1e6
    print(f"assets: {len(list(OUT.iterdir()))} files, {total:.1f} MB")


if __name__ == "__main__":
    main()
