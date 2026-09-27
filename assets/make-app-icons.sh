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
