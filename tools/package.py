#!/usr/bin/env python3
"""Build an installable GNOME extension without including developer/private data."""
import argparse
import pathlib
import shutil
import subprocess
import tempfile
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
FILES = ['metadata.json', 'extension.js', 'prefs.js', 'stylesheet.css', 'README.md',
         'lib/settings.js', 'lib/model.js', 'lib/presentation.js', 'lib/github.js',
         'lib/secrets.js', 'lib/controller.js',
         'schemas/org.gnome.shell.extensions.gnome-pr-indicator.gschema.xml']

def package(output):
    output = pathlib.Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='gnome-pr-package-') as tmp:
        stage = pathlib.Path(tmp)
        for name in FILES:
            target = stage / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)
        subprocess.run(['glib-compile-schemas', '--strict', str(stage / 'schemas')], check=True)
        with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
            for name in FILES + ['schemas/gschemas.compiled']:
                archive.write(stage / name, name)
    print(output)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    package(parser.parse_args().output)
