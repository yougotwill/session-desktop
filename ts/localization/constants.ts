export enum LOCALE_DEFAULTS {
  app_name = 'Session',
  session_download_url = 'https://getsession.org/download',
  gif = 'GIF',
  oxen_foundation = 'Oxen Foundation',
}

export const rtlLocales = ['ar', 'fa', 'he', 'ps', 'ur'];

export const crowdinLocales = [
  'en',
  'af',
  'ar',
  'az',
  'bal',
  'be',
  'bg',
  'bn',
  'ca',
  'cs',
  'cy',
  'da',
  'de',
  'el',
  'eo',
  'es-419',
  'es',
  'et',
  'eu',
  'fa',
  'fi',
  'fil',
  'fr',
  'gl',
  'ha',
  'he',
  'hi',
  'hr',
  'hu',
  'hy-AM',
  'id',
  'it',
  'ja',
  'ka',
  'km',
  'kmr',
  'kn',
  'ko',
  'ku',
  'lg',
  'lo',
  'lt',
  'lv',
  'mk',
  'mn',
  'ms',
  'my',
  'nb',
  'ne',
  'nl',
  'nn',
  'no',
  'ny',
  'pa',
  'pl',
  'ps',
  'pt-BR',
  'pt-PT',
  'ro',
  'ru',
  'sh',
  'si',
  'sk',
  'sl',
  'sq',
  'sr-CS',
  'sr-SP',
  'sv',
  'sw',
  'ta',
  'te',
  'th',
  'tl',
  'tr',
  'uk',
  'ur',
  'uz',
  'vi',
  'xh',
  'zh-CN',
  'zh-TW',
] as const;

export type CrowdinLocale = (typeof crowdinLocales)[number];

export function isCrowdinLocale(locale: string): locale is CrowdinLocale {
  return crowdinLocales.includes(locale as CrowdinLocale);
}

