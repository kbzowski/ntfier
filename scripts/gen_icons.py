#!/usr/bin/env python3
"""Generate app icons with rounded rectangle background from logo.png."""

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
LOGO_PATH = ROOT / "assets" / "logo.png"
ICONS_DIR = ROOT / "src-tauri" / "icons"

BG_COLOR = (30, 41, 59)  # #1e293b
CORNER_RADIUS_RATIO = 0.164  # ~18% of icon size (like iOS/macOS style)
LOGO_PADDING_RATIO = 0.05  # 5% padding around logo


def rounded_rect_mask(size, radius):
    """Create an anti-aliased rounded rectangle mask at 4x resolution."""
    scale = 4
    large = size * scale
    large_radius = radius * scale
    mask = Image.new("L", (large, large), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, large - 1, large - 1], large_radius, fill=255)
    return mask.resize((size, size), Image.LANCZOS)


def generate_icon(size):
    """Generate a single icon at the given size."""
    radius = int(size * CORNER_RADIUS_RATIO)
    padding = int(size * LOGO_PADDING_RATIO)

    # Create background with rounded corners
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    colored = Image.new("RGBA", (size, size), (*BG_COLOR, 255))
    mask = rounded_rect_mask(size, radius)
    bg.paste(colored, (0, 0), mask)

    # Resize logo to fit with padding
    logo = Image.open(LOGO_PATH).convert("RGBA")
    logo_size = size - 2 * padding
    logo_resized = logo.resize((logo_size, logo_size), Image.LANCZOS)

    # Composite logo onto background
    bg.paste(logo_resized, (padding, padding), logo_resized)
    return bg


def main():
    ICONS_DIR.mkdir(parents=True, exist_ok=True)

    # Generate PNG icons for Tauri
    png_sizes = {
        "32x32.png": 32,
        "64x64.png": 64,
        "128x128.png": 128,
        "128x128@2x.png": 256,
        "512x512.png": 512,
        "icon.png": 512,
    }

    for filename, size in png_sizes.items():
        icon = generate_icon(size)
        icon.save(ICONS_DIR / filename, "PNG")
        print(f"Generated {filename} ({size}x{size})")

    # Generate ICO with multiple sizes
    ico_sizes = [256, 64, 48, 32, 24, 16]
    ico_images = [generate_icon(s) for s in ico_sizes]

    # ICO needs the largest image as base, with others as additional sizes
    ico_images[0].save(
        ICONS_DIR / "icon.ico",
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
        append_images=ico_images[1:],
    )
    print(f"Generated icon.ico ({', '.join(f'{s}x{s}' for s in ico_sizes)})")

    # Generate ICNS for macOS
    icns_icon = generate_icon(512)
    icns_icon.save(ICONS_DIR / "icon.icns", format="ICNS")
    print("Generated icon.icns")

    print("\nDone!")


if __name__ == "__main__":
    main()
