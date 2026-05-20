import { modifier } from 'ember-modifier';

const autofocus = modifier((element) => {
  element.focus();
});

<template>
  <input
    {{autofocus}}
    type="text"
    placeholder="I should be focused on load"
    style="padding: 8px 12px; border-radius: 6px; border: 1px solid #ccc; font-family: system-ui; font-size: 14px; width: 280px;"
  />
</template>
