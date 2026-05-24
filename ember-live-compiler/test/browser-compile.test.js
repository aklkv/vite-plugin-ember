/**
 * Smoke tests for `createBrowserCompiler()` (the `@babel/standalone`-based
 * pipeline in `runtime/compile.ts`).
 *
 * `@babel/standalone` runs fine in Node, so these tests exercise the same
 * code path the browser would, just without a real DOM. As with
 * compile-node.test.js, we don't pre-load a template compiler — the
 * babel-plugin-ember-template-compilation default resolution finds the
 * installed `ember-source` and the test catches regressions in that
 * fallback. Browser consumers must pass `templateCompiler.compiler`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBrowserCompiler } from '../dist/runtime/index.js';

const GJS_SOURCE = `import Component from '@glimmer/component';

export default class Hello extends Component {
  name = 'world';

  <template>
    <h1>Hello {{this.name}}</h1>
  </template>
}
`;

const GTS_SOURCE = `import Component from '@glimmer/component';

interface HelloSignature {
  Args: { name: string };
  Element: HTMLHeadingElement;
}

export default class Hello extends Component<HelloSignature> {
  greeting: string = 'hello';

  <template>
    <h1>{{this.greeting}} {{@name}}</h1>
  </template>
}
`;

const PRECOMPILED_TEMPLATE_SOURCE = `import { precompileTemplate } from '@ember/template-compilation';
import templateOnly from '@ember/component/template-only';
import { setComponentTemplate } from '@ember/component';

const Greeting = templateOnly();
setComponentTemplate(precompileTemplate('<h1>Hello {{@name}}</h1>', { strictMode: true }), Greeting);

export default Greeting;
`;

test('createBrowserCompiler compiles a .gjs source via @babel/standalone', async () => {
  const compiler = createBrowserCompiler();
  const result = await compiler.compile(GJS_SOURCE, {
    filename: '/virtual/Hello.gjs',
    kind: 'gjs',
  });

  assert.ok(result, 'compile() returned a result');
  assert.match(result.code, /@ember\/template-factory/);
  assert.doesNotMatch(result.code, /<template>/);
});

test('createBrowserCompiler compiles a .gts source and strips TS syntax', async () => {
  const compiler = createBrowserCompiler();
  const result = await compiler.compile(GTS_SOURCE, {
    filename: '/virtual/Hello.gts',
    kind: 'gts',
  });

  assert.ok(result);
  assert.match(result.code, /@ember\/template-factory/);
  assert.doesNotMatch(result.code, /interface HelloSignature/);
  assert.doesNotMatch(result.code, /Component<HelloSignature>/);
  assert.doesNotMatch(result.code, /greeting: string =/);
});

test('createBrowserCompiler handles precompiled-template kind', async () => {
  const compiler = createBrowserCompiler();
  const result = await compiler.compile(PRECOMPILED_TEMPLATE_SOURCE, {
    filename: '/virtual/greeting.js',
    kind: 'precompiled-template',
  });

  assert.ok(result);
  assert.match(result.code, /@ember\/template-factory/);
  assert.doesNotMatch(result.code, /precompileTemplate\(/);
});

test('createBrowserCompiler honors sourceMaps: false', async () => {
  const compiler = createBrowserCompiler();
  const result = await compiler.compile(GJS_SOURCE, {
    filename: '/virtual/Hello.gjs',
    kind: 'gjs',
    sourceMaps: false,
  });

  assert.ok(result);
  assert.equal(result.map, undefined);
});

test('createBrowserCompiler emits a source map by default', async () => {
  const compiler = createBrowserCompiler();
  const result = await compiler.compile(GJS_SOURCE, {
    filename: '/virtual/Hello.gjs',
    kind: 'gjs',
  });

  assert.ok(result);
  assert.ok(result.map, 'sourceMaps default is true');
});
