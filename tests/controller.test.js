import {RefreshController} from '../lib/controller.js';
import {DEFAULTS} from '../lib/settings.js';
import {test,equal,ok} from './assert.js';
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
class Clock {constructor(){this.t=1000;this.jobs=new Map();this.id=0;}now(){return this.t;}schedule(delay,fn){const id=++this.id;this.jobs.set(id,{delay,fn});return id;}cancel(id){this.jobs.delete(id);}async fire(){const entries=[...this.jobs];this.jobs.clear();for(const [,j]of entries){this.t+=j.delay;j.fn();}await flush();}}
function setup(extra={},clientExtra={}) {let settings={...DEFAULTS,'refresh-on-start':false,...extra};const seen=[],clock=new Clock();let calls=0;const client={fetchPulls:async()=>{calls++;return [{number:1,state:'open',title:'Test'}];},fetchChecks:async()=>({checks:[],complete:true,warnings:[]}),...clientExtra};const c=new RefreshController({client,readSettings:()=>settings,clock,onChange:s=>seen.push(s)});return {c,clock,seen,set:s=>{settings={...settings,...s};},calls:()=>calls};}
await test('manual_only_has_zero_automatic_calls',async()=>{const t=setup({'manual-only':true,'refresh-on-start':true});t.c.start();t.c.menuOpened();await t.clock.fire();await flush();equal(t.calls(),0);equal(t.clock.jobs.size,0);await t.c.refresh('manual');equal(t.calls(),1);t.c.stop();});
await test('periodic_off_keeps_manual',async()=>{const t=setup({'auto-refresh':false});t.c.start();equal(t.clock.jobs.size,0);await t.c.refresh('manual');equal(t.calls(),1);t.c.stop();});
await test('startup_and_menu_switches_independent',async()=>{const t=setup({'auto-refresh':false,'refresh-on-menu':false,'refresh-on-start':true});t.c.start();await flush();equal(t.calls(),1);t.c.menuOpened();await flush();equal(t.calls(),1);t.c.stop();});
await test('interval_change_replaces_timer',()=>{const t=setup();t.c.start();t.set({'refresh-seconds':901});t.c.configure();equal(t.clock.jobs.size,1);equal([...t.clock.jobs.values()][0].delay,901);t.c.stop();});
await test('slow_requests_never_overlap',async()=>{let resolve;let calls=0;const t=setup({}, {fetchPulls:()=>{calls++;return new Promise(r=>resolve=r);}});t.c.start();const run=t.c.refresh('manual');await t.c.refresh('manual');t.c.menuOpened();equal(calls,1);resolve([]);await run;t.c.stop();});
await test('disable_cancels_and_ignores_late_reply',async()=>{let resolve,cancel;const t=setup({}, {fetchPulls:(_s,c)=>{cancel=c;return new Promise(r=>resolve=r);}});t.c.start();const run=t.c.refresh('manual');t.c.stop();const n=t.seen.length;ok(cancel.is_cancelled());resolve([{number:9}]);await run;equal(t.seen.length,n);});
await test('repository_change_clears_and_rejects_old_generation',async()=>{let resolve;const t=setup({'manual-only':true},{fetchPulls:()=>new Promise(r=>resolve=r)});t.c.start();const run=t.c.refresh('manual');t.set({repository:'other/repo'});t.c.configure();resolve([{number:9}]);await run;equal(t.seen.at(-1).pulls,[]);t.c.stop();});
await test('same_repo_network_failure_keeps_stale_data',async()=>{let n=0;const t=setup({}, {fetchPulls:async()=>{if(++n>1)throw {kind:'network',message:'offline'};return [{number:1}];}});t.c.start();await t.c.refresh('manual');await t.c.refresh('manual');equal(t.seen.at(-1).pulls[0].number,1);equal(t.seen.at(-1).stale,true);t.c.stop();});
await test('rate_limit_defers_manual_and_timer_until_allowed',async()=>{let calls=0;const t=setup({}, {fetchPulls:async()=>{calls++;throw {kind:'rate-limit',message:'limit',retryAt:1120};}});t.c.start();await t.c.refresh('manual');await t.c.refresh('manual');equal(calls,1);equal([...t.clock.jobs.values()][0].delay,120);t.c.stop();});
await test('token_removed_clears_private_data',async()=>{const t=setup({'manual-only':true});t.c.start();await t.c.refresh('manual');t.c.configure({credentialsChanged:true});equal(t.seen.at(-1).pulls,[]);t.c.stop();});
await test('failed_worker_cancels_sibling_and_never_dispatches_after_stop',async()=>{
 let settle,token,dispatched=[];
 const t=setup({'manual-only':true},{fetchPulls:async()=>[{number:1},{number:2},{number:3}],fetchChecks:async(p,_s,c)=>{dispatched.push(p.number);token=c;if(p.number===1)throw {kind:'auth',message:'expired'};return new Promise(r=>settle=r);}});
 t.c.start();const run=t.c.refresh('manual');await flush();t.c.stop();ok(token.is_cancelled(),'Sibling must be cancelled');settle({checks:[],complete:true,warnings:[]});await run;equal(dispatched,[1,2]);
});
await test('failed_cycle_keeps_ownership_until_sibling_settles',async()=>{
 let settle,calls=0;
 const t=setup({'manual-only':true},{fetchPulls:async()=>{calls++;return [{number:1},{number:2}];},fetchChecks:async p=>{if(p.number===1)throw {kind:'rate-limit',message:'limit',retryAt:1001};return new Promise(r=>settle=r);}});
 t.c.start();const run=t.c.refresh('manual');await flush();t.clock.t=1100;await t.c.refresh('manual');equal(calls,1);settle({checks:[],complete:true,warnings:[]});await run;t.c.stop();
});
await test('keyring_unlock_recovers_refresh_without_reentering_token',async()=>{
 let locked=true;const t=setup({'manual-only':true},{fetchPulls:async()=>{if(locked)throw {kind:'keyring-locked',message:'locked'};return [{number:1}];}});
 t.c.start();await t.c.refresh('manual');equal(t.seen.at(-1).error.kind,'keyring-locked');locked=false;await t.c.refresh('manual');equal(t.seen.at(-1).error,null);equal(t.seen.at(-1).pulls[0].number,1);t.c.stop();
});
