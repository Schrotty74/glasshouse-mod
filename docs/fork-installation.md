# Glasshouse Mod auf dem LG-Fernseher installieren

Dieser Fork ergänzt Glasshouse um Wetter neben der Uhr, mittig angeordnete Apps und HDMI-Eingänge sowie vier Waldsee-Hintergründe. Die folgende Anleitung installiert das veröffentlichte Paket und übernimmt eine vorhandene Glasshouse-Installation. Auf einem LG G5 mit webOS 10.3.1 wurde Version 0.139.1 so installiert; die Einstellungen und hochgeladenen Hintergründe blieben unverändert.

![Glasshouse Mod auf einem LG G5 mit Wetter und Waldsee-Hintergrund](screenshots/glasshouse-mod-home.png)

## Voraussetzungen

- Ein gerooteter LG-Fernseher mit installiertem [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) und aktiviertem SSH-Zugang.
- Ein Computer im selben Netzwerk mit SSH und SCP, etwa ein Mac mit Terminal.
- Die IP-Adresse des Fernsehers und dessen SSH-Zugangsdaten.

Glasshouse selbst unterstützt mehrere webOS-Versionen. Die [Kompatibilitätsübersicht](tested-tvs.md) beschreibt das Originalprojekt; der Fork wurde auf dem genannten G5 geprüft.

## 1. Das Paket herunterladen

Öffne die [Releases dieses Forks](https://github.com/Schrotty74/glasshouse-mod/releases/latest). Lade unter **Assets** die Datei mit der Endung `.ipk` herunter. Für Version 0.139.1 heißt sie:

```text
io.github.rorygallagher2024.lg-webos-dashboard_0.139.1_all.ipk
```

Die gleichnamige `.manifest.json` enthält unter `ipkHash.sha256` die Prüfsumme. Auf dem Mac lässt sich die heruntergeladene Datei prüfen mit:

```sh
shasum -a 256 ~/Downloads/io.github.rorygallagher2024.lg-webos-dashboard_0.139.1_all.ipk
```

Das Ergebnis muss mit der Prüfsumme im Manifest übereinstimmen. **Source code** ist der Quellcode, kein installierbares TV-Paket. Für spätere Versionen müssen die Dateinamen in den folgenden Befehlen entsprechend angepasst werden.

## 2. Das Paket auf den Fernseher kopieren

Ersetze `TV_IP` durch die Adresse deines Fernsehers. Die folgenden Befehle laufen auf dem Computer. Gib das SSH-Passwort des Fernsehers ein, wenn danach gefragt wird.

```sh
scp -O ~/Downloads/io.github.rorygallagher2024.lg-webos-dashboard_0.139.1_all.ipk root@TV_IP:/media/internal/glasshouse-mod_0.139.1.ipk
ssh -t root@TV_IP
```

Danach laufen die eingegebenen Befehle auf dem Fernseher.

## 3. Installieren und den Dienst aktualisieren

Eine vorhandene offizielle Glasshouse-Installation **nicht vorher deinstallieren**. Der Fork verwendet dieselbe App-ID und aktualisiert sie an Ort und Stelle.

Starte auf dem Fernseher die Paketinstallation:

```sh
luna-send -i luna://com.webos.appInstallService/dev/install '{"id":"io.github.rorygallagher2024.lg-webos-dashboard","ipkUrl":"/media/internal/glasshouse-mod_0.139.1.ipk","subscribe":true}'
```

Warte, bis die Ausgabe `"state":"installed"` enthält. Beende dann mit **Strg+C** nur die laufende Statusabfrage. Bei einer Fehlermeldung hier aufhören und den Dienst noch nicht aktualisieren.

Installiere anschließend den enthaltenen Dienst. Dadurch wird Glasshouse neu gestartet; ein Neustart des Fernsehers ist nicht nötig:

```sh
sh /media/developer/apps/usr/palm/applications/io.github.rorygallagher2024.lg-webos-dashboard/payload/install.sh
```

Der Installer übernimmt die vorhandene Konfiguration in `/var/lib/tvweb`. Wetterort, App-Reihenfolge, ausgeblendete Kacheln und hochgeladene Hintergründe bleiben dort erhalten.

## 4. Version und Update-Quelle prüfen

```sh
node /var/lib/tvweb/tvweb.js --check-update
grep '^var UPDATE_REPO' /var/lib/tvweb/lib/updater.js
```

Die erste Abfrage nennt die installierte und die neueste veröffentlichte Version. Die zweite muss anzeigen:

```text
var UPDATE_REPO = 'Schrotty74/glasshouse-mod';
```

Entferne anschließend die hochgeladene Installationsdatei und beende SSH:

```sh
rm /media/internal/glasshouse-mod_0.139.1.ipk
exit
```

Öffne auf dem Computer `http://TV_IP:8080/`. Die Adresse gehört weiterhin dem Fernseher; der Fork benötigt keine eigene IP-Adresse. Bei einer bestehenden Installation gelten der bisherige Port und gegebenenfalls die vorhandene Zugangssicherung. Bei einer neuen Installation kann der erste Start der **Glasshouse**-App auf dem TV nötig sein, um den Netzwerkzugriff im Einrichtungsdialog freizugeben.

## 5. Home, Wetter und Waldsee einrichten

- Unter **Home** die Option **Use Glasshouse Home** wählen und bestätigen.
- Unter **Home → Weather** nach einem Ort suchen und den passenden Listeneintrag auswählen. Erfolgreich geladene Wetterdaten werden eine Stunde zwischengespeichert.
- Aus dem Release `waldsee-wallpapers.zip` herunterladen und entpacken. Unter **Home → Wallpaper → Your own** die Dateien den vier Tageszeiten zuweisen: `morning.png`, `afternoon.png`, `evening.png` und `night.png`.

Die Bilder werden erst durch das Hochladen ausgewählt. Eine bereits vorhandene Hintergrundauswahl bleibt beim Update erhalten.

## Spätere Updates

Die Update-Funktion unter **Server** sucht nach stabilen Releases von `Schrotty74/glasshouse-mod`. Mit **Check now** prüfen und ein angebotenes Update mit **Install** installieren. Angeboten werden veröffentlichte Releases mit höherer numerischer Versionsnummer und den zugehörigen Installationsdateien. Ein Commit oder ein Vorab-Release allein erzeugt kein solches Angebot.

Der Glasshouse-Eintrag im Standardkatalog des Homebrew Channels gehört weiterhin zum offiziellen Projekt. Für diesen Fork dessen eigene Update-Funktion oder das IPK aus den Fork-Releases verwenden.

Bei Problemen helfen der Dienststatus und das lokale Protokoll auf dem Fernseher:

```sh
/var/lib/tvweb/tvwebctl status
tail -n 60 /var/lib/tvweb/tvweb.log
```
