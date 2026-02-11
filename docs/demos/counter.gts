import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';

export default class Counter extends Component {
  @tracked count = 0;

  increment = () => {
    this.count += 1;
  };

  decrement = () => {
    this.count -= 1;
  };

  <template>
    <div
      style="display: flex; align-items: center; gap: 12px; font-family: system-ui;"
    >
      <button
        type="button"
        {{on "click" this.decrement}}
        style="padding: 4px 12px; border-radius: 4px; border: 1px solid #ccc; background: #f5f5f5; cursor: pointer; font-size: 18px;"
      >−</button>

      <span
        style="min-width: 40px; text-align: center; font-size: 24px; font-weight: bold;"
      >
        {{this.count}}
      </span>

      <button
        type="button"
        {{on "click" this.increment}}
        style="padding: 4px 12px; border-radius: 4px; border: 1px solid #ccc; background: #f5f5f5; cursor: pointer; font-size: 18px;"
      >+</button>
    </div>
  </template>
}
