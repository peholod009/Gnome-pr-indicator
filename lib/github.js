import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import {normalizePull,selectPulls,normalizeChecks} from './model.js';
const API='https://api.github.com';
export class ApiError extends Error {
    constructor(kind,message,retryAt=0) {super(message);this.kind=kind;this.retryAt=retryAt;}
}
function cancelled(c) {if(c?.is_cancelled()) throw new ApiError('cancelled','Запрос отменён');}
function validApi(url) {return typeof url==='string' && /^https:\/\/api\.github\.com\/(?!\/)/.test(url) && !/[\s\u0000-\u001f\\]/.test(url);}
export class SoupTransport {
    constructor(){this.session=new Soup.Session({timeout:20,user_agent:'GNOME-PR-Indicator/1'});}
    request({url,headers,cancellable}) {
        return new Promise((resolve,reject)=>{
            if(!validApi(url)){reject(new ApiError('network','Недопустимый адрес API'));return;}
            const msg=Soup.Message.new('GET',url);
            msg.add_flags(Soup.MessageFlags.NO_REDIRECT);
            for(const [k,v] of Object.entries(headers)) msg.get_request_headers().append(k,v);
            this.session.send_and_read_async(msg,GLib.PRIORITY_DEFAULT,cancellable,(_session,result)=>{
                try {
                    const bytes=this.session.send_and_read_finish(result);
                    const responseHeaders={};msg.get_response_headers().foreach((name,value)=>{responseHeaders[name.toLowerCase()]=value;});
                    let json=null;
                    if(msg.status_code>=200&&msg.status_code<300) {
                        if(bytes.get_size()>8*1024*1024) throw new ApiError('network','Слишком большой ответ GitHub');
                        json=JSON.parse(new TextDecoder().decode(bytes.get_data()));
                    }
                    resolve({status:msg.status_code,headers:responseHeaders,json});
                } catch(e) {reject(e);}
            });
        });
    }
    close(){this.session.abort();}
}
export class GitHubClient {
    constructor({transport,tokenProvider}) {this.transport=transport??new SoupTransport();this.tokenProvider=tokenProvider;}
    async _get(url,cancellable) {
        cancelled(cancellable);
        if(!validApi(url)) throw new ApiError('network','Недопустимый адрес API');
        const token=await this.tokenProvider(cancellable);
        cancelled(cancellable);
        if(!token) throw new ApiError('auth','Нужна авторизация: сохраните токен в настройках');
        let r;
        try {r=await this.transport.request({url,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'},cancellable});}
        catch(e){cancelled(cancellable);if(e instanceof ApiError)throw e;throw new ApiError('network','Не удалось связаться с GitHub');}
        cancelled(cancellable);
        const h=Object.fromEntries(Object.entries(r.headers??{}).map(([k,v])=>[k.toLowerCase(),v]));
        if(r.status===429 || (r.status===403 && (h['x-ratelimit-remaining']==='0'||h['retry-after']))) {
            const now=Date.now()/1000;
            const delay=Number(h['retry-after']);
            const date=Date.parse(h['retry-after']??'')/1000;
            const retry=Number.isFinite(delay)?now+delay:Number.isFinite(date)?date:now+60;
            throw new ApiError('rate-limit','Лимит GitHub: обновление временно отложено',Math.max(now+1,retry,Number(h['x-ratelimit-reset'])||0));
        }
        if(r.status===401) throw new ApiError('auth','Токен недействителен или истёк');
        if(r.status===403||r.status===404) {const e=new ApiError('access','Нет доступа к репозиторию или проверкам');e.status=r.status;throw e;}
        if(r.status<200||r.status>=300) throw new ApiError('network',`GitHub вернул HTTP ${r.status}`);
        return {...r,headers:h};
    }
    async _pages(url,extract,cancellable,stop=()=>false) {
        const items=[],seen=new Set();
        while(url) {
            if(seen.has(url)) throw new ApiError('network','Некорректная пагинация GitHub');
            seen.add(url);
            const r=await this._get(url,cancellable),page=extract(r.json);
            if(!Array.isArray(page)) throw new ApiError('network','Неожиданный формат ответа GitHub');
            items.push(...page);
            if(stop(items))break;
            url=null;
            for(const part of (r.headers.link??'').split(',')) {const m=part.match(/<([^>]+)>;\s*rel="next"/);if(m)url=m[1];}
        }
        return items;
    }
    async validateRepository(repository,cancellable){return (await this._get(`${API}/repos/${repository}`,cancellable)).json;}
    async fetchPulls(settings,cancellable) {
        const url=`${API}/repos/${settings.repository}/pulls?state=all&sort=${settings.sort}&direction=${settings.direction}&per_page=100`;
        const raw=await this._pages(url,x=>x,cancellable,items=>selectPulls(items.map(normalizePull),settings).length>=settings.limit);
        return selectPulls(raw.map(normalizePull),settings);
    }
    async fetchChecks(pull,settings,cancellable) {
        const checks=[],warnings=[];let complete=true;
        const refs=pull.headSha?[{sha:pull.headSha,origin:'head',repo:pull.headRepo??settings.repository}]:[];
        if(pull.mergeSha && pull.mergeSha!==pull.headSha && ['open','draft'].includes(pull.state)) refs.push({sha:pull.mergeSha,origin:'test-merge',repo:settings.repository});
        if(!settings['source-checks']&&!settings['source-statuses'])return {checks,complete,warnings};
        if(!refs.length) return {checks,complete:false,warnings:['Нет SHA для получения проверок']};
        for(const ref of refs) {
            // Try the base repository first: private-repo tokens may not grant access to a fork.
            const root=`${API}/repos/${settings.repository}/commits/${encodeURIComponent(ref.sha)}`;
            for(const source of ['checks','statuses']) {
                if(!settings[`source-${source}`])continue;
                try {
                    const raw=await this._pages(`${root}/${source==='checks'?'check-runs':'statuses'}?per_page=100`,x=>source==='checks'?x.check_runs:x,cancellable);
                    const normalized=normalizeChecks(source==='checks'?raw:[],source==='statuses'?raw:[],ref.origin).map(c=>({...c,sha:ref.sha}));
                    checks.push(...normalized);
                }catch(e){
                    if(e.kind==='cancelled'||e.kind==='auth'||e.kind==='rate-limit')throw e;
                    if(ref.origin==='test-merge'&&e.status===404)continue;
                    complete=false;warnings.push(`${ref.origin}: ${e.message}`);
                }
            }
        }
        return {checks,complete,warnings};
    }
    close(){this.transport.close?.();}
}
