import Component from '@glimmer/component';
import { service } from '@ember/service';

import type GreetingService from './greeting-service';

export default class ServiceDemo extends Component {
  @service declare greeting: GreetingService;

  <template>
    <div
      style="display: flex; align-items: center; gap: 10px; padding: 16px; font-family: var(--vp-font-family-base, system-ui); background: var(--vp-c-bg-soft); border-radius: 8px;"
    >
      <span style="font-size: 24px;">🏷️</span>
      <div>
        <p
          style="margin: 0; font-size: 16px; font-weight: 600; color: var(--vp-c-text-1);"
        >
          {{this.greeting.message}}
        </p>
        <p style="margin: 4px 0 0; font-size: 13px; color: var(--vp-c-text-2);">
          This message was injected via
          <code>@service</code>.
        </p>
      </div>
    </div>
  </template>
}
