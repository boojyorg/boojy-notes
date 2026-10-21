#!/bin/sh
# The app icons, generated from the full-bleed source; never hand-edit the outputs.
set -e
cd "$(dirname "$0")"
SRC=boojy-notes-app-icon-source.png

# macOS: Apple's icon grid (824 of 1024); full-bleed renders too large in the Dock.
magick $SRC -resize 824x824 -background none -gravity center -extent 1024x1024 \
  boojy-notes-app-icon.png

# Windows and Linux draw icons edge to edge, so the tile fills the canvas, and
# the wordmark is 10% larger on its tile: on a pale taskbar the white tile's
# edge fades and the word is what reads. The wordmark's box in the source
# (98,422 875x243) is cleared to the tile's colour and redrawn about its centre.
TMP=$(mktemp -d)
magick $SRC -crop 875x243+98+422 +repage "$TMP/wordmark.png"
magick $SRC -fill "#F8F8F8" -draw "rectangle 98,422 972,664" \
  \( "$TMP/wordmark.png" -resize 110% \) -gravity northwest -geometry +54+409 -composite \
  -resize 1024x1024 boojy-notes-app-icon-full.png
rm -r "$TMP"

# Android: an adaptive icon, a tile colour behind the wordmark alone. The
# launcher cuts the 108dp canvas to its own shape and may zoom it; only a
# 66dp circle is sure to show, so the wordmark (3.6:1) is 58% of the canvas
# wide, its corners inside that circle. The older launchers' square and round
# icons are the same two layers cut as a Pixel draws them (the middle 72dp).
TILE="#F8F8F8"
RES=../android/app/src/main/res
TMP=$(mktemp -d)
magick $SRC -crop 875x243+98+422 +repage "$TMP/wordmark.png"
magick -size 1080x1080 xc:none \( "$TMP/wordmark.png" -resize 626x \) -gravity center \
  -composite "$TMP/foreground.png"
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
rm -r "$TMP"
