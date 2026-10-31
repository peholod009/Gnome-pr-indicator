import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk?version=4.0';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {OPTIONS,readSettings,validateSettings} from './lib/settings.js';
import {SecretStore} from './lib/secrets.js';
import {GitHubClient} from './lib/github.js';

export default class GnomePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window){
        const settings=this.getSettings(),store=new SecretStore();
        const cancellable=new Gio.Cancellable();
        const client=new GitHubClient({tokenProvider:c=>store.lookup(c)});
        window.set_default_size(720,760);window.search_enabled=true;
        const page=new Adw.PreferencesPage({title:'GNOME PR Indicator',icon_name:'applications-development-symbolic'});window.add(page);
        const groups=new Map();
        for(const title of ['Подключение','PR','Обновление','Панель','Отступы: Слева','Отступы: По центру','Отступы: Справа','Оформление','Меню','Проверки']){const group=new Adw.PreferencesGroup({title});groups.set(title,group);page.add(group);}
        const status=new Adw.ActionRow({title:'Авторизация',subtitle:'Для checks приватного репозитория: PAT classic со scope repo. Этот токен имеет широкие права на приватные репозитории аккаунта; расширение выполняет только чтение.'});status.subtitle_lines=4;groups.get('Подключение').add(status);
        const report=text=>{if(!cancellable.is_cancelled())status.subtitle=text;};
        const rows=new Map();
        for(const o of OPTIONS){
            let row;
            if(o.type==='b'){
                row=new Adw.SwitchRow({title:o.label});settings.bind(o.key,row,'active',Gio.SettingsBindFlags.DEFAULT);
            }else if(o.type==='i'){
                row=new Adw.SpinRow({title:o.label,adjustment:new Gtk.Adjustment({lower:o.min,upper:o.max,step_increment:1,page_increment:o.key==='refresh-seconds'?60:1}),numeric:true});
                settings.bind(o.key,row,'value',Gio.SettingsBindFlags.DEFAULT);
            }else if(o.choices){
                row=new Adw.ComboRow({title:o.label,model:Gtk.StringList.new(o.labels),selected:Math.max(0,o.choices.indexOf(settings.get_string(o.key)))});
                row.connect('notify::selected',()=>settings.set_string(o.key,o.choices[row.selected]));
            }else{
                row=new Adw.EntryRow({title:o.label,text:settings.get_string(o.key),show_apply_button:true});
                row.connect('apply',()=>{try{const next=validateSettings({...readSettings(settings),[o.key]:row.text});settings.set_string(o.key,next[o.key]);row.remove_css_class('error');}catch(e){row.add_css_class('error');report(e.message);}});
            }
            groups.get(o.group).add(row);rows.set(o.key,row);
        }
        groups.get('Оформление').description='Открыт — зелёный; черновик — серый; закрыт — красный; слит — фиолетовый. Цвета относятся к состоянию PR, а не к результату CI.';
        for(const name of ['Слева','По центру','Справа'])groups.get(`Отступы: ${name}`).description='Внешние отступы индикатора для этого положения, в логических пикселях. 0 — без дополнительного отступа. Применяются сразу.';
        groups.get('Обновление').description='Интервал — любое целое число секунд от 1. Слишком частые запросы могут достичь лимита GitHub. Ручной режим отключает все автоматические запросы.';
        const password=new Gtk.PasswordEntry({show_peek_icon:true,hexpand:true,valign:Gtk.Align.CENTER});
        const tokenRow=new Adw.ActionRow({title:'Токен GitHub'});tokenRow.add_suffix(password);groups.get('Подключение').add(tokenRow);
        const buttons=new Gtk.Box({spacing:8,halign:Gtk.Align.END});
        const actionRow=new Adw.ActionRow({title:'Доступ к GitHub'});actionRow.add_suffix(buttons);groups.get('Подключение').add(actionRow);
        const bump=()=>settings.set_int('credentials-revision',(settings.get_int('credentials-revision')+1)%2147483647);
        const actions=[];let working=false;
        const action=(label,fn)=>{const b=new Gtk.Button({label,valign:Gtk.Align.CENTER});buttons.append(b);actions.push(b);b.connect('clicked',async()=>{
            if(working)return;working=true;actions.forEach(button=>button.sensitive=false);
            try{await fn();}catch(e){report(e.kind?e.message:'Не удалось выполнить действие. Проверьте, разблокирована ли связка ключей.');}
            finally{working=false;if(!cancellable.is_cancelled())actions.forEach(button=>button.sensitive=true);}
        });};
        action('Разблокировать',async()=>{report('Ожидание разблокировки связки ключей…');await store.unlock(cancellable);if(cancellable.is_cancelled())return;const saved=await store.status(cancellable);if(saved==='missing'){report('Токен не найден. Введите и сохраните токен GitHub.');return;}bump();report('Связка разблокирована. Токен доступен; можно обновить индикатор.');});
        action('Сохранить',async()=>{if(!password.text.trim()){report('Введите токен');return;}await store.store(password.text,cancellable);password.text='';if(cancellable.is_cancelled())return;bump();report('Токен сохранён в GNOME Keyring. Нажмите «Проверить».');});
        action('Проверить',async()=>{report('Проверка доступа…');await client.validateRepository(readSettings(settings).repository,cancellable);report('Доступ к репозиторию подтверждён. Права Checks и Commit statuses проверяются при загрузке PR.');});
        action('Удалить',async()=>{await store.clear(cancellable);if(cancellable.is_cancelled())return;password.text='';bump();report('Токен удалён. Нужна авторизация.');});
        void store.status(cancellable).then(state=>{if(working)return;report(state==='locked'?'Связка ключей заблокирована; сохранённый токен недоступен. Нажмите «Разблокировать» и введите пароль связки в системном окне GNOME.':state==='ready'?'Токен сохранён и доступен. Поле ввода остаётся пустым; вводить токен повторно не нужно.':'Токен не найден. Введите и сохраните токен GitHub.');}).catch(()=>report('Связка ключей недоступна.'));
        const link=new Gtk.LinkButton({label:'Создать токен на GitHub',uri:'https://github.com/settings/tokens/new',halign:Gtk.Align.START});groups.get('Подключение').add(link);
        const reset=new Gtk.Button({label:'Сбросить параметры (сохранить токен)',halign:Gtk.Align.START,margin_top:12});groups.get('Проверки').add(reset);
        reset.connect('clicked',()=>{for(const o of OPTIONS)settings.reset(o.key);for(const o of OPTIONS){const row=rows.get(o.key);if(o.choices)row.selected=o.choices.indexOf(settings.get_string(o.key));else if(o.type==='s')row.text=settings.get_string(o.key);}report('Параметры сброшены; токен сохранён.');});
        const sensitivity=()=>{const manual=settings.get_boolean('manual-only');for(const key of ['auto-refresh','refresh-seconds','refresh-on-start','refresh-on-menu'])rows.get(key).sensitive=!manual;rows.get('refresh-seconds').sensitive=!manual&&settings.get_boolean('auto-refresh');};
        const changed=settings.connect('changed',sensitivity);sensitivity();
        window.connect('close-request',()=>{cancellable.cancel();client.close();password.text='';settings.disconnect(changed);return false;});
    }
}
