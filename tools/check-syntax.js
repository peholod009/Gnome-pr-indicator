import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
function walk(dir){const e=Gio.File.new_for_path(dir).enumerate_children('standard::name,standard::type',Gio.FileQueryInfoFlags.NONE,null);let entry;while((entry=e.next_file(null))){const name=entry.get_name();if(name.startsWith('.'))continue;const path=GLib.build_filenamev([dir,name]);if(entry.get_file_type()===Gio.FileType.DIRECTORY)walk(path);else if(name.endsWith('.js')){const [,bytes]=GLib.file_get_contents(path);Reflect.parse(new TextDecoder().decode(bytes),{target:'module'});}}e.close(null);}
walk('.');print('PASS JavaScript module syntax');
