import assert from 'node:assert/strict';
import test from 'node:test';
import { projectHasPage } from './pages.js';

test('a project on the work page has a page', () => {
  assert.equal(projectHasPage({ _id: 'ember', showInWork: true }, []), true);
});

test('a project on the home page has a page', () => {
  assert.equal(projectHasPage({ _id: 'drafts.moss', showInWork: false }, ['moss']), true);
});

test('a project on neither list has no page', () => {
  assert.equal(projectHasPage({ _id: 'static', showInWork: false, showInArchive: true }, ['moss']), false);
});
