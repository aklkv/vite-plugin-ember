import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { demoRegistry } from '../index.js';
import MarkdownIt from 'markdown-it';

/** Fence render rule – extracted from the MarkdownIt instance shape. */
type RenderRule = NonNullable<MarkdownIt['renderer']['rules']['fence']>;

/** Core ruler state – extracted via Core.State constructor. */
type StateCore = InstanceType<MarkdownIt['core']['State']>;

function makeVirtualId(code: string, lang: 'gjs' | 'gts') {
  const hash = createHash('sha1').update(code).digest('hex').slice(0, 8);
  const moduleId = `virtual:ember-demo-${hash}.${lang}`;
  // Store source in the shared registry (read by the Vite plugin's load hook)
  demoRegistry.set(moduleId, code);
  return moduleId;
}

/**
 * Read a source file and produce a Shiki-highlighted code block via the
 * original markdown-it fence renderer.  Returns `null` on any failure.
 */
function renderSourceBlock(
  src: string,
  srcDir: string,
  state: StateCore,
  originalFence: RenderRule,
): string | null {
  const filePath = resolve(srcDir, src.replace(/^\//, ''));
  let source: string;
  try {
    source = readFileSync(filePath, 'utf-8').trim();
  } catch {
    return null;
  }

  const lang = src.endsWith('.gts') ? 'gts' : 'gjs';
  const token = new state.Token('fence', 'code', 0);
  token.info = lang;
  token.content = source + '\n';
  token.markup = '```';
  token.map = [0, source.split('\n').length];
  token.block = true;

  try {
    return originalFence(
      [token],
      0,
      state.md.options,
      state.env,
      state.md.renderer,
    );
  } catch {
    return null;
  }
}

/** Markdown-it plugin: ```gjs live → <CodePreview /> */
export function emberFence(md: MarkdownIt, component = 'CodePreview') {
  const originalFence = md.renderer.rules.fence!;

  // Pre-compile regex once per plugin instance.
  // Captures: (1) attrs before src, (2) src value, (3) attrs after src, (4) optional self-close slash
  const srcTagRe = new RegExp(
    `<${component}\\b([^>]*?)\\bsrc="([^"]+)"([^>]*?)(\\s*/?)>`,
    'g',
  );

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = (token.info || '').trim();
    const [lang, ...flags] = info.split(/\s+/);
    if ((lang === 'gjs' || lang === 'gts') && flags.includes('live')) {
      const virtualId = makeVirtualId(token.content, lang as 'gjs' | 'gts');
      if (flags.includes('preview')) {
        // Show rendered component + syntax-highlighted code block.
        // Strip 'live' and 'preview' flags so the original fence renders
        // a normal Shiki-highlighted block instead of triggering us again.
        const savedInfo = token.info;
        token.info = lang;
        const highlighted = originalFence(tokens, idx, options, env, self);
        token.info = savedInfo;
        const collapsible = flags.includes('collapsible') ? ' collapsible' : '';
        return `<${component} :loader="() => import('${virtualId}')"${collapsible}>${highlighted}</${component}>`;
      }
      return `<${component} :loader="() => import('${virtualId}')" />`;
    }
    return originalFence(tokens, idx, options, env, self);
  };

  // Transform file-based <CodePreview src="..."> tags in a single pass:
  //  1. Inject `:loader="() => import('…')"` so Vite can bundle the import.
  //  2. When `preview` is present on a self-closing tag, read the source file
  //     and embed a Shiki-highlighted code block as slot content.
  md.core.ruler.push('ember-loader-transform', loaderTransform);

  function loaderTransform(state: StateCore): void {
    // Compute srcDir once per markdown file
    const { env } = state;
    const srcDir =
      env?.path && env?.relativePath
        ? env.path.slice(0, -env.relativePath.length)
        : null;

    function transform(content: string): string {
      srcTagRe.lastIndex = 0;
      return content.replace(
        srcTagRe,
        (_match, before: string, src: string, after: string, slash: string) => {
          const loader = `:loader="() => import('${src}')"`;
          const attrs = `${before}src="${src}" ${loader}${after}`;
          const isSelfClosing = slash.includes('/');
          const hasPreview = /\bpreview\b/.test(before + after);

          if (isSelfClosing && hasPreview && srcDir) {
            const highlighted = renderSourceBlock(
              src,
              srcDir,
              state,
              originalFence,
            );
            if (highlighted) {
              return `<${component} ${attrs}>${highlighted}</${component}>`;
            }
          }

          return `<${component} ${attrs}${slash}>`;
        },
      );
    }

    for (const token of state.tokens) {
      if (token.type === 'html_block' || token.type === 'html_inline') {
        token.content = transform(token.content);
      }
      if (token.children) {
        for (const child of token.children) {
          if (child.type === 'html_inline') {
            child.content = transform(child.content);
          }
        }
      }
    }
  }
}
