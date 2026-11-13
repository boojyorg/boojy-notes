#!/bin/sh
# Regenerates one theme's wordmark: "otes" from the master PNG in the theme's
# TEXT.primary (constants/themes.js), and the N from assets/boojy-notes-n.svg
# in the master N's place (171 wide, from the top-left corner). Run for both
# themes whenever the ink or the N changes; the app never shows the master.
# Needs rsvg-convert (librsvg) and magick.
#   dev/wordmarks.sh light "#14110F"
#   dev/wordmarks.sh dark  "#E7E6E5"
set -eu
theme=$1 ink=$2
out=${OUT_DIR:-assets}
tmp=$(mktemp -d)
trap 'rm -r "$tmp"' EXIT
rsvg-convert -w 171 assets/boojy-notes-n.svg -o "$tmp/n.png"
magick assets/boojy-notes-wordmark.png -fill "$ink" -colorize 100 \
  \( -size 185x226 xc:none \) -compose Copy -composite \
  "$tmp/n.png" -compose Over -composite "$out/boojy-notes-wordmark-$theme.png"
