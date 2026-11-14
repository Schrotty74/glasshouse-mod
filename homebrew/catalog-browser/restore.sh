#!/bin/sh
set -eu
APP=/media/developer/apps/usr/palm/applications/org.webosbrew.hbchannel
[ "$(id -u)" = 0 ] || { echo 'Run this restore script as root on the TV.' >&2; exit 1; }
[ -f "$APP/index.html.pre-catalog-browser" ] || { echo 'No saved frontend is available.' >&2; exit 1; }
VERSION=$(node -p "require('$APP/appinfo.json').version")
[ "$VERSION" = 0.7.3 ] || { echo 'Homebrew version changed; the old frontend will not be restored.' >&2; exit 1; }
cp -p "$APP/index.html.pre-catalog-browser" "$APP/index.html.catalog-browser-restore"
luna-send -n 1 luna://com.webos.applicationManager/close '{"id":"org.webosbrew.hbchannel"}' >/dev/null 2>&1 || true
mv "$APP/index.html.catalog-browser-restore" "$APP/index.html"
echo 'Previous Homebrew frontend restored. Catalog settings are retained.'
