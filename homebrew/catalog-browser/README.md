# Homebrew Channel catalog browser mod 1.0.0

A frontend modification for **Homebrew Channel 0.7.3** on a rooted LG TV. It adds:

- **Updates (count):** entries whose catalog version is newer than the installed version. Multiple sources for one app count as one update.
- **Installed / All apps:** show installed catalog apps or every catalog entry.
- **Newly discovered:** catalog entries first seen since the previous app visit. The first launch records a baseline; it does not mark every app as new. A version change alone is an update, not a new app.
- **Search:** match an app title, app ID or catalog name.
- **Catalog filter** and **A-Z / Z-A sorting**.

Different catalogs can carry the same app ID and remain separate entries. The All apps total counts entries; Updates and Installed count distinct app IDs. Installed status is checked through the existing Homebrew service. Older catalog versions are not advertised as updates.

The mod replaces only the Homebrew app's `index.html`. Its existing root service, startup hooks, app ID and repository settings stay in place. Discovery history is stored under the separate `catalogBrowserSeen.v1` localStorage key. An official Homebrew app update can replace this frontend; this installer refuses versions other than 0.7.3.

## Install on a TV

Download and extract [homebrew-catalog-browser-mod_1.0.0.zip](https://github.com/Schrotty74/glasshouse-mod/releases/download/v0.139.1/homebrew-catalog-browser-mod_1.0.0.zip) on a computer. In Terminal, enter the extracted folder, replace `TV_IP` with the TV's address and copy these files:

```sh
ssh root@TV_IP 'mkdir /tmp/hbc-catalog-browser-mod'
scp -O index.html.gz index.html.gz.sha256 install.sh restore.sh root@TV_IP:/tmp/hbc-catalog-browser-mod/
ssh -t root@TV_IP 'sh /tmp/hbc-catalog-browser-mod/install.sh'
```

The script verifies the compressed file's SHA-256, checks Homebrew version 0.7.3, saves the previous frontend once and installs the mod. It closes Homebrew if it is running and leaves the active TV input alone. Open Homebrew manually when ready. The app does not need a TV reboot.

After installation, remove the uploaded installer and payload:

```sh
ssh root@TV_IP 'rm -f /tmp/hbc-catalog-browser-mod/index.html.gz /tmp/hbc-catalog-browser-mod/index.html.gz.sha256 /tmp/hbc-catalog-browser-mod/install.sh /tmp/hbc-catalog-browser-mod/restore.sh; rmdir /tmp/hbc-catalog-browser-mod'
```

The saved frontend remains at:

```text
/media/developer/apps/usr/palm/applications/org.webosbrew.hbchannel/index.html.pre-catalog-browser
```

To restore it later, upload `restore.sh` again and run it on the TV:

```sh
ssh root@TV_IP 'mkdir /tmp/hbc-catalog-browser-mod'
scp -O restore.sh root@TV_IP:/tmp/hbc-catalog-browser-mod/
ssh -t root@TV_IP 'sh /tmp/hbc-catalog-browser-mod/restore.sh'
ssh root@TV_IP 'rm -f /tmp/hbc-catalog-browser-mod/restore.sh; rmdir /tmp/hbc-catalog-browser-mod'
```

Restoring the frontend retains catalog settings and discovery history.

## Rebuild from source

`source.patch` applies to [webosbrew/webos-homebrew-channel](https://github.com/webosbrew/webos-homebrew-channel) commit `6e928d01b21f0282a945ae2c8d3c65d25c9c1578`. The frontend remains ES5. Use Node 20, as the upstream Enyo build tools rely on APIs removed from newer Node versions.

```sh
git clone --recursive https://github.com/webosbrew/webos-homebrew-channel.git
cd webos-homebrew-channel
git checkout 6e928d01b21f0282a945ae2c8d3c65d25c9c1578
git submodule update --init --recursive
git apply /path/to/source.patch
npm ci
node tools/test-catalog-browser.js
npm run build -- --production
```

The result is `dist/index.html`. This package uses only that frontend, not the service files emitted or copied by the build. The original project is maintained by webOSBrew; this modification is distributed separately by the Glasshouse Mod fork. Component licenses are in `licenses/`.

## Validation

Tested on an LG G5 running webOS 10.3.1 with Homebrew 0.7.3: 261 entries from nine catalogs loaded with no catalog or installed-status errors. Pointer activation of the view buttons, typed search, the combined catalog filter and reverse sorting passed. Helper tests cover version comparisons, downgrades, duplicate sources, combined filters, first-visit baselines and unavailable local storage. The built script parses as ES5. The supplied installer was also run on the G5; the installed HTML checksum matched and HDMI 2 remained active. See `validation.json` for the recorded result.
