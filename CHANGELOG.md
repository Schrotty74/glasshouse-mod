# Glasshouse Mod changelog

## 0.139.2 — 2026-11-06

- Settings backups include weather, wallpaper images and selection, IPTV subscriptions and channel choices, Homebrew catalogs, and the complete Glasshouse configuration, including private credentials and custom configuration keys.
- Restores validate image files and checksums before applying settings, stage state files with rollback on write failure, preserve version 1 backups, and use restored catalogs when listing missing apps.
- IPTV caches are rebuilt from the restored subscriptions. Executable-client paths must already match the destination TV. Installed app packages, LG per-input game settings and machine-specific Home takeover snapshots are not copied. No real-TV restore or update installation was tested for this release.

## 0.139.1 — 2026-11-06

This release integrates the official Glasshouse 0.139.0 release and subsequent changes through upstream commit `b30e84a`.

### Official changes

- Internet TV on Glasshouse Home supports an existing M3U playlist or Xtream subscription, a numbered channel lineup, favourites, live previews, full-screen playback and a programme guide. Protected channels receive clearer error messages. Channel up and down turn guide pages.
- Glasshouse Home draws less while idle and reuses decoded Recent apps pictures. The clock waits for the layout to load.
- Glasshouse Home is available on webOS 11 without an experimental setting. webOS 3 can opt in through the existing experimental setting.
- Background-service controls can stop LG network-device scans and, on webOS 11, smart-home device polling.
- Screen savers can start when LG's own screen-saver setting is disabled. LCD models omit OLED-only readings.
- Magic Remote battery reporting supports categorical MR19 battery levels. Home Assistant volume, playback state and active-app reporting receive the official corrections.
- Web Audio apps support Play / Pause. Update blocking includes LG development-update and firmware-CDN hosts.
- Official translations and documentation include Internet TV, screen-saver examples, the Pane iPhone/iPad app and additional tested TVs.

### Fork features retained

- Short Apps and Inputs rows remain centered. Longer rows scroll from the left.
- The smaller clock stays lower on the left, with the large weather symbol and temperature beside it. Last watched stays on the right.
- The browser dashboard retains town and postal-code search, persistent place selection, and Hide weather.
- The TV retrieves weather through the Glasshouse service, reusing successful responses for one hour and retaining the existing temporary-failure behaviour.
- The four Waldsee PNGs remain available for the morning, afternoon, evening and night wallpaper slots.

### Fork updates

The built-in update checker, source download and IPK manifest download use releases from `Schrotty74/glasshouse-mod`. Version links in the dashboard and package source metadata point to the fork. Published stable releases with a higher numeric version are offered through the existing Check now and Install flow.

### Distribution

The release provides an installable IPK, its Homebrew Channel manifest, a source archive and the Waldsee wallpaper ZIP. It uses the official package installer to upgrade the existing Glasshouse installation in place. Settings, saved weather location, wallpaper uploads, app ordering and hidden tiles belong to the TV's data directory and are retained.
