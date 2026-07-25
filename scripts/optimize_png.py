"""One-off local optimization pass over public/pousadas and public/species.

Generates a same-name .webp sibling next to every .png (e.g. foo.png ->
foo.webp) and leaves the original .png untouched. The frontend's
<PictureImg> component prefers the .webp via a <picture><source> and falls
back to the original .png for anything that doesn't have (or doesn't
support) one — so this needs no database changes, since the .png URLs
already stored in Supabase keep working exactly as before.
"""
from pathlib import Path
from PIL import Image

MAX_DIM = 1920
QUALITY = 82
TARGETS = [
    Path(__file__).resolve().parent.parent / "public" / "pousadas",
    Path(__file__).resolve().parent.parent / "public" / "species",
]

total_png = 0
total_webp = 0

for folder in TARGETS:
    for path in sorted(folder.glob("*.png")):
        webp_path = path.with_suffix(".webp")
        png_size = path.stat().st_size
        total_png += png_size

        with Image.open(path) as img:
            img = img.convert("RGB")
            w, h = img.size
            if max(w, h) > MAX_DIM:
                scale = MAX_DIM / max(w, h)
                img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
            img.save(webp_path, format="WEBP", quality=QUALITY, method=6)

        webp_size = webp_path.stat().st_size
        total_webp += webp_size
        print(f"{path.name}: {png_size/1024:.0f}KB -> {webp_path.name} {webp_size/1024:.0f}KB")

print(f"\nTotal PNG: {total_png/1024/1024:.1f}MB  |  Total WebP: {total_webp/1024/1024:.1f}MB")
