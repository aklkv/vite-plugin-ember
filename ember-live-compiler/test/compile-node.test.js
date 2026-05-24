/**
 * End-to-end smoke tests for the Node `createNodeCompiler()` pipeline.
 *
 * These tests don't pre-load a template compiler — they let
 * `babel-plugin-ember-template-compilation` locate the installed
 * `ember-source` on its own. That's the same path the documented "no
 * options" usage takes, so any regression in that fallback surfaces
 * here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createNodeCompiler } from '../dist/index.js';

const GJS_SOURCE = `import Component from '@glimmer/component';

export default class Hello extends Component {
  name = 'world';

  <template>
    <h1>Hello {{this.name}}</h1>
  </template>
}
`;

const GTS_SOURCE = `import Component from '@glimmer/component';

interface Args { name: string }

export default class Hello extends Component<{ Args: Args }> {
  greeting: string = 'hello';

  <template>
    <h1>{{this.greeting}} {{@name}}</h1>
  </template>
}
`;

const PRECOMPILED_TEMPLATE_SOURCE = `import { precompileTemplate } from '@ember/template-compilation';
import { setComponentTemplate } from '@ember/component';
import templateOnly from '@ember/component/template-only';

export default setComponentTemplate(
  precompileTemplate('<p>hi</p>', { strictMode: true }),
  templateOnly(),
);
`;

test('compiles a .gjs source into JS that references the template factory', async () => {
  const compiler = createNodeCompiler();
  const result = await compiler.compile(GJS_SOURCE, {
    filename: '/virtual/Hello.gjs',
    kind: 'gjs',
  });

  assert.ok(result, 'expected a non-null compile result');
  assert.equal(typeof result.code, 'string');
  // template-compilation rewrites <template> into a template factory import.
  assert.match(
    result.code,
    /@ember\/template-factory/,
    'compiled output should import the template factory',
  );
  // The original <template> tag must be gone.
  assert.doesNotMatch(result.code, /<template>/);
});

test('compiles a .gts source and strips TypeScript syntax', async () => {
  const compiler = createNodeCompiler();
  const result = await compiler.compile(GTS_SOURCE, {
    filename: '/virtual/Hello.gts',
    kind: 'gts',
  });

  assert.ok(result, 'expected a non-null compile result');
  assert.equal(typeof result.code, 'string');
  assert.match(result.code, /@ember\/template-factory/);
  // No leftover TS-only syntax in emitted JS.
  assert.doesNotMatch(result.code, /interface Args/);
  assert.doesNotMatch(result.code, /Component<\{ Args: Args \}>/);
  assert.doesNotMatch(result.code, /greeting:\s*string\s*=/);
});

test('compiles a precompiled-template .js (no content-tag, no TS)', async () => {
  const compiler = createNodeCompiler();
  const result = await compiler.compile(PRECOMPILED_TEMPLATE_SOURCE, {
    filename: '/virtual/template-only.js',
    kind: 'precompiled-template',
  });

  assert.ok(result, 'expected a non-null compile result');
  assert.equal(typeof result.code, 'string');
  // precompileTemplate(...) calls are rewritten by the babel plugin.
  assert.doesNotMatch(result.code, /precompileTemplate\(/);
  assert.match(result.code, /@ember\/template-factory/);
});

test('honors sourceMaps: false', async () => {
  const compiler = createNodeCompiler();
  const result = await compiler.compile(GJS_SOURCE, {
    filename: '/virtual/NoMap.gjs',
    kind: 'gjs',
    sourceMaps: false,
  });

  assert.ok(result);
  assert.equal(result.map, undefined);
});

test('emits a source map by default', async () => {
  const compiler = createNodeCompiler();
  const result = await compiler.compile(GJS_SOURCE, {
    filename: '/virtual/WithMap.gjs',
    kind: 'gjs',
  });

  assert.ok(result);
  assert.ok(result.map, 'expected a source map object by default');
});
