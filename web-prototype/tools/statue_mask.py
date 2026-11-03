"""Cut the statue (halo, figure, pedestal) out of scene-cam2 so it can be drawn above the seated people.

In the CAM2 view the statue sits in front of the first row, so a person on the middle seat of that row must be
hidden behind it. The scene image has the statue baked in; this makes a transparent copy of just the statue pixels.
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

im = Image.open("assets/scene-cam2-day.webp").convert("RGB")
a = np.asarray(im).astype(int)
H, W, _ = a.shape
x0, x1, y0, y1 = int(.415 * W), int(.585 * W), int(.585 * H), int(.985 * H)
sub = a[y0:y1, x0:x1]
R, G, B = sub[..., 0], sub[..., 1], sub[..., 2]
gold = (R > 170) & (G > 110) & (B < 140) & ((R - B) > 80)
light = (R > 210) & (G > 165) & (B > 115) & (B < 220)
m = gold | light
m = ndi.binary_closing(m, iterations=7)
lab, n = ndi.label(m)
sizes = ndi.sum(m, lab, range(1, n + 1))
m = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 600])
m = ndi.binary_dilation(m, iterations=2)
holes = ndi.binary_fill_holes(m) & ~m
hl, hn = ndi.label(holes)
small = [i + 1 for i, a_ in enumerate(ndi.sum(holes, hl, range(1, hn + 1))) if a_ < 2500]  # tiny gaps in the robe, not the halo
m |= np.isin(hl, small)
full = np.zeros((H, W), bool)
full[y0:y1, x0:x1] = m
out = np.dstack([a.astype(np.uint8), (full * 255).astype(np.uint8)])
Image.fromarray(out, "RGBA").save("assets/fg-cam2-statue.webp", "WEBP", quality=90)
print("statue px:", int(full.sum()))
