import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {readSettings} from './lib/settings.js';
import {GitHubClient} from './lib/github.js';
import {SecretStore} from './lib/secrets.js';
import {RefreshController} from './lib/controller.js';
import {safeLink,STATE_ICONS,CHECK_LABELS} from './lib/model.js';
import {panelSpacingStyle,panelSegments,prStateAppearance,pullTitle,visibleChecks,summaryText} from './lib/presentation.js';

export default class GnomePRIndicator extends Extension {
    enable(){
        this._settings=this.getSettings();
        this._state={pulls:[],loading:false,error:null,stale:false,lastUpdated:null,warnings:[]};
        this._sections=new Map();this._rendering=false;
        this._button=new PanelMenu.Button(0,'GNOME PR Indicator',false);
        this._box=new St.BoxLayout({style_class:'panel-status-menu-box'});
        this._button.add_child(this._box);
        const position=readSettings(this._settings).position;
        const insertionIndex=position==='left'?Main.panel._leftBox.get_n_children():0;
        Main.panel.addToStatusArea(this.uuid,this._button,insertionIndex,position);
        const store=new SecretStore();
        this._client=new GitHubClient({tokenProvider:c=>store.lookup(c)});
        const clock={now:()=>Date.now()/1000,schedule:(seconds,fn)=>GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,Math.max(1,Math.ceil(seconds)),()=>{fn();return GLib.SOURCE_REMOVE;}),cancel:id=>GLib.Source.remove(id)};
        this._controller=new RefreshController({client:this._client,readSettings:()=>readSettings(this._settings),clock,onChange:state=>{this._state=state;this._render();}});
        this._changed=this._settings.connect('changed',(_settings,key)=>{
            try{this._controller.configure({credentialsChanged:key==='credentials-revision'});this._position();}
            catch{this._state.error={message:'Ошибка настроек. Откройте настройки расширения.'};this._render();}
        });
        this._menuSignal=this._button.menu.connect('open-state-changed',(_menu,open)=>{if(open&&!this._rendering)this._controller.menuOpened();});
        this._controller.start();
    }
    _position(){
        const position=readSettings(this._settings).position;
        const target=Main.panel[`_${position}Box`];
        const actor=this._button.container;
        if(actor.get_parent()===target){
            if(position==='left'&&target.get_children().at(-1)!==actor)target.set_child_above_sibling(actor,null);
            return;
        }
        actor.get_parent()?.remove_child(actor);
        target.insert_child_at_index(actor,position==='left'?target.get_n_children():0);
    }
    _open(url,githubOnly=false){
        if(!readSettings(this._settings)['open-links'])return;
        const safe=safeLink(url,githubOnly);
        if(safe)try{Gio.AppInfo.launch_default_for_uri(safe,null);}catch{Main.notify('GNOME PR Indicator','Не удалось открыть ссылку');}
    }
    _item(menu,text,{url=null,githubOnly=false,action=null}={}){
        const enabled=Boolean(action||(url&&safeLink(url,githubOnly)&&readSettings(this._settings)['open-links']));
        const item=new PopupMenu.PopupMenuItem(String(text),{reactive:enabled,can_focus:enabled});
        item.label.clutter_text.ellipsize=Pango.EllipsizeMode.END;
        if(action)item.connect('activate',action);
        else if(enabled)item.connect('activate',()=>this._open(url,githubOnly));
        menu.addMenuItem(item);return item;
    }
    _stateBadge(p,s){
        const a=prStateAppearance(p.state,s['color-states']);
        return new St.Label({text:`${a.glyph} ${a.label}`,style_class:`gnome-pr-state ${a.cssClass}`,y_align:Clutter.ActorAlign.CENTER});
    }
    _decorateState(item,p,s){
        if(!s['menu-state'])return;
        item.label.x_expand=true;
        item.insert_child_above(this._stateBadge(p,s),item.label);
    }
    _render(){
        if(!this._button)return;
        let s;try{s=readSettings(this._settings);}catch{return;}
        this._rendering=true;
        try{
            this._box.destroy_all_children();
            if(s['panel-icon'])this._box.add_child(new St.Icon({icon_name:'applications-development-symbolic',style_class:'system-status-icon'}));
            this._button.container.set_style(panelSpacingStyle(s));
            for(const part of panelSegments(this._state,s)){
                if(part.kind==='pr'){
                    const item=new St.BoxLayout({style_class:'gnome-pr-panel-item'});
                    if(part.appearance)item.add_child(new St.Label({text:part.appearance.glyph,style_class:`gnome-pr-state ${part.appearance.cssClass}`,accessible_name:part.appearance.label,y_align:Clutter.ActorAlign.CENTER}));
                    if(part.text)item.add_child(new St.Label({text:part.text,y_align:Clutter.ActorAlign.CENTER}));
                    this._box.add_child(item);
                }else this._box.add_child(new St.Label({text:part.text,y_align:Clutter.ActorAlign.CENTER}));
            }
            this._button.accessible_name=`GitHub · ${s.repository}${this._state.loading?' · обновление':''}${this._state.stale?' · данные устарели':''}`;
            const expanded=new Set([...this._sections].filter(([_n,item])=>item.menu.isOpen).map(([n])=>n));
            this._sections.clear();this._list=null;this._scroll=null;this._button.menu.removeAll();
            const menu=this._button.menu;
            this._item(menu,s.repository,{url:`https://github.com/${s.repository}/pulls`,githubOnly:true});
            if(this._state.loading)this._item(menu,'Обновление…');
            if(this._state.error)this._item(menu,this._state.error.message);
            if(this._state.error?.retryAt)this._item(menu,`Повтор доступен после ${new Date(this._state.error.retryAt*1000).toLocaleTimeString()}`);
            if(this._state.stale)this._item(menu,'Данные устарели — обновление не удалось или настройки изменены');
            const scroll=new St.ScrollView({style_class:'gnome-pr-scroll',overlay_scrollbars:true,hscrollbar_policy:St.PolicyType.NEVER,vscrollbar_policy:St.PolicyType.AUTOMATIC});
            const list=new PopupMenu.PopupMenuSection();this._list=list;this._scroll=scroll;
            scroll.set_child(list.actor);list.actor=scroll;scroll._delegate=list;menu.addMenuItem(list);
            if(!this._state.pulls.length&&!this._state.loading&&!this._state.error)this._item(list,this._state.lastUpdated?'Нет PR с выбранными фильтрами':'Нажмите «Обновить» или настройте авторизацию');
            for(const p of this._state.pulls){
                const title=pullTitle(p,{...s,'menu-state':false});
                if(s['menu-details']){
                    const sub=new PopupMenu.PopupSubMenuMenuItem(title);
                    sub.label.clutter_text.ellipsize=Pango.EllipsizeMode.END;
                    this._decorateState(sub,p,s);
                    list.addMenuItem(sub);this._sections.set(p.number,sub);
                    if(s['menu-summary'])this._item(sub.menu,summaryText(p.summary));
                    if(s['open-links'])this._item(sub.menu,'Открыть PR в GitHub',{url:p.url,githubOnly:true});
                    for(const c of visibleChecks(p.checks,s['check-filter']))this._item(sub.menu,`${STATE_ICONS[c.state]??'?'} ${c.name} · ${CHECK_LABELS[c.state]??c.state} [${c.origin}]`,{url:c.url});
                    if(!p.checks.length&&!s['source-checks']&&!s['source-statuses']&&!s['menu-summary'])this._item(sub.menu,'Мониторинг проверок отключён');
                    if(!p.complete)this._item(sub.menu,'Не все источники проверок доступны');
                    if(expanded.has(p.number))sub.menu.open(false);
                }else{
                    this._decorateState(this._item(list,title,{url:p.url,githubOnly:true}),p,s);
                    if(s['menu-summary'])this._item(list,summaryText(p.summary));
                }
            }
            if(this._state.warnings.length)this._item(menu,'Часть проверок недоступна — для приватных checks нужен PAT classic с repo');
            if(s['menu-updated'])this._item(menu,this._state.lastUpdated?`Обновлено: ${new Date(this._state.lastUpdated*1000).toLocaleString()}`:'Ещё не обновлялось');
            menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            const refresh=this._item(menu,'Обновить',{action:()=>void this._controller.refresh('manual')});
            refresh.setSensitive(!this._state.loading);
            this._item(menu,'Настройки…',{action:()=>void this.openPreferences()});
        }finally{this._rendering=false;}
    }
    disable(){
        this._controller?.stop();this._controller=null;
        this._client?.close();this._client=null;
        if(this._changed)this._settings.disconnect(this._changed);this._changed=null;
        if(this._menuSignal&&this._button)this._button.menu.disconnect(this._menuSignal);this._menuSignal=null;
        this._list=null;this._scroll=null;this._button?.destroy();this._button=null;this._box=null;this._sections=null;this._settings=null;this._state=null;
    }
}
