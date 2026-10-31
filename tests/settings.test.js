import {validateSettings, DEFAULTS, readSettings, OPTIONS} from '../lib/settings.js';
import {test,equal,throws} from './assert.js';
await test('defaults_are_3_and_60',()=>{const s=validateSettings({});equal([s.limit,s['refresh-seconds']],[3,60]);});
await test('invalid_repository_and_interval_rejected',()=>{for (const repository of ['a','a/b/c','../example','https://github.com/a/b']) throws(()=>validateSettings({repository}));for (const n of [0,-1,1.5,2147483648]) throws(()=>validateSettings({'refresh-seconds':n}));});
await test('custom_interval_and_repo_retained',()=>{let s=validateSettings({repository:'other/private', 'refresh-seconds':901});equal([s.repository,s['refresh-seconds']],['other/private',901]);});
await test('invalid_enum_and_limit_rejected',()=>{throws(()=>validateSettings({position:'bad'}));throws(()=>validateSettings({limit:11}));});
await test('read_settings_reads_all_types',()=>{const fake={get_boolean:k=>DEFAULTS[k],get_int:k=>DEFAULTS[k],get_string:k=>DEFAULTS[k]};equal(readSettings(fake),DEFAULTS);equal(OPTIONS.length,Object.keys(DEFAULTS).length);});
