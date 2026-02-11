import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';

const gt = (a, b) => a > b;

const TodoItem = <template>
  <li
    style="display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #eee;"
  >
    <input
      type="checkbox"
      checked={{@todo.done}}
      {{on "change" @onToggle}}
      style="width: 18px; height: 18px; cursor: pointer;"
    />
    <span
      style="flex: 1; text-decoration: {{if
        @todo.done
        'line-through'
        'none'
      }}; color: {{if @todo.done '#999' 'inherit'}};"
    >
      {{@todo.text}}
    </span>
    <button
      type="button"
      {{on "click" @onRemove}}
      style="background: none; border: none; color: #e04e39; cursor: pointer; font-size: 16px;"
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
    <div style="font-family: system-ui; max-width: 400px;">
      <h4 style="margin: 0 0 12px;">📝 Todo List</h4>

      <form
        {{on "submit" this.addTodo}}
        style="display: flex; gap: 8px; margin-bottom: 12px;"
      >
        <input
          type="text"
          value={{this.newText}}
          {{on "input" this.updateText}}
          placeholder="What needs to be done?"
          style="flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"
        />
        <button
          type="submit"
          style="padding: 8px 16px; border-radius: 4px; background: #e04e39; color: white; border: none; cursor: pointer;"
        >Add</button>
      </form>

      <ul style="list-style: none; padding: 0; margin: 0;">
        {{#each this.todos as |todo|}}
          <TodoItem
            @todo={{todo}}
            @onToggle={{fn this.toggleTodo todo}}
            @onRemove={{fn this.removeTodo todo}}
          />
        {{/each}}
      </ul>

      <p style="margin-top: 12px; font-size: 13px; color: #666;">
        {{this.remaining}}
        item{{if (gt this.remaining 1) "s" ""}}
        remaining
      </p>
    </div>
  </template>
}
