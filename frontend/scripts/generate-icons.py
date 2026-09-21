"""Convert the approved transparent icon into the existing platform assets.

Requires Pillow. Run from any directory; no application build is performed.
"""
from pathlib import Path
from io import BytesIO
import os
import subprocess
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / 'assets/branding/bemo.png'
VECTOR = ROOT / 'assets/branding/bemo.svg'
# SHARP_MODULE may point to an existing installation; no downloads are needed.
subprocess.run(['node', '-e', '''
const sharp = require(process.env.SHARP_MODULE || 'sharp');
sharp(process.argv[1], { density: 576 }).resize(4096, 4096).png().toFile(process.argv[2]);
''', str(VECTOR), str(MASTER)], check=True, env=os.environ)

with Image.open(MASTER) as source:
    icon = source.convert('RGBA')

def png(target, size, padding=0):
    canvas = Image.new('RGBA', (size, size))
    side = round(size * (1 - 2 * padding))
    resized = icon.resize((side, side), Image.Resampling.LANCZOS)
    canvas.alpha_composite(resized, ((size-side)//2, (size-side)//2))
    canvas.save(target)

png(ROOT / 'assets/readme/logo.png', 512)
png(ROOT / 'frontend/public/favicon.png', 48)
for size in (192, 512):
    png(ROOT / f'frontend/public/icons/icon-{size}.png', size)

desktop = ROOT / 'frontend/src-tauri/icons'
for target in desktop.glob('*.png'):
    with Image.open(target) as existing:
        size = existing.width
    png(target, size)
large = icon.resize((1024, 1024), Image.Resampling.LANCZOS)
large.save(desktop / 'icon.ico', sizes=[(n, n) for n in (16, 24, 32, 48, 64, 128, 256)])
large.save(desktop / 'icon.icns')

android = ROOT / 'frontend/android/app/src/main/res'
# Android applies its own outer mask. Its foreground must contain only the bear,
# not the rounded yellow tile from the desktop icon.
ET.register_namespace('', 'http://www.w3.org/2000/svg')
foreground = ET.fromstring(VECTOR.read_text(encoding='utf-8'))
ns = '{http://www.w3.org/2000/svg}'
foreground.remove(foreground.find(f'{ns}rect'))
art = ET.Element(f'{ns}g', {'transform': 'translate(87.04 73.84) scale(0.66)'})
for child in list(foreground):
    if child.tag not in (f'{ns}title', f'{ns}defs'):
        foreground.remove(child)
        art.append(child)
foreground.append(art)
foreground_svg = ET.tostring(foreground, encoding='utf-8')
foreground_png = subprocess.run(['node', '-e', '''
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const fs = require('fs');
sharp(fs.readFileSync(0), { density: 576 }).resize(4096, 4096).png().toBuffer().then(b => process.stdout.write(b));
'''], input=foreground_svg, stdout=subprocess.PIPE, check=True, env=os.environ).stdout
with Image.open(BytesIO(foreground_png)) as source:
    android_foreground = source.convert('RGBA')
for density, size in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
    folder = android / f'mipmap-{density}'
    for name in ('ic_launcher.png', 'ic_launcher_round.png'):
        png(folder / name, size)
    side = round(size * 108 / 48)
    android_foreground.resize((side, side), Image.Resampling.LANCZOS).save(folder / 'ic_launcher_foreground.png')

# All SVG entry points use the actual vector master, never embedded bitmaps.
svg = VECTOR.read_text(encoding='utf-8')
for target in (ROOT / 'assets/readme/logo.svg', ROOT / 'frontend/public/favicon.svg'):
    target.write_text(svg, encoding='utf-8')
print('Generated README, Web/PWA, desktop and Android icons from', MASTER)
