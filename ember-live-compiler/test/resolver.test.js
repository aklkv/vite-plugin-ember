/**
 * Tests for the bundler-helper utilities re-exported from
 * `ember-live-compiler/resolver`. These helpers are pure (no Node-only
 * APIs, no Babel, no DOM) so they're safe to run in plain Node.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EMBER_PACKAGE_PREFIXES,
  EMBROIDER_MACROS_SHIM_SOURCE,
  EMBROIDER_MACROS_VIRTUAL_ID,
  isEmberSpecifier,
} from '../dist/resolver/index.js';

test('EMBER_PACKAGE_PREFIXES lists @ember/ and @glimmer/', () => {
  assert.deepEqual([...EMBER_PACKAGE_PREFIXES], ['@ember/', '@glimmer/']);
});

test('isEmberSpecifier matches @ember/* and @glimmer/* specifiers', () => {
  assert.equal(isEmberSpecifier('@ember/component'), true);
  assert.equal(isEmberSpecifier('@ember/renderer'), true);
  assert.equal(isEmberSpecifier('@glimmer/component'), true);
  assert.equal(isEmberSpecifier('@glimmer/tracking'), true);
});

test('isEmberSpecifier rejects non-Ember specifiers', () => {
  assert.equal(isEmberSpecifier('ember-source'), false);
  assert.equal(isEmberSpecifier('@ember-data/store'), false);
  assert.equal(isEmberSpecifier('react'), false);
  assert.equal(isEmberSpecifier(''), false);
});

test('EMBROIDER_MACROS_VIRTUAL_ID uses the Rollup/Vite \\0 prefix', () => {
  assert.equal(EMBROIDER_MACROS_VIRTUAL_ID.startsWith('\0'), true);
});

test('EMBROIDER_MACROS_SHIM_SOURCE exports all consumed macros', () => {
  const expected = [
    'isDevelopingApp',
    'isTesting',
    'macroCondition',
    'dependencySatisfies',
    'getOwnConfig',
    'getConfig',
    'importSync',
    'getGlobalConfig',
  ];
  for (const name of expected) {
    assert.match(
      EMBROIDER_MACROS_SHIM_SOURCE,
      new RegExp(`export function ${name}\\b`),
      `expected shim to export ${name}`,
    );
  }
});
