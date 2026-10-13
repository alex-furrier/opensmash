import test from 'node:test';import assert from 'node:assert/strict';
import {resolveMovesetPreference,resolvePortMovesets,movesetPreferenceVersion} from '../web/lib/moveset-preference.mjs';
const targets=['mario','luigi','fox','captain-falcon'].map(slug=>({slug}));
test('legacy global Mario yields to fixed character defaults; fresh/auto and other saved choices are preserved',()=>{
 for(const target of [undefined,'auto','mario'])assert.equal(resolveMovesetPreference({ports:[{target}]},undefined,targets),'auto');
 assert.equal(resolveMovesetPreference({ports:[{target:'fox'}]},undefined,targets),'fox');
});
test('per-player saved bases survive refresh independently; only a valid URL override applies globally',()=>{
 const saved={movesetPreferenceVersion,ports:[{target:'fox'},{target:'luigi'},{target:'mario'},{target:'auto'}]};
 assert.deepEqual(resolvePortMovesets(saved,null,targets,saved.ports).map(p=>p.target),['fox','luigi','mario','auto']);
 assert.deepEqual(resolvePortMovesets(saved,'mario',targets,saved.ports).map(p=>p.target),['mario','mario','mario','mario']);
 assert.deepEqual(resolvePortMovesets({},null,targets,[{target:'mario'},{target:'fox'}]).map(p=>p.target),['auto','fox']);
});
test('a current explicit Mario preference and valid URL override remain intentional; invalid choices fall back safely',()=>{
 const saved={ports:[{target:'mario'}],movesetPreferenceVersion};
 assert.equal(resolveMovesetPreference(saved,undefined,targets),'mario');
 assert.equal(resolveMovesetPreference({ports:[{target:'mario'}]},'mario',targets),'mario');
 assert.equal(resolveMovesetPreference(saved,'luigi',targets),'luigi');
 assert.equal(resolveMovesetPreference({ports:[{target:'missing'}]},'missing',targets),'auto');
});
