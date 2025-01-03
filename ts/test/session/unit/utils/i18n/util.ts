import { setupI18n } from '../../../../../util/i18n/i18n';

export const testDictionary = {
  greeting: 'Hello, {name}!',
  search: '{found_count} of {count} match',
  noArgs: 'No args',
  args: 'Hello, {name}!',
  tag: 'Hello, {name}! <b>Welcome!</b>',
  argInTag: 'Hello, {name}! <b>Welcome, {arg}!</b>',
} as const;

export function initI18n() {
  return setupI18n({
    // testing
    crowdinLocale: 'en',
  });
}
