"""Turns the black-background Pete art into transparent, aligned PNG sprites.
pete.png and pete-cheer.png come out the same size with the desk/monitor lined up,
so the game can swap between them without anything jumping."""
from PIL import Image
import numpy as np
from collections import deque
import os, sys
# Usage: python3 tools/make_sprite.py [folder with pete-sprite-source.jpg & pete-cheer-source.jpg]
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')

def strip_black(im, thresh=30):
    a = np.asarray(im.convert('RGB')).astype(int)
    h, w, _ = a.shape
    mx = a.max(axis=2)
    dark = mx < thresh
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if dark[y, x] and not bg[y, x]: bg[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if dark[y, x] and not bg[y, x]: bg[y, x] = True; q.append((y, x))
    while q:  # flood fill from the edges so dark bits *inside* Pete stay solid
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and dark[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True; q.append((ny, nx))
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    nb = np.zeros_like(bg)
    nb[1:] |= bg[:-1]; nb[:-1] |= bg[1:]; nb[:, 1:] |= bg[:, :-1]; nb[:, :-1] |= bg[:, 1:]
    m = (~bg) & (mx < 55) & nb          # soften the very edge pixels
    alpha[m] = np.clip((mx[m] - thresh) * 255 // 25, 0, 255)
    return Image.fromarray(np.dstack([a.astype(np.uint8), alpha]), 'RGBA')

normal = Image.open(os.path.join(SRC, 'pete-sprite-source.jpg')).convert('RGB')
cheer = Image.open(os.path.join(SRC, 'pete-cheer-source.jpg')).convert('RGB')
# Cheer art is framed slightly differently: register it onto the normal frame
# (found by a brute-force search on the desk/monitor/keyboard area).
S, TX, TY = 0.97, 0, -16
cheer = cheer.transform((1024, 1024), Image.AFFINE, (1/S, 0, -TX/S, 0, 1/S, -TY/S), Image.BICUBIC, fillcolor=(0, 0, 0))

n = strip_black(normal); c = strip_black(cheer)
b1, b2 = n.getbbox(), c.getbbox()
box = (min(b1[0], b2[0]), min(b1[1], b2[1]), max(b1[2], b2[2]), max(b1[3], b2[3]))
print('crop box', box)
for img, name in ((n, 'pete.png'), (c, 'pete-cheer.png')):
    out = img.crop(box)
    out = out.resize((out.width // 2, out.height // 2), Image.LANCZOS)
    out.save(os.path.join(OUT, name))
    print(name, out.size)
