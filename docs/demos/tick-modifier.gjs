import { modifier } from 'ember-modifier';

// Element modifier that writes the current time into its element every
// second and cleans up the interval when the element is torn down.
// Demonstrates ember-modifier's setup + teardown lifecycle without
// stealing focus or scrolling the page.
const tick = modifier((element) => {
  const render = () => {
    element.textContent = new Date().toLocaleTimeString();
  };

  render();
  const id = setInterval(render, 1000);

  return () => clearInterval(id);
});

<template>
  <output
    {{tick}}
    style="display: inline-block; padding: 8px 12px; border-radius: 6px; border: 1px solid #ccc; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; min-width: 140px; text-align: center;"
  />
</template>
