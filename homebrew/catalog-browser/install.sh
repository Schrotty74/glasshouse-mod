#!/bin/sh
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP=/media/developer/apps/usr/palm/applications/org.webosbrew.hbchannel
[ "$(id -u)" = 0 ] || { echo 'Run this installer as root on the TV.' >&2; exit 1; }
[ -f "$APP/appinfo.json" ] || { echo 'Homebrew Channel is not installed.' >&2; exit 1; }
VERSION=$(node -p "require('$APP/appinfo.json').version")
[ "$VERSION" = 0.7.3 ] || { echo "This mod requires Homebrew Channel 0.7.3; found $VERSION." >&2; exit 1; }
(cd "$HERE" && sha256sum -c index.html.gz.sha256)
gzip -t "$HERE/index.html.gz"
NEW="$APP/index.html.catalog-browser-new"
trap 'rm -f "$NEW"' EXIT HUP INT TERM
gzip -dc "$HERE/index.html.gz" > "$NEW"
grep -q 'Catalog browser mod' "$NEW" || { echo 'Unexpected frontend payload.' >&2; exit 1; }
[ -f "$APP/index.html.pre-catalog-browser" ] || cp -p "$APP/index.html" "$APP/index.html.pre-catalog-browser"
chmod 644 "$NEW"
# Only a running Homebrew page must reload; no foreground app is launched.
luna-send -n 1 luna://com.webos.applicationManager/close '{"id":"org.webosbrew.hbchannel"}' >/dev/null 2>&1 || true
mv "$NEW" "$APP/index.html"
echo 'Catalog browser mod installed. Open Homebrew Channel when convenient.'
