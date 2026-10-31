import {panelSegments,pullTitle,visibleChecks,summaryText} from '../lib/presentation.js';
import {DEFAULTS} from '../lib/settings.js';
import {test,equal,ok} from './assert.js';
const p={number:42,title:'Fix <b>API</b>',state:'open',summary:{state:'failure',passed:1,total:3},checks:[{state:'failure'},{state:'running'},{state:'success'}]};
await test('panel_hide_all_leaves_accessible_fallback',()=>equal(panelSegments({pulls:[p]}, {...DEFAULTS,'panel-icon':false,'panel-count':false,'panel-numbers':false,'panel-summary':false,'panel-state':false}),[{kind:'text',text:'PR'}]));
await test('panel_count_and_number_switches',()=>equal(panelSegments({pulls:[p]}, {...DEFAULTS,'panel-count':true,'panel-summary':false,'panel-state':false}).map(part=>part.text),['1 PR','#42']));
await test('title_honors_all_field_switches',()=>{equal(pullTitle(p,{...DEFAULTS,'menu-title':false,'menu-state':false}),'#42');ok(pullTitle(p,DEFAULTS).includes('<b>API</b>'));});
await test('details_filter_never_changes_failure_summary',()=>{equal(visibleChecks(p.checks,'running').length,1);ok(summaryText(p.summary).includes('Ошибка'));equal(visibleChecks(p.checks,'problems').length,1);});
await test('disabled_and_incomplete_have_explicit_text',()=>{ok(summaryText({state:'disabled',passed:0,total:0}).includes('отключён'));ok(summaryText({state:'unavailable',passed:1,total:1}).includes('неполные'));});
