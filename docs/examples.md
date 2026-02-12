# Examples

Interactive demos showing the different ways to embed Ember components in VitePress.

## Static code fence

A regular code fence without `live` — syntax-highlighted only, not rendered:

```gjs
<template>
  <h3>Hello, static fence!</h3>
</template>
```

---

## Template-only component

The simplest live demo — a `<template>` tag with no class:

```gjs live
<template>
  <p style='color: tomato; font-weight: bold;'>
    Hello from a live Ember template!
  </p>
</template>
```

---

## Live + Preview

Adding `preview` shows both the rendered output and the source code:

```gjs live preview
<template>
  <p style='color: seagreen'>
    This renders with a preview panel and a code block.
  </p>
</template>
```

---

## Toggle button

A class-based component with `@tracked` state and the `on` modifier:

```gjs live
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';

export default class Toggle extends Component {
  @tracked isOn = false;

  toggle = () => {
    this.isOn = !this.isOn;
  };

  <template>
    <button
      type='button'
      {{on 'click' this.toggle}}
      style='padding: 10px 20px; border-radius: 20px; border: none; cursor: pointer; font-weight: bold; font-size: 14px; transition: all 0.2s;
             background: {{if this.isOn "#2ecc71" "#ccc"}};
             color: {{if this.isOn "white" "#666"}};'
    >
      {{if this.isOn 'ON ✓' 'OFF'}}
    </button>
  </template>
}
```

---

## Step counter (with preview)

A more complex component showing input binding, multiple actions, and preview mode:

```gjs live preview
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';

export default class StepCounter extends Component {
  @tracked step = 1;
  @tracked value = 0;

  changeStep = (e) => {
    this.step = Number(e.target.value) || 1;
  };

  add = () => {
    this.value += this.step;
  };

  reset = () => {
    this.value = 0;
  };

  <template>
    <div
      style='font-family: system-ui; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;'
    >
      <label style='font-size: 13px;'>
        Step:
        <input
          type='number'
          value={{this.step}}
          {{on 'input' this.changeStep}}
          min='1'
          style='width: 50px; padding: 4px; border: 1px solid #ccc; border-radius: 4px;'
        />
      </label>
      <button
        type='button'
        {{on 'click' this.add}}
        style='padding: 6px 14px; border-radius: 4px; background: #3498db; color: white; border: none; cursor: pointer;'
      >Add +{{this.step}}</button>
      <button
        type='button'
        {{on 'click' this.reset}}
        style='padding: 6px 14px; border-radius: 4px; background: #e74c3c; color: white; border: none; cursor: pointer;'
      >Reset</button>
      <span
        style='font-size: 20px; font-weight: bold; min-width: 60px; text-align: center;'
      >
        {{this.value}}
      </span>
    </div>
  </template>
}
```

---

## File-based demos

Components loaded from `.gjs` / `.gts` files in the `demos/` directory:

### button.gjs

<CodePreview src="/demos/button.gjs" />

### counter.gts

An interactive counter with TypeScript, `@tracked` state, and arrow function methods.

<CodePreview src="/demos/counter.gts" />

### todo-list.gjs

A todo list demonstrating component composition and array state management.

<CodePreview src="/demos/todo-list.gjs" />

### tab-panel.gts

A tab panel written in GTS with TypeScript interfaces.

<CodePreview src="/demos/tab-panel.gts" />

### color-picker.gjs

A color picker showing child component extraction and dynamic inline styles.

<CodePreview src="/demos/color-picker.gjs" />
