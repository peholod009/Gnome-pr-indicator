import {panelSpacingStyle,prStateAppearance,panelSegments} from '../lib/presentation.js';
import {DEFAULTS,validateSettings} from '../lib/settings.js';
import {test,equal,ok,throws} from './assert.js';
// Wrong position selection would apply another panel area's spacing.
await test('each_position_uses_its_own_left_and_right_margins',()=>{
 const s={...DEFAULTS,'panel-left-margin-left':11,'panel-left-margin-right':17,'panel-center-margin-left':23,'panel-center-margin-right':29,'panel-right-margin-left':31,'panel-right-margin-right':37};
 for(const [position,want] of [['left','margin-left: 11px; margin-right: 17px;'],['center','margin-left: 23px; margin-right: 29px;'],['right','margin-left: 31px; margin-right: 37px;']])equal(panelSpacingStyle({...s,position}),want);
});
await test('zero_margin_is_allowed_but_negative_or_fractional_is_rejected',()=>{equal(validateSettings({'panel-left-margin-left':0})['panel-left-margin-left'],0);for(const value of [-1,1.5,501])throws(()=>validateSettings({'panel-left-margin-left':value}));});
await test('PR_states_have_distinct_badges_not_CI_states',()=>{
 const appearances=['open','draft','closed','merged'].map(state=>prStateAppearance(state,true));
 equal(appearances.map(x=>x.cssClass),['gnome-pr-state-open','gnome-pr-state-draft','gnome-pr-state-closed','gnome-pr-state-merged']);
 equal(appearances.map(x=>x.label),['Открыт','Черновик','Закрыт','Слит']);
 equal(new Set(appearances.map(x=>x.glyph)).size,4);
});
await test('color_switch_keeps_state_label_without_color_class',()=>{equal(prStateAppearance('open',false).cssClass,'');equal(prStateAppearance('open',false).label,'Открыт');});
await test('panel_PR_badge_is_independent_of_failed_checks',()=>{
 const parts=panelSegments({pulls:[{number:42,state:'open',summary:{state:'failure'}}]},DEFAULTS);
 const pr=parts.find(x=>x.kind==='pr');equal(pr.appearance.cssClass,'gnome-pr-state-open');ok(pr.text.includes('✕'));
});
await test('panel_state_switch_and_hide_all_fallback',()=>{
 const s={...DEFAULTS,'panel-icon':false,'panel-count':false,'panel-numbers':false,'panel-summary':false,'panel-state':false};
 equal(panelSegments({pulls:[{number:1,state:'closed'}]},s),[{kind:'text',text:'PR'}]);
});
