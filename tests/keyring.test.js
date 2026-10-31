import {SecretStore} from '../lib/secrets.js';
import {test,equal,ok} from './assert.js';
await test('locked_saved_token_is_not_reported_as_missing_authorization',async()=>{
 const s=new SecretStore({backend:{lookup:async()=>{const e=new Error('locked');e.kind='keyring-locked';throw e;}}});
 let error;try{await s.lookup(null);}catch(e){error=e;}
 equal(error?.kind,'keyring-locked');
});
await test('unlock_cancel_keeps_saved_token_and_reports_locked',async()=>{
 let locked=true;const s=new SecretStore({backend:{status:async()=>locked?'locked':'ready',unlock:async()=>{},lookup:async()=>locked?null:'fictional'}});
 let error;try{await s.unlock(null);}catch(e){error=e;}
 equal(error?.kind,'keyring-locked');locked=false;await s.unlock(null);equal(await s.lookup(null),'fictional');
});
await test('keyring_status_does_not_read_or_rewrite_the_secret',async()=>{
 let touched=false;const s=new SecretStore({backend:{status:async()=>'locked',lookup:async()=>{touched=true;},store:async()=>{touched=true;}}});
 equal(await s.status(null),'locked');ok(!touched);
});
