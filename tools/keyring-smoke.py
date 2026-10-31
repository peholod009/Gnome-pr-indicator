#!/usr/bin/env python3
"""Exercise token persistence and locked-state handling in a disposable keyring."""
import os
import pathlib
import signal
import time
import re
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]

def inner():
    fixture_password = b'isolated-smoke-keyring-password'
    def daemon():
        subprocess.run(['gnome-keyring-daemon', '--unlock', '--components=secrets', '--control-directory='+str(pathlib.Path(os.environ['XDG_RUNTIME_DIR'])/'keyring')], input=fixture_password, check=True, stdout=subprocess.DEVNULL)
    def js(body):
        source = "import GLib from 'gi://GLib';\nimport Secret from 'gi://Secret';\nimport {SecretStore} from '" + (ROOT/'lib/secrets.js').as_uri() + "';\nconst store=new SecretStore();\n" + body
        script = pathlib.Path(os.environ['XDG_RUNTIME_DIR'])/'smoke.js'
        script.write_text(source)
        subprocess.run(['gjs', '-m', str(script)], check=True, timeout=15)
    daemon()
    js("await store.store('fictional-smoke-token',null); if(await store.status(null)!=='ready')throw Error('not ready'); print('PASS token_saved_in_disposable_keyring');")
    pid_text=subprocess.check_output(['gdbus','call','--session','--dest','org.freedesktop.DBus','--object-path','/org/freedesktop/DBus','--method','org.freedesktop.DBus.GetConnectionUnixProcessID','org.freedesktop.secrets'],text=True)
    pid=int(re.search(r'uint32 (\d+)',pid_text)[1]);os.kill(pid,signal.SIGTERM)
    for _ in range(100):
        if not pathlib.Path(f'/proc/{pid}').exists():break
        time.sleep(0.05)
    subprocess.run(['gnome-keyring-daemon', '--components=secrets', '--daemonize', '--control-directory='+str(pathlib.Path(os.environ['XDG_RUNTIME_DIR'])/'keyring')], check=True, stdout=subprocess.DEVNULL)
    js("if(await store.status(null)!=='locked')throw Error('expected locked after daemon restart, got '+await store.status(null)); let error;try{await store.lookup(null);}catch(e){error=e;}if(error?.kind!=='keyring-locked')throw Error('saved token misreported as missing'); print('PASS restart_preserves_token_but_reports_locked');")
    subprocess.run(['gnome-keyring-daemon','--replace','--unlock','--components=secrets','--control-directory='+str(pathlib.Path(os.environ['XDG_RUNTIME_DIR'])/'keyring')],input=fixture_password,check=True,stdout=subprocess.DEVNULL)
    js("for(let i=0;i<40&&await store.status(null)!=='ready';i++)await new Promise(r=>GLib.timeout_add(GLib.PRIORITY_DEFAULT,100,()=>{r();return GLib.SOURCE_REMOVE;}));if(await store.lookup(null)!=='fictional-smoke-token')throw Error('token lost'); await store.unlock(null); await store.clear(null);if(await store.status(null)!=='missing')throw Error('not deleted');print('PASS unlock_recovers_saved_token_without_resaving');")

if '--inner' in sys.argv:
    inner()
else:
    with tempfile.TemporaryDirectory(prefix='gnome-keyring-smoke-') as directory:
        base=pathlib.Path(directory)
        env=os.environ.copy()
        env['GIO_USE_VFS']='local'
        for key, suffix in [('XDG_DATA_HOME','data'),('XDG_CONFIG_HOME','config'),('XDG_CACHE_HOME','cache'),('XDG_RUNTIME_DIR','runtime')]:
            path=base/suffix;path.mkdir(mode=0o700);env[key]=str(path)
        env.pop('GNOME_KEYRING_CONTROL',None)
        env.pop('DISPLAY',None);env.pop('WAYLAND_DISPLAY',None)
        subprocess.run(['dbus-run-session','--',sys.executable,__file__,'--inner'],env=env,check=True,timeout=50)
