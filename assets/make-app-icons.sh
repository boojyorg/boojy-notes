#!/bin/sh
# The app icons, generated from the N (boojy-notes-n.svg); never hand-edit the outputs.
# Needs rsvg-convert (librsvg) and magick.
set -e
cd "$(dirname "$0")"
TILE="#F8F8F8"
RES=../android/app/src/main/res
TMP=$(mktemp -d)
trap 'rm -r "$TMP"' EXIT

# The N's own drawing (its gradient and path), lifted out of its file so that
# file stays the only place the shape is drawn. Its coordinates are a 1024 canvas.
MARK=$(sed -e 's/<svg[^>]*>//' -e 's/<\/svg>//' boojy-notes-n.svg)

# art <tile> <scale> <px> <out>: the N on a 1024 canvas over <tile> (SVG, may be
# empty), at <scale> of its drawn size, with its soft shadow. It sits half a
# percent above centre: its weight is low, so centred it reads as sagging.
art() {
  cat > "$TMP/art.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#2A737D" flood-opacity=".2"/></filter>
$1
<g transform="translate(512 506.88) scale($2) translate(-512 -512)" filter="url(#shadow)">$MARK</g>
</svg>
SVG
  rsvg-convert -w "$3" -h "$3" "$TMP/art.svg" -o "$4"
}
ROUNDED="<rect width=\"1024\" height=\"1024\" rx=\"230\" fill=\"$TILE\"/>"
SQUARE="<rect width=\"1024\" height=\"1024\" fill=\"$TILE\"/>"

# macOS: Apple's icon grid (824 of 1024); full-bleed renders too large in the Dock.
art "$ROUNDED" 1.03 824 "$TMP/mac.png"
magick "$TMP/mac.png" -background none -gravity center -extent 1024x1024 boojy-notes-app-icon.png

# Windows and Linux draw icons edge to edge, so the tile fills the canvas.
art "$ROUNDED" 1.03 1024 boojy-notes-app-icon-full.png

# Google Play's listing icon: a full square, which Play cuts to its own shape.
art "$SQUARE" 1.03 512 ../store/play/icon-512.png

# Android: an adaptive icon, the tile colour behind the N alone. The launcher
# cuts the 108dp canvas to its own shape and may zoom it; only a 66dp circle is
# sure to show, and the N (39dp tall) sits well inside it. The older launchers'
# square and round icons are the same two layers cut as a Pixel draws them
# (the middle 72dp).
art "" 0.55 1080 "$TMP/foreground.png"
magick -size 1080x1080 "xc:$TILE" "$TMP/foreground.png" -composite \
  -gravity center -crop 720x720+0+0 +repage "$TMP/visible.png"
magick "$TMP/visible.png" \( +clone -alpha extract -fill black -colorize 100 \
  -fill white -draw "roundrectangle 0,0 719,719 150,150" \) -alpha off -compose copy_opacity \
  -composite "$TMP/square.png"
magick "$TMP/visible.png" \( +clone -alpha extract -fill black -colorize 100 \
  -fill white -draw "circle 360,360 360,0" \) -alpha off -compose copy_opacity \
  -composite "$TMP/round.png"
for density in mdpi:1 hdpi:1.5 xhdpi:2 xxhdpi:3 xxxhdpi:4; do
  dir="$RES/mipmap-${density%%:*}"
  scale=${density##*:}
  canvas=$(echo "108 * $scale" | bc | cut -d. -f1)
  icon=$(echo "48 * $scale" | bc | cut -d. -f1)
  magick "$TMP/foreground.png" -resize "${canvas}x${canvas}" "$dir/ic_launcher_foreground.png"
  magick "$TMP/square.png" -resize "${icon}x${icon}" "$dir/ic_launcher.png"
  magick "$TMP/round.png" -resize "${icon}x${icon}" "$dir/ic_launcher_round.png"
done
