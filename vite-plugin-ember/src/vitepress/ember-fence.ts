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

/** Markdown-it plugin: ```gjs live → <CodePreview /> */
export function emberFence(md: MarkdownIt, component = 'CodePreview') {
  const originalFence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = (token.info || '').trim();
    const [lang, ...flags] = info.split(/\s+/);
    if ((lang === 'gjs' || lang === 'gts') && flags.includes('live')) {
      const virtualId = makeVirtualId(token.content, lang as 'gjs' | 'gts');
      // Use /@id/ prefix so the browser requests it as a URL
      const src = `/@id/${virtualId}`;
      if (flags.includes('preview')) {
        // Show rendered component + syntax-highlighted code block.
        // Strip 'live' and 'preview' flags so the original fence renders
        // a normal Shiki-highlighted block instead of triggering us again.
        const savedInfo = token.info;
        token.info = lang;
        const highlighted = originalFence(tokens, idx, options, env, self);
        token.info = savedInfo;
        return `<${component} src="${src}">${highlighted}</${component}>`;
      }
      return `<${component} src="${src}" />`;
    }
    return originalFence(tokens, idx, options, env, self);
  };
}
