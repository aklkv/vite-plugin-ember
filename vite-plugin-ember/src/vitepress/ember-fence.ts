import { createHash } from 'node:crypto';
import { demoRegistry } from '../index.js';
import type MarkdownIt from 'markdown-it';

function makeVirtualId(code: string, lang: 'gjs' | 'gts') {
  const hash = createHash('sha1').update(code).digest('hex').slice(0, 8);
  const moduleId = `virtual:ember-demo-${hash}.${lang}`;
  // Store source in the shared registry (read by the Vite plugin's load hook)
  demoRegistry.set(moduleId, code);
  return moduleId;
}

/**
 * Replace `<Component src="...">` with `:loader="() => import('...')"` so
 * Vite can statically analyse and bundle the import in production (SSG) builds.
 */
function transformSrcToLoader(content: string, component: string): string {
  const re = new RegExp(`<${component}\\s+src="([^"]+)"`, 'g');
  return content.replace(
    re,
    (_, src: string) => `<${component} :loader="() => import('${src}')"`,
  );
}

/** Markdown-it plugin: ```gjs live → <CodePreview /> */
export function emberFence(md: MarkdownIt, component = 'CodePreview') {
  const originalFence = md.renderer.rules.fence!;
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
        return `<${component} :loader="() => import('${virtualId}')">${highlighted}</${component}>`;
      }
      return `<${component} :loader="() => import('${virtualId}')" />`;
    }
    return originalFence(tokens, idx, options, env, self);
  };

  // Transform file-based <CodePreview src="..."> tags so Vite can bundle them
  md.core.ruler.push('ember-loader-transform', (state) => {
    for (const token of state.tokens) {
      if (token.type === 'html_block' || token.type === 'html_inline') {
        token.content = transformSrcToLoader(token.content, component);
      }
      if (token.children) {
        for (const child of token.children) {
          if (child.type === 'html_inline') {
            child.content = transformSrcToLoader(child.content, component);
          }
        }
      }
    }
  });
}
