import Secret from 'gi://Secret';
const schema=new Secret.Schema('org.gnome.shell.extensions.gnome-pr-indicator',Secret.SchemaFlags.NONE,{application:Secret.SchemaAttributeType.STRING,account:Secret.SchemaAttributeType.STRING});
const attributes={application:'gnome-pr-indicator@extensions.local',account:'github.com'};
const lockedMessage='Связка ключей заблокирована; сохранённый токен недоступен. Откройте настройки и нажмите «Разблокировать».';
function lockedError(){const e=new Error(lockedMessage);e.kind='keyring-locked';return e;}
function promise(start,finish){return new Promise((resolve,reject)=>{start((_source,result)=>{try{resolve(finish(result));}catch(e){reject(e);}});});}
async function search(flags,c){
    const service=await promise(cb=>Secret.Service.get(Secret.ServiceFlags.NONE,c,cb),r=>Secret.Service.get_finish(r));
    const items=await promise(cb=>service.search(schema,attributes,flags,c,cb),r=>service.search_finish(r));
    return {service,items};
}
async function defaultCollection(service,c){return promise(cb=>Secret.Collection.for_alias(service,'default',Secret.CollectionFlags.NONE,c,cb),r=>Secret.Collection.for_alias_finish(r));}
async function itemStatus({service,items},c){
    if(items.some(i=>!i.get_locked()))return 'ready';
    if(items.length)return 'locked';
    // GNOME Keyring may hide searchable item attributes while a collection is locked.
    const collection=await defaultCollection(service,c);
    return collection?.get_locked()?'locked':'missing';
}
const nativeBackend={
    status:async c=>itemStatus(await search(Secret.SearchFlags.ALL,c),c),
    // Background refresh must not open a password prompt in the Shell at login.
    lookup:async c=>{
        const result=await search(Secret.SearchFlags.ALL|Secret.SearchFlags.LOAD_SECRETS,c),{items}=result;
        for(const item of items){if(!item.get_locked()){const secret=item.get_secret();if(secret)return secret.get_text();}}
        if(await itemStatus(result,c)==='locked')throw lockedError();
        return null;
    },
    unlock:async c=>{
        const {service,items}=await search(Secret.SearchFlags.ALL|Secret.SearchFlags.UNLOCK,c);
        if(!items.length){const collection=await defaultCollection(service,c);if(collection?.get_locked())await promise(cb=>service.unlock([collection],c,cb),r=>service.unlock_finish(r));}
        if(await itemStatus(await search(Secret.SearchFlags.ALL,c),c)==='locked')throw lockedError();
    },
    store:(token,c)=>promise(cb=>Secret.password_store(schema,attributes,Secret.COLLECTION_DEFAULT,'GNOME PR Indicator — GitHub',token,c,cb),r=>Secret.password_store_finish(r)),
    clear:c=>promise(cb=>Secret.password_clear(schema,attributes,c,cb),r=>Secret.password_clear_finish(r)),
};
export class SecretStore {
    constructor({backend}={}){this.backend=backend??nativeBackend;}
    async status(c){try{return await this.backend.status(c);}catch{throw new Error('Связка ключей недоступна');}}
    async lookup(c){try{return await this.backend.lookup(c);}catch(e){if(e.kind==='keyring-locked')throw e;throw new Error('Связка ключей недоступна или заблокирована');}}
    async unlock(c){try{await this.backend.unlock(c);if(await this.backend.status(c)==='locked')throw lockedError();}catch(e){if(e.kind==='keyring-locked')throw e;throw new Error('Не удалось разблокировать связку ключей');}}
    async store(token,c){if(!token?.trim())throw new Error('Введите токен GitHub');try{return await this.backend.store(token.trim(),c);}catch{throw new Error('Не удалось сохранить токен в связке ключей');}}
    async clear(c){try{return await this.backend.clear(c);}catch{throw new Error('Не удалось удалить токен из связки ключей');}}
}
