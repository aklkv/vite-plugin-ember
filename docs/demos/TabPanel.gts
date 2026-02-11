import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';

const eq = (a: unknown, b: unknown) => a === b;

interface Signature {
  Args: {};
}

type Tab = 'about' | 'features' | 'setup';

const TAB_CONTENT: Record<Tab, string> = {
  about:
    'This plugin lets you embed live Ember components directly inside VitePress documentation. Components are compiled on-the-fly using content-tag and babel-plugin-ember-template-compilation.',
  features:
    '• Inline GJS/GTS code fences with live rendering\n• File-based component demos\n• Full Glimmer component support with tracked state\n• TypeScript support via .gts files\n• Hot module replacement',
  setup:
    '1. Install vite-plugin-ember\n2. Add it to your VitePress config\n3. Use ```gjs live fences or <EmberPlayground> components\n4. Write standard Ember/Glimmer components',
};

export default class TabPanel extends Component<Signature> {
  @tracked activeTab: Tab = 'about';

  selectTab = (tab: Tab) => {
    this.activeTab = tab;
  };

  get content(): string {
    return TAB_CONTENT[this.activeTab];
  }

  get tabs(): Tab[] {
    return ['about', 'features', 'setup'];
  }

  <template>
    <div
      style="font-family: system-ui; max-width: 500px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;"
    >
      <nav
        style="display: flex; background: #f5f5f5; border-bottom: 1px solid #ddd;"
      >
        {{#each this.tabs as |tab|}}
          <button
            type="button"
            {{on "click" (fn this.selectTab tab)}}
            style="flex: 1; padding: 10px; border: none; cursor: pointer; font-weight: 600; text-transform: capitalize;
                   background: {{if
              (eq tab this.activeTab)
              'white'
              'transparent'
            }};
                   color: {{if (eq tab this.activeTab) '#e04e39' '#666'}};
                   border-bottom: {{if
              (eq tab this.activeTab)
              '2px solid #e04e39'
              '2px solid transparent'
            }};"
          >
            {{tab}}
          </button>
        {{/each}}
      </nav>

      <div
        style="padding: 16px; min-height: 100px; white-space: pre-line; line-height: 1.6;"
      >
        {{this.content}}
      </div>
    </div>
  </template>
}
