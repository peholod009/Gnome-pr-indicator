export function normalizePull(raw) {
    return {number:raw.number,title:raw.title ?? '',state:raw.merged_at ? 'merged' : raw.state==='closed' ? 'closed' : raw.draft ? 'draft' : 'open',author:raw.user?.login ?? '',createdAt:raw.created_at,updatedAt:raw.updated_at,url:raw.html_url,headSha:raw.head?.sha,headRepo:raw.head?.repo?.full_name,mergeSha:raw.merge_commit_sha};
}
export function selectPulls(pulls,s) {
    const field=s.sort==='updated'?'updatedAt':'createdAt';
    return pulls.filter(p=>s[`include-${p.state}`] && (!s.author||p.author.toLowerCase()===s.author.toLowerCase())).sort((a,b)=>((Date.parse(a[field])-Date.parse(b[field])) || a.number-b.number)*(s.direction==='asc'?1:-1)).slice(0,s.limit);
}
export function safeLink(url,githubOnly=false) {
    if(typeof url!=='string') return null;
    const match=url.match(/^https:\/\/([^/?#]+)(?:[/?#]|$)/i);
    if(!match || match[1].includes('@') || /[\s\u0000-\u001f\\]/.test(url)) return null;
    if(githubOnly && match[1].toLowerCase()!=='github.com') return null;
    return url;
}
export function normalizeChecks(runs,statuses,origin) {
    const latest=new Map();
    for(const raw of runs) {
        const sha=raw.head_sha??'';
        const key=`check:${raw.app?.id??'unknown'}:${raw.name}:${sha}:${origin}`;
        if((latest.get(key)?.id??-1)>(raw.id??0)) continue;
        const c=raw.conclusion;
        const state=raw.status!=='completed'?'running':['failure','timed_out','action_required','stale'].includes(c)?'failure':c==='success'?'success':c==='cancelled'?'cancelled':['skipped','neutral'].includes(c)?'skipped':'unavailable';
        latest.set(key,{id:raw.id,key,name:raw.name??'Check',state,url:raw.html_url??raw.details_url,sha,origin});
    }
    for(const raw of statuses) {
        const key=`status:${raw.context}:${origin}`;
        if((latest.get(key)?.id??-1)>(raw.id??0)) continue;
        const state=raw.state==='success'?'success':['failure','error'].includes(raw.state)?'failure':raw.state==='pending'?'running':'unavailable';
        latest.set(key,{id:raw.id,key,name:raw.context??'Status',state,url:raw.target_url,sha:raw.sha??'',origin});
    }
    return [...latest.values()];
}
export function summarizeChecks(checks,{enabled,complete}) {
    const count=state=>checks.filter(c=>c.state===state).length;
    const r={state:'none',passed:count('success'),total:checks.length,running:count('running'),failed:count('failure'),cancelled:count('cancelled'),skipped:count('skipped')};
    r.state=!enabled?'disabled':r.failed?'failure':!complete||count('unavailable')?'unavailable':r.running?'running':r.cancelled?'cancelled':!r.total?'none':r.passed+r.skipped===r.total&&r.passed>0?'success':'skipped';
    return r;
}
export const STATE_LABELS={open:'Открыт',draft:'Черновик',merged:'Слит',closed:'Закрыт'};
export const CHECK_LABELS={disabled:'Мониторинг проверок отключён',unavailable:'Данные проверок неполные',none:'Нет проверок',success:'Пройдены',running:'Выполняются / ожидают',failure:'Ошибка',cancelled:'Отменены',skipped:'Пропущены / neutral'};
export const STATE_ICONS={disabled:'−',unavailable:'?',none:'—',success:'✓',running:'◷',failure:'✕',cancelled:'⊘',skipped:'↷'};
