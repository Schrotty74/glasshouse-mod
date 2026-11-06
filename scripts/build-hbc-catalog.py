#!/usr/bin/env python3
"""Create the fork's Homebrew Channel catalog from a verified release package."""

import argparse
import hashlib
import json
from pathlib import Path
import re

APP_ID = 'io.github.rorygallagher2024.lg-webos-dashboard'
REPOSITORY = 'https://github.com/Schrotty74/glasshouse-mod'


def build_catalog(manifest, ipk, tag):
    version = manifest.get('version', '')
    if not isinstance(version, str) or not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('the catalog requires a numeric release version')
    if tag != 'v' + version or manifest.get('id') != APP_ID:
        raise ValueError('release tag, version and app ID must match')
    if manifest.get('ipkUrl') != ipk.name:
        raise ValueError('the manifest must name the supplied IPK')
    digest = hashlib.sha256(ipk.read_bytes()).hexdigest()
    if digest != manifest.get('ipkHash', {}).get('sha256'):
        raise ValueError('IPK SHA-256 does not match the manifest')
    release = REPOSITORY + '/releases/download/' + tag + '/'
    package = dict(manifest)
    package.update({
        'title': 'Glasshouse Mod',
        'appDescription': 'Glasshouse with weather, centered Home rows and four Waldsee wallpapers for rooted LG TVs.',
        'sourceUrl': REPOSITORY,
        'ipkUrl': release + ipk.name,
        'ipkSize': ipk.stat().st_size,
    })
    return {
        'paging': {'page': 1, 'maxPage': 1},
        'packages': [{
            'id': APP_ID,
            'title': package['title'],
            'shortDescription': package['appDescription'],
            'iconUri': package.get('iconUri', ''),
            'manifestUrl': release + APP_ID + '.manifest.json',
            'manifest': package,
        }],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--ipk', type=Path, required=True)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--output', type=Path, default=Path('dist/repo.json'))
    args = parser.parse_args()
    try:
        catalog = build_catalog(json.loads(args.manifest.read_text()), args.ipk, args.tag)
    except (ValueError, OSError) as error:
        parser.exit(1, str(error) + '\n')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(catalog, indent=2) + '\n')
    print('Homebrew Channel catalog: ' + str(args.output))


if __name__ == '__main__':
    main()
