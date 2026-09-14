import assert from 'node:assert/strict';
import { test } from 'node:test';
import { repositoryIdFromPath, sectionAtScroll } from '../src/lib/workspace-navigation.ts';

test('repository context is limited to repository detail routes', () => {
  for (const path of ['/', '/repos', '/repos/', '/sign-in', '/repos-extra/a']) assert.equal(repositoryIdFromPath(path), null);
  assert.equal(repositoryIdFromPath('/repos/first'), 'first');
  assert.equal(repositoryIdFromPath('/repos/second/readme'), 'second');
});

test('navigation tracks sections passed while scrolling in either direction', () => {
  const positions = top => [{ id: 'architecture', top: top - 700 }, { id: 'overview', top }, { id: 'components', top: top + 500 }, { id: 'readme', top: top + 900 }];
  assert.equal(sectionAtScroll(positions(300), false), 'architecture');
  assert.equal(sectionAtScroll(positions(90), false), 'overview');
  assert.equal(sectionAtScroll(positions(-450), false), 'components');
  assert.equal(sectionAtScroll(positions(300), false), 'architecture');
});

test('the final short section can be active at the document bottom', () => {
  assert.equal(sectionAtScroll([{ id: 'components', top: -200 }, { id: 'readme', top: 400 }], true), 'readme');
  assert.equal(sectionAtScroll([], false), 'architecture');
});
