import test from 'node:test';import assert from 'node:assert/strict';
import {meleeRosterPresentation} from './melee-roster.js';
test('display alias reaches both accessible name and visible caption without renaming source metadata',()=>{
 const source={slug:'stable',name:'Source Person',short:'SOURCE',displayName:'Stage Name',portrait:'/api/imports/portraits/stable.webp'};
 const view=meleeRosterPresentation(source);
 assert.equal(view.name,'Stage Name');assert.equal(view.short,'Stage Name');assert.equal(view.sourceName,'Source Person');assert.equal(view.sourceShort,'SOURCE');assert.equal(view.slug,'stable');assert.equal(view.portrait,'/melee/api/imports/portraits/stable.webp');assert.equal(source.name,'Source Person');assert.equal(source.short,'SOURCE');
});
test('unaliasied fighters retain their intentional short caption',()=>{
 const source={name:'Source Person',short:'SOURCE',displayName:'Source Person'};
 assert.equal(meleeRosterPresentation(source).short,'SOURCE');
});
