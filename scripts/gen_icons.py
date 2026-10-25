"""Draw the app icon as PNGs (home-screen icons for iOS/Android).

Usage: python3 scripts/gen_icons.py
"""
import os
import struct
import zlib

root = os.path.join(os.path.dirname(__file__), "..", "public")
BG, CREAM, CORAL, BLUE = (0x2B, 0x24, 0x20), (0xF6, 0xEF, 0xE4), (0xE8, 0x66, 0x4F), (0x3D, 0x7B, 0xE0)


def pixel(x, y, n):
    # 2x2 grid of squares, matching public/favicon.svg
    pad, gap = n * 0.2, n * 0.05
    size = (n - 2 * pad - gap) / 2
    for i, color in enumerate([CREAM, CORAL, BLUE, CREAM]):
        x0 = pad + (i % 2) * (size + gap)
        y0 = pad + (i // 2) * (size + gap)
        if x0 <= x < x0 + size and y0 <= y < y0 + size:
            return color
    return BG


def write_png(path, n):
    raw = b"".join(b"\x00" + bytes(c for x in range(n) for c in pixel(x, y, n)) for y in range(n))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 2, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(data)


write_png(os.path.join(root, "apple-touch-icon.png"), 180)
write_png(os.path.join(root, "icon-512.png"), 512)
