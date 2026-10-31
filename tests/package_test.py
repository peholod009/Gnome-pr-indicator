import pathlib, subprocess, tempfile, unittest, zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
class PackageTest(unittest.TestCase):
    def test_zip_is_installable_and_excludes_private_scratch(self):
        with tempfile.TemporaryDirectory() as tmp:
            target=pathlib.Path(tmp)/'extension.zip'
            subprocess.run(['python3',str(ROOT/'tools/package.py'),'--output',str(target)],cwd=ROOT,check=True,capture_output=True)
            with zipfile.ZipFile(target) as z:
                names=set(z.namelist())
                self.assertTrue({'metadata.json','extension.js','prefs.js','stylesheet.css','schemas/gschemas.compiled','lib/github.js','lib/secrets.js'} <= names)
                for n in names:
                    self.assertFalse(n.startswith('/') or '..' in pathlib.PurePosixPath(n).parts)
                    self.assertFalse(any(x in n for x in ['.git/','.superpowers/','tests/','__pycache__','backup']))
                self.assertIsNone(z.testzip())
    def test_settings_schema_does_not_store_credentials(self):
        import xml.etree.ElementTree as E
        keys=E.parse(ROOT/'schemas/org.gnome.shell.extensions.gnome-pr-indicator.gschema.xml').findall('.//key')
        self.assertFalse(any(any(s in k.attrib['name'] for s in ['token','password']) for k in keys))
if __name__=='__main__': unittest.main()
