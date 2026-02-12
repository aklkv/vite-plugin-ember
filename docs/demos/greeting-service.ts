import { tracked } from '@glimmer/tracking';

/**
 * A tiny service registered as `service:greeting`.
 *
 * Uses `@tracked` so Glimmer templates that read its properties
 * automatically re-render when they change.
 */
export default class GreetingService {
  @tracked message = 'Hello from an Ember service! 👋';
}
