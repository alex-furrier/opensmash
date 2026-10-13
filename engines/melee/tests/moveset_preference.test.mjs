import test from 'node:test';import assert from 'node:assert/strict';
import {resolveMovesetPreference,movesetPreferenceVersion} from '../web/lib/moveset-preference.mjs';
const targets=['mario','luigi','fox','captain-falcon'].map(slug=>({slug}));
test('legacy global Mario yields to fixed character defaults; fresh/auto and other saved choices are preserved',()=>{
 for(const target of [undefined,'auto','mario'])assert.equal(resolveMovesetPreference({ports:[{target}]},undefined,targets),'auto');
 assert.equal(resolveMovesetPreference({ports:[{target:'fox'}]},undefined,targets),'fox');
});
test('a current explicit Mario preference and valid URL override remain intentional; invalid choices fall back safely',()=>{
 const saved={ports:[{target:'mario'}],movesetPreferenceVersion};
 assert.equal(resolveMovesetPreference(saved,undefined,targets),'mario');
 assert.equal(resolveMovesetPreference({ports:[{target:'mario'}]},'mario',targets),'mario');
 assert.equal(resolveMovesetPreference(saved,'luigi',targets),'luigi');
 assert.equal(resolveMovesetPreference({ports:[{target:'missing'}]},'missing',targets),'auto');
});
