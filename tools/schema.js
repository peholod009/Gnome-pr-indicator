import GLib from 'gi://GLib';
import {OPTIONS} from '../lib/settings.js';
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const xml=`<schemalist>\n<schema id="org.gnome.shell.extensions.gnome-pr-indicator" path="/org/gnome/shell/extensions/gnome-pr-indicator/">\n${OPTIONS.map(o=>`<key name="${o.key}" type="${o.type}"><default>${escape(o.type==='s'?`'${o.value}'`:String(o.value))}</default><summary>${escape(o.label)}</summary>${o.type==='i'?`<range min="${o.min}" max="${o.max}"/>`:''}</key>`).join('\n')}\n<key name="credentials-revision" type="i"><default>0</default><summary>Internal credential change signal</summary></key>\n</schema>\n</schemalist>\n`;
GLib.file_set_contents('schemas/org.gnome.shell.extensions.gnome-pr-indicator.gschema.xml',xml);
