import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';

const eq = (a, b) => a === b;

const COLORS = [
  '#e04e39',
  '#3498db',
  '#2ecc71',
  '#f39c12',
  '#9b59b6',
  '#1abc9c',
];

const ColorSwatch = <template>
  <button
    type="button"
    {{on "click" @onSelect}}
    style="width: 32px; height: 32px; border-radius: 50%;
           border: {{if
      @isSelected
      '3px solid var(--vp-c-text-1)'
      '2px solid transparent'
    }};
           background: {{@color}}; cursor: pointer;
           transition: transform 0.15s;
           transform: {{if @isSelected 'scale(1.2)' 'scale(1)'}};"
  ></button>
</template>;

export default class ColorPicker extends Component {
  @tracked selectedColor = COLORS[0];
  @tracked message = 'Pick a color!';

  selectColor = (color) => {
    this.selectedColor = color;
    this.message = `Selected: ${color}`;
  };

  <template>
    <div
      style="font-family: var(--vp-font-family-base, system-ui); max-width: 300px;"
    >
      <h4 style="margin: 0 0 12px; color: var(--vp-c-text-1);">🎨 Color Picker</h4>

      <div
        style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;"
      >
        {{#each COLORS as |color|}}
          <ColorSwatch
            @color={{color}}
            @isSelected={{eq color this.selectedColor}}
            @onSelect={{fn this.selectColor color}}
          />
        {{/each}}
      </div>

      <div
        style="padding: 20px; border-radius: 8px; text-align: center;
               background: {{this.selectedColor}}; color: white;
               font-weight: bold; transition: background 0.3s;"
      >
        {{this.message}}
      </div>
    </div>
  </template>
}
