import Gio from 'gi://Gio';
import {summarizeChecks} from './model.js';
export class RefreshController {
    constructor({client,readSettings,clock,onChange}) {
        Object.assign(this,{client,readSettings,clock,onChange});
        this.state={pulls:[],loading:false,error:null,stale:false,lastUpdated:null,warnings:[]};
        this.active=false;this.generation=0;this.timer=null;this.busy=false;this.retryAt=0;
    }
    _emit(){if(this.active)this.onChange({...this.state,pulls:[...this.state.pulls]});}
    _cancelTimer(){if(this.timer!==null)this.clock.cancel(this.timer);this.timer=null;}
    _schedule(){
        this._cancelTimer();
        if(!this.active||this.busy||this.settings['manual-only']||!this.settings['auto-refresh'])return;
        const delay=Math.max(this.settings['refresh-seconds'],this.retryAt-this.clock.now());
        this.timer=this.clock.schedule(delay,()=>{this.timer=null;void this.refresh('timer');});
    }
    start(){this.active=true;this.settings=this.readSettings();this._emit();this._schedule();if(!this.settings['manual-only']&&this.settings['refresh-on-start'])void this.refresh('startup');}
    stop(){this.active=false;this.generation++;this._cancelTimer();this.cancellable?.cancel();this.cancellable=null;this.busy=false;}
    configure({credentialsChanged=false}={}){
        const old=this.settings,next=this.readSettings();
        const repositoryChanged=old?.repository!==next.repository;
        const queryKeys=['repository','limit','sort','direction','author','include-open','include-draft','include-merged','include-closed','source-checks','source-statuses'];
        const queryChanged=queryKeys.some(k=>old?.[k]!==next[k]);
        this.settings=next;
        this.generation++;this.cancellable?.cancel();this.cancellable=null;this.busy=false;
        this.state.loading=false;
        if(repositoryChanged||credentialsChanged){this.state={pulls:[],loading:false,error:null,stale:false,lastUpdated:null,warnings:[]};}
        else if(queryChanged){this.state.stale=this.state.pulls.length>0;}
        this._emit();this._schedule();
        if((queryChanged||credentialsChanged)&&!next['manual-only']&&next['auto-refresh'])void this.refresh('settings');
    }
    menuOpened(){if(this.active&&!this.settings['manual-only']&&this.settings['refresh-on-menu'])void this.refresh('menu');}
    async refresh(reason='manual'){
        if(!this.active||this.busy)return;
        const s=this.settings;
        if(s['manual-only']&&!['manual','validate'].includes(reason))return;
        if(this.retryAt>this.clock.now()){this._schedule();return;}
        this.busy=true;this._cancelTimer();
        const generation=++this.generation,c=new Gio.Cancellable();this.cancellable=c;
        this.state.loading=true;this.state.error=null;this._emit();
        try {
            const pulls=await this.client.fetchPulls(s,c);
            if(!this.active||generation!==this.generation)return;
            let next=0;const results=new Array(pulls.length);let cycleError=null;
            const worker=async()=>{
                try {
                    while(next<pulls.length){
                        if(c.is_cancelled()||!this.active||generation!==this.generation)return;
                        const index=next++,pull=pulls[index];
                        const data=await this.client.fetchChecks(pull,s,c);
                        if(c.is_cancelled()||!this.active||generation!==this.generation)return;
                        results[index]={...pull,...data,summary:summarizeChecks(data.checks,{enabled:s['source-checks']||s['source-statuses'],complete:data.complete})};
                    }
                }catch(e){if(!cycleError||cycleError.kind==='cancelled')cycleError=e;c.cancel();throw e;}
            };
            await Promise.allSettled([worker(),worker()]);
            if(cycleError)throw cycleError;
            if(!this.active||generation!==this.generation)return;
            this.retryAt=0;
            this.state={pulls:results,loading:false,error:null,stale:false,lastUpdated:this.clock.now(),warnings:results.flatMap(p=>p.warnings??[])};
        }catch(e){
            if(!this.active||generation!==this.generation||e.kind==='cancelled')return;
            if(e.kind==='rate-limit')this.retryAt=e.retryAt;
            if(e.kind==='auth'||e.kind==='access')this.state.pulls=[];
            this.state.error={kind:e.kind??'auth',message:e.kind?e.message:'Связка ключей недоступна. Проверьте авторизацию в настройках.',retryAt:e.retryAt??0};
            this.state.stale=this.state.pulls.length>0;
        }finally{
            if(this.active&&generation===this.generation){this.busy=false;this.state.loading=false;this.cancellable=null;this._emit();this._schedule();}
        }
    }
}
