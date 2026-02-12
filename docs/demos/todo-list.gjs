import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';

const gt = (a, b) => a > b;

const TodoItem = <template>
  <li
    style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-bottom: 1px solid var(--vp-c-divider);"
  >
    <input
      type="checkbox"
      checked={{@todo.done}}
      {{on "change" @onToggle}}
      style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--vp-c-brand-1, #e04e39);"
    />
    <span
      style="flex: 1; text-decoration: {{if
        @todo.done
        'line-through'
        'none'
      }}; color: {{if
        @todo.done
        'var(--vp-c-text-3)'
        'var(--vp-c-text-1)'
      }}; transition: color 0.2s;"
    >
      {{@todo.text}}
    </span>
    <button
      type="button"
      {{on "click" @onRemove}}
      style="background: none; border: none; color: var(--vp-c-danger-1, #e04e39); cursor: pointer; font-size: 16px; padding: 4px; line-height: 1; opacity: 0.7; transition: opacity 0.2s;"
    >✕</button>
  </li>
</template>;

export default class TodoList extends Component {
  @tracked todos = [
    { id: 1, text: 'Learn Ember with Vite', done: true },
    { id: 2, text: 'Build a VitePress plugin', done: true },
    { id: 3, text: 'Create interactive demos', done: false },
  ];
  @tracked nextId = 4;
  @tracked newText = '';

  updateText = (event) => {
    this.newText = event.target.value;
  };

  addTodo = (event) => {
    event.preventDefault();
    const text = this.newText.trim();
    if (!text) return;
    this.todos = [...this.todos, { id: this.nextId, text, done: false }];
    this.nextId += 1;
    this.newText = '';
  };

  toggleTodo = (todo) => {
    this.todos = this.todos.map((t) =>
      t.id === todo.id ? { ...t, done: !t.done } : t,
    );
  };

  removeTodo = (todo) => {
    this.todos = this.todos.filter((t) => t.id !== todo.id);
  };

  get remaining() {
    return this.todos.filter((t) => !t.done).length;
  }

  <template>
    <div
      style="font-family: var(--vp-font-family-base, system-ui); max-width: 420px; border: 1px solid var(--vp-c-divider); border-radius: 8px; overflow: hidden;"
    >
      <div
        style="padding: 14px 16px; border-bottom: 1px solid var(--vp-c-divider); background: var(--vp-c-bg-soft);"
      >
        <h4 style="margin: 0; font-size: 16px; color: var(--vp-c-text-1);">📝
          Todo List</h4>
      </div>

      <div style="padding: 12px 16px;">
        <form
          {{on "submit" this.addTodo}}
          style="display: flex; gap: 8px; margin-bottom: 4px;"
        >
          <input
            type="text"
            value={{this.newText}}
            {{on "input" this.updateText}}
            placeholder="What needs to be done?"
            style="flex: 1; padding: 8px 12px; border: 1px solid var(--vp-c-divider); border-radius: 6px; background: var(--vp-c-bg); color: var(--vp-c-text-1); font-size: 14px; outline: none;"
          />
          <button
            type="submit"
            style="padding: 8px 16px; border-radius: 6px; background: var(--vp-c-brand-1, #e04e39); color: white; border: none; cursor: pointer; font-weight: 600; font-size: 14px;"
          >Add</button>
        </form>
      </div>

      <ul style="list-style: none; padding: 0; margin: 0;">
        {{#each this.todos as |todo|}}
          <TodoItem
            @todo={{todo}}
            @onToggle={{fn this.toggleTodo todo}}
            @onRemove={{fn this.removeTodo todo}}
          />
        {{/each}}
      </ul>

      <div
        style="padding: 10px 16px; border-top: 1px solid var(--vp-c-divider); background: var(--vp-c-bg-soft);"
      >
        <p style="margin: 0; font-size: 13px; color: var(--vp-c-text-3);">
          {{this.remaining}}
          item{{if (gt this.remaining 1) "s" ""}}
          remaining
        </p>
      </div>
    </div>
  </template>
}
