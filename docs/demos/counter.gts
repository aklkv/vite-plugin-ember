import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';

interface CounterSignature {
  Element: HTMLDivElement;
}

export default class Counter extends Component<CounterSignature> {
  @tracked count = 0;

  increment = () => {
    this.count += 1;
  };

  decrement = () => {
    this.count -= 1;
  };

  <template>
    <div
      style="display: inline-flex; align-items: center; gap: 0; font-family: var(--vp-font-family-base, system-ui); border: 1px solid var(--vp-c-divider); border-radius: 8px; overflow: hidden;"
    >
      <button
        type="button"
        {{on "click" this.decrement}}
        style="padding: 8px 16px; border: none; border-right: 1px solid var(--vp-c-divider); background: var(--vp-c-bg-soft); color: var(--vp-c-text-1); cursor: pointer; font-size: 18px; line-height: 1; transition: background 0.2s;"
      >−</button>

      <span
        style="min-width: 48px; padding: 8px 4px; text-align: center; font-size: 20px; font-weight: 600; color: var(--vp-c-text-1); background: var(--vp-c-bg); font-variant-numeric: tabular-nums;"
      >
        {{this.count}}
      </span>

      <button
        type="button"
        {{on "click" this.increment}}
        style="padding: 8px 16px; border: none; border-left: 1px solid var(--vp-c-divider); background: var(--vp-c-bg-soft); color: var(--vp-c-text-1); cursor: pointer; font-size: 18px; line-height: 1; transition: background 0.2s;"
      >+</button>
    </div>
  </template>
}
