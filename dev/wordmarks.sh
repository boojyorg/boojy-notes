#!/bin/sh
# Regenerates one theme's wordmark from the master PNG: its teal becomes MARK,
# its black the theme's TEXT.primary (constants/themes.js). Run for both themes
# whenever either colour changes; the app never shows the master.
#   dev/wordmarks.sh light "#8FC1C6" "#14110F"
#   dev/wordmarks.sh dark  "#8FC1C6" "#E7E6E5"
set -eu
theme=$1 mark=$2 ink=$3
out=${OUT_DIR:-assets}
magick assets/boojy-notes-wordmark.png \( +clone -alpha extract \) \
  \( -clone 0 -alpha off -fuzz 12% -fill "$mark" -opaque "#A4CACE" +fuzz -fill "$ink" -opaque black \) \
  -delete 0 +swap -alpha off -compose CopyOpacity -composite "$out/boojy-notes-wordmark-$theme.png"
