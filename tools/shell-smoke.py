#!/usr/bin/env python3
"""Run our UI against GNOME 46 in a disposable headless session, not the user's Shell."""
import os, pathlib, shutil, subprocess, tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='gnome-shell-smoke-') as tmp:
    temp=pathlib.Path(tmp)
    extension=temp/'data/gnome-shell/extensions/gnome-pr-indicator@extensions.local'
    shutil.copytree(ROOT,extension,ignore=shutil.ignore_patterns('.git','.superpowers','__pycache__'))
    if os.environ.get('GNOME_PR_SMOKE_BASELINE') == '1':
        for name in ['extension.js','prefs.js','lib/settings.js','lib/presentation.js','stylesheet.css','metadata.json','schemas/org.gnome.shell.extensions.gnome-pr-indicator.gschema.xml']:
            (extension/name).write_bytes(subprocess.check_output(['git','show',f'HEAD:{name}'],cwd=ROOT))
    (extension/'extension.js').rename(extension/'actual-extension.js')
    (extension/'extension.js').write_text('''
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Indicator from './actual-extension.js';
export default class Smoke extends Indicator {
 enable(){super.enable();GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,2,()=>{
  let failures=0;
  const test=(name,fn)=>{try{fn();print('SMOKE PASS '+name);}catch(e){failures++;print('SMOKE FAIL '+name+': '+e.message);}};
  const fixture=()=>{this._state={pulls:[{number:1,title:'Fixture only',state:'open',url:'https://github.com/example/fixture/pull/1',checks:[],complete:true,warnings:[],summary:{state:'none',total:0,passed:0}}],loading:false,error:null,stale:false,lastUpdated:1,warnings:[]};this._controller.state=this._state;this._render();};
  fixture();
  test('left_indicator_keeps_system_positions_when_margins_change',()=>{
    const layout=()=>{Main.panel.queue_relayout();Main.panel.allocate(Main.panel.get_allocation_box());};
    const native=Main.panel.statusArea.activities.container;
    const initial=Main.panel._leftBox.get_children();if(initial.indexOf(native)>initial.indexOf(this._button.container))throw Error('Initial placement precedes system workspaces');
    this._settings.set_string('position','right');layout();const baseline=native.get_transformed_position()[0];
    this._settings.set_string('position','left');layout();
    const children=Main.panel._leftBox.get_children();
    if(children.indexOf(native)>children.indexOf(this._button.container))throw Error('Our indicator precedes system workspaces');
    const system=children.filter(actor=>actor!==this._button.container);
    const coords=system.map(actor=>actor.get_transformed_position()[0]);
    if(native.get_transformed_position()[0]!==baseline)throw Error('Moving indicator left moved workspaces');
    this._settings.set_int('panel-left-margin-left',150);this._settings.set_int('panel-left-margin-right',180);layout();
    for(let i=0;i<system.length;i++)if(system[i].get_transformed_position()[0]!==coords[i])throw Error('Margins shifted a system indicator');
    this._settings.set_int('panel-left-margin-left',0);this._settings.set_int('panel-left-margin-right',0);
  });
  test('submenu_parent_lifecycle',()=>{const sub=this._sections.get(1);if(sub._getTopMenu()!==this._button.menu)throw Error('PR submenu is detached from top-level menu');this._button.menu.open(false);sub.menu.open(false);sub.menu.close(false);this._button.menu.close(false);});
  test('position_moves_panel_container',()=>{this._settings.set_string('position','left');if(this._button.container.get_parent()!==Main.panel._leftBox)throw Error('Container did not move');if(this._button.get_parent()!==this._button.container)throw Error('Button detached from container');});
  test('manual_refresh_available_after_rate_limit',()=>{fixture();this._state.error={kind:'rate-limit',message:'limit',retryAt:Date.now()/1000+5};this._render();const button=this._button.menu._getMenuItems().find(i=>i.label?.text==='Обновить');if(!button.getSensitive())throw Error('Manual action is permanently disabled');});
  test('hidden_summary_not_duplicated_for_empty_checks',()=>{this._settings.set_boolean('menu-summary',false);fixture();const sub=this._sections.get(1);if(sub.menu._getMenuItems().some(i=>i.label?.text?.includes('Нет проверок')))throw Error('Disabled summary still displayed');});
  test('per_position_margins_change_real_container_geometry',()=>{
    if(!this._settings.settings_schema.has_key('panel-left-margin-left'))throw Error('Per-position margin settings are missing');
    const cases=[['left',11,17],['center',23,29],['right',31,37]];
    for(const [position,left,right] of cases){
      this._settings.set_string('position',position);
      this._settings.set_int(`panel-${position}-margin-left`,0);this._settings.set_int(`panel-${position}-margin-right`,0);
      const actor=this._button.container;const before=actor.get_preferred_width(-1)[1];
      this._settings.set_int(`panel-${position}-margin-left`,left);this._settings.set_int(`panel-${position}-margin-right`,right);
      const theme=actor.get_theme_node();
      if(theme.get_margin(St.Side.LEFT)!==left||theme.get_margin(St.Side.RIGHT)!==right)throw Error('Incorrect margins for '+position);
      const after=actor.get_preferred_width(-1)[1];if(after-before!==left+right)throw Error('Margins did not change outer width for '+position+': '+before+' -> '+after);
    }
    this._settings.set_string('position','left');if(this._button.container.get_theme_node().get_margin(St.Side.LEFT)!==11)throw Error('Switching position lost stored margin');
  });
  test('PR_badges_are_colored_in_panel_and_menu',()=>{
    if(!this._settings.settings_schema.has_key('color-states'))throw Error('PR state color setting missing');
    this._settings.set_boolean('menu-state',true);this._settings.set_boolean('color-states',true);this._settings.set_boolean('panel-state',true);fixture();
    const expected=[['open',63,185,80],['draft',145,152,161],['closed',248,81,73],['merged',163,113,247]];
    const base=this._state.pulls[0];this._state.pulls=expected.map(([state],i)=>({...base,number:i+1,state}));this._render();
    const badges=this._box.get_children().filter(x=>x.has_style_class_name?.('gnome-pr-panel-item')).map(x=>x.get_children().find(y=>y.has_style_class_name?.('gnome-pr-state')));
    if(badges.length!==4)throw Error('Panel state badges missing');
    for(let i=0;i<expected.length;i++){
      const [state,r,g,b]=expected[i];
      const menuBadge=this._sections.get(i+1).get_children().find(x=>x.has_style_class_name?.('gnome-pr-state'));
      for(const badge of [badges[i],menuBadge]){const c=badge.get_theme_node().get_foreground_color();if(c.red!==r||c.green!==g||c.blue!==b)throw Error('Incorrect color for '+state);}
    }
    this._settings.set_boolean('color-states',false);
    const neutral=this._sections.get(1).get_children().find(x=>x.has_style_class_name?.('gnome-pr-state'));
    if(neutral.has_style_class_name('gnome-pr-state-open'))throw Error('Color toggle ignored');
    this._settings.set_boolean('menu-state',false);
    if(this._sections.get(1).get_children().some(x=>x.has_style_class_name?.('gnome-pr-state')))throw Error('State visibility toggle ignored');
  });
  this.disable();print('SMOKE RESULT '+failures);global.context.terminate();return GLib.SOURCE_REMOVE;
 });}
}
''')
    env=dict(os.environ, XDG_DATA_HOME=str(temp/'data'),XDG_CONFIG_HOME=str(temp/'config'),XDG_CACHE_HOME=str(temp/'cache'),XDG_RUNTIME_DIR=str(temp/'runtime'),GSETTINGS_BACKEND='keyfile',LIBGL_ALWAYS_SOFTWARE='1',GSK_RENDERER='cairo',GNOME_SHELL_SESSION_MODE='user')
    (temp/'runtime').mkdir(mode=0o700)
    subprocess.run(['glib-compile-schemas',str(extension/'schemas')],check=True)
    subprocess.run(['gsettings','set','org.gnome.shell','enabled-extensions',"['gnome-pr-indicator@extensions.local']"],env=env,check=True,capture_output=True)
    subprocess.run(['gsettings','--schemadir',str(extension/'schemas'),'set','org.gnome.shell.extensions.gnome-pr-indicator','manual-only','true'],env=env,check=True,capture_output=True)
    subprocess.run(['gsettings','--schemadir',str(extension/'schemas'),'set','org.gnome.shell.extensions.gnome-pr-indicator','position',"'left'"],env=env,check=True,capture_output=True)
    print('Enabled:', subprocess.check_output(['gsettings','get','org.gnome.shell','enabled-extensions'],env=env,text=True).strip(), flush=True)
    launch = 'gnome-shell --headless --wayland --no-x11 --virtual-monitor 1280x720 --sm-disable --mode=user & child=$!; (sleep 8; gdbus call --session --dest org.gnome.Shell.Extensions --object-path /org/gnome/Shell/Extensions --method org.gnome.Shell.Extensions.GetExtensionInfo gnome-pr-indicator@extensions.local) & wait "$child"'
    result=subprocess.run(['timeout','20s','dbus-run-session','--','sh','-c',launch],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
    log=ROOT/'.superpowers/sdd/gnome-pr-indicator-plan/shell-smoke.log'
    log.parent.mkdir(parents=True,exist_ok=True)
    log.write_text(result.stdout)
    lines=[s for s in result.stdout.splitlines() if 'SMOKE' in s or 'JS ERROR' in s or 'Failed to' in s or 'Error:' in s]
    print('\n'.join(lines[-30:]))
    if 'SMOKE RESULT 0' not in result.stdout:
        raise SystemExit('GNOME smoke test failed; see workspace shell-smoke.log')
