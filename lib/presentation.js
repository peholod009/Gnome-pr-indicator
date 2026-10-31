import {STATE_LABELS,CHECK_LABELS,STATE_ICONS} from './model.js';
export function summaryText(summary){return `${STATE_ICONS[summary.state]??'?'} ${CHECK_LABELS[summary.state]??'Неизвестно'}${summary.total?` · ${summary.passed}/${summary.total}`:''}`;}
export function panelSpacingStyle(s){return `margin-left: ${s[`panel-${s.position}-margin-left`]}px; margin-right: ${s[`panel-${s.position}-margin-right`]}px;`;}
const PR_APPEARANCES={
    open:{glyph:'●',label:'Открыт',cssClass:'gnome-pr-state-open'},
    draft:{glyph:'◌',label:'Черновик',cssClass:'gnome-pr-state-draft'},
    closed:{glyph:'⊘',label:'Закрыт',cssClass:'gnome-pr-state-closed'},
    merged:{glyph:'◆',label:'Слит',cssClass:'gnome-pr-state-merged'},
};
export function prStateAppearance(state,color=true){const a=PR_APPEARANCES[state]??{glyph:'?',label:'Неизвестно',cssClass:''};return {...a,cssClass:color?a.cssClass:''};}
export function panelSegments(state,s){
    const parts=[];
    if(s['panel-count'])parts.push({kind:'text',text:`${state.pulls.length} PR`});
    for(const p of state.pulls){
        const text=[s['panel-numbers']?`#${p.number}`:'',s['panel-summary']?(STATE_ICONS[p.summary?.state]??'?'):''].filter(Boolean).join(' ');
        if(text||s['panel-state'])parts.push({kind:'pr',text,appearance:s['panel-state']?prStateAppearance(p.state,s['color-states']):null});
    }
    if(state.error&&s['panel-summary'])parts.push({kind:'text',text:'!'});
    if(!parts.length&&!s['panel-icon'])parts.push({kind:'text',text:'PR'});
    return parts;
}
export function pullTitle(p,s){return [s['menu-number']?`#${p.number}`:'',s['menu-title']?p.title:'',s['menu-state']?`[${STATE_LABELS[p.state]??p.state}]`:''].filter(Boolean).join(' · ')||'PR';}
export function visibleChecks(checks,filter){return checks.filter(c=>filter==='running'?c.state==='running':filter==='problems'?['failure','cancelled','unavailable'].includes(c.state):true);}
