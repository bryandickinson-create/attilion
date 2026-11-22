#!/bin/sh
# Builds dist/index.html (one self-contained file for GitHub Pages or opening locally)
# and dist/artifact.html (same page without the outer document, for a Claude artifact preview).
set -e
cd "$(dirname "$0")"
mkdir -p dist
FONTS='<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap">'
{
  echo '<title>Attillion</title>'
  echo '<meta name="claude:viewport-fit-sides" content="cover">'
  echo "$FONTS"
  echo '<style>'; cat src/style.css; echo '</style>'
  echo '<div id="app"></div>'
  echo '<script>'; cat src/prompts.js; echo '</script>'
  echo '<script>'; cat src/prompts2.js; echo '</script>'
  echo '<script>'; cat src/prompts3.js; echo '</script>'
  echo '<script>'; cat src/app.js; echo '</script>'
  echo '<script>'; cat src/fx.js; echo '</script>'
  echo '<script>'; cat src/sound.js; echo '</script>'
} > dist/artifact.html
{
  echo '<!doctype html><html lang="en"><head><meta charset="utf-8">'
  echo '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
  echo '<title>Attillion</title>'
  echo "$FONTS"
  echo '<style>'; cat src/style.css; echo '</style></head><body>'
  echo '<div id="app"></div>'
  echo '<script>'; cat src/prompts.js; echo '</script>'
  echo '<script>'; cat src/prompts2.js; echo '</script>'
  echo '<script>'; cat src/prompts3.js; echo '</script>'
  echo '<script>'; cat src/app.js; echo '</script>'
  echo '<script>'; cat src/fx.js; echo '</script>'
  echo '<script>'; cat src/sound.js; echo '</script>'
  echo '</body></html>'
} > dist/index.html
cp dist/index.html index.html
echo built
