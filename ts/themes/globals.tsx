import { isTestIntegration } from '../shared/env_vars';
import { hexColorToRGB } from '../util/hexColorToRGB';
import { COLORS } from './constants/colors';

function setDuration(duration: number | string) {
  return `${!isTestIntegration() ? duration : typeof duration === 'string' ? '0s' : '0'}`;
}

// These variables are independent of the current theme
export type ThemeGlobals = {
  /* Typography */
  /* Font Families */
  '--font-default': string;
  '--font-accent': string;
  '--font-mono': string;

  /* Headings */
  '--font-size-h1': string;
  '--font-size-h2': string;
  '--font-size-h3': string;
  '--font-size-h4': string;
  '--font-size-h5': string;
  '--font-size-h6': string;
  '--font-size-h7': string;
  '--font-size-h8': string;
  '--font-size-h9': string;

  /* Body (default) */
  '--font-size-xl': string;
  '--font-size-lg': string;
  '--font-size-md': string; // base font size
  '--font-size-sm': string;
  '--font-size-xs': string;
  '--font-size-xxs': string; // fine print

  /* Display (monospace) */
  '--font-display-size-xl': string;
  '--font-display-size-lg': string;
  '--font-display-size-md': string; // base font size
  '--font-display-size-sm': string;
  '--font-display-size-xs': string;
  '--font-display-size-xxs': string; // fine print

  /* Line Heights */
  '--font-line-height': string;

  /* Margins */
  '--margins-3xl': string;
  '--margins-2xl': string;
  '--margins-xl': string;
  '--margins-lg': string;
  '--margins-md': string;
  '--margins-sm': string;
  '--margins-xs': string;
  '--margins-xxs': string;

  /* Padding */
  '--padding-message-content': string;
  '--padding-link-preview': string;
  '--width-avatar-group-msg-list': string;

  /* Border Radius */
  '--border-radius': string;
  '--border-radius-message-box': string;

  /* Sizes */
  '--main-view-header-height': string;
  '--composition-container-height': string;
  '--search-input-height': string;

  /* Animations */
  '--default-duration': string;
  '--default-duration-seconds': string;

  /* Colors */
  '--green-color': string;
  '--blue-color': string;
  '--yellow-color': string;
  '--pink-color': string;
  '--purple-color': string;
  '--orange-color': string;
  '--red-color': string;
  '--transparent-color': string;
  '--white-color': string;
  '--black-color': string;
  '--grey-color': string;

  /* Shadows */
  '--shadow-color': string;
  '--drop-shadow': string;
  '--context-menu-shadow-color': string;
  '--scroll-button-shadow': string;

  /* Path Button */
  '--button-path-default-color': string;
  '--button-path-connecting-color': string;
  '--button-path-error-color': string;

  /* Modals */
  '--modal-background-color': string;
  '--modal-drop-shadow': string;

  /* Lightbox */
  '--lightbox-background-color': string;
  '--lightbox-caption-background-color': string;
  '--lightbox-icon-stroke-color': string;

  /* Avatar Border */
  '--avatar-border-color': string;

  /* Message Link Preview */
  /* Also used for Images */
  /* Also used for the Media Grid Items */
  /* Also used for Staged Generic Attachments */
  /* Also used for FileDropZone */
  /* Used for Quote References Not Found */
  '--message-link-preview-background-color': string;

  /* Right Panel */
  '--right-panel-width': string;
  '--right-panel-height': string;
  '--right-panel-attachment-width': string;
  '--right-panel-attachment-height': string;
  '--right-panel-duration': string;
};

// These are only set once in the global style (at root).
export const THEME_GLOBALS: ThemeGlobals = {
  '--font-default': 'Roboto',
  '--font-accent': 'Loor',
  '--font-mono': 'SpaceMono',

  '--font-size-h1': '36px', // was 30px
  '--font-size-h2': '32px', // was 14px
  '--font-size-h3': '29px', // was 20px
  '--font-size-h4': '26px', // was 16px
  '--font-size-h5': '23px',
  '--font-size-h6': '20px',
  '--font-size-h7': '18px',
  '--font-size-h8': '16px',
  '--font-size-h9': '14px',

  '--font-size-xl': '18px',
  '--font-size-lg': '16px',
  '--font-size-md': '14px',
  '--font-size-sm': '12px',
  '--font-size-xs': '11px',
  '--font-size-xxs': '9px',

  '--font-display-size-xl': '18px',
  '--font-display-size-lg': '16px',
  '--font-display-size-md': '14px',
  '--font-display-size-sm': '12px',
  '--font-display-size-xs': '11px',
  '--font-display-size-xxs': '9px',

  '--font-line-height': '1.2', // 120% but we want a unitless value so that line heights are calculated correctly for nested elements

  '--margins-3xl': '35px',
  '--margins-2xl': '30px',
  '--margins-xl': '25px',
  '--margins-lg': '20px',
  '--margins-md': '15px',
  '--margins-sm': '10px',
  '--margins-xs': '5px',
  '--margins-xxs': '2.5px',

  '--padding-message-content': '7px 13px',
  '--padding-link-preview': '-7px -13px 7px -13px', // bottom has positive value because a link preview has always a body below
  '--width-avatar-group-msg-list': '46px', // the width used by the avatar (and its margins when rendered as part of a group.)

  '--border-radius': '5px',
  '--border-radius-message-box': '16px',

  '--main-view-header-height': '68px',
  '--composition-container-height': '60px',
  '--search-input-height': '34px',

  '--default-duration': setDuration('0.25s'),
  '--default-duration-seconds': setDuration(0.25), // framer-motion requires a number

  '--green-color': COLORS.PRIMARY.GREEN,
  '--blue-color': COLORS.PRIMARY.BLUE,
  '--yellow-color': COLORS.PRIMARY.YELLOW,
  '--pink-color': COLORS.PRIMARY.PINK,
  '--purple-color': COLORS.PRIMARY.PURPLE,
  '--orange-color': COLORS.PRIMARY.ORANGE,
  '--red-color': COLORS.PRIMARY.RED,
  '--transparent-color': COLORS.TRANSPARENT,
  '--white-color': COLORS.WHITE,
  '--black-color': COLORS.BLACK,
  '--grey-color': COLORS.GREY,

  '--shadow-color': 'var(--black-color)',
  '--drop-shadow': '0 0 4px 0 var(--shadow-color)',
  '--context-menu-shadow-color': `rgba(${hexColorToRGB(COLORS.BLACK)}, 0.22)`,
  '--scroll-button-shadow': `0 0 7px 0 rgba(${hexColorToRGB(COLORS.BLACK)}, 0.5)`,

  '--button-path-default-color': COLORS.PATH.DEFAULT,
  '--button-path-connecting-color': COLORS.PATH.CONNECTING,
  '--button-path-error-color': COLORS.PATH.ERROR,

  '--modal-background-color': `rgba(${hexColorToRGB(COLORS.BLACK)}, 0.6)`,
  '--modal-drop-shadow': `0px 0px 10px rgba(${hexColorToRGB(COLORS.BLACK)}, 0.22)`,

  '--lightbox-background-color': `rgba(${hexColorToRGB(COLORS.BLACK)}, 0.8)`,
  '--lightbox-caption-background-color': 'rgba(192, 192, 192, .40)',
  '--lightbox-icon-stroke-color': 'var(--white-color)',

  '--avatar-border-color': 'var(--transparent-color)',

  '--message-link-preview-background-color': `rgba(${hexColorToRGB(COLORS.BLACK)}, 0.06)`,

  '--right-panel-width': '420px',
  '--right-panel-height': '100%',
  '--right-panel-attachment-width': 'calc(var(--right-panel-width) - 2 * var(--margins-2xl) - 7px)',
  '--right-panel-attachment-height':
    'calc(var(--right-panel-height) - 2 * var(--margins-2xl) -7px)',
  '--right-panel-duration': setDuration('0.3s'),
};

// These should only be needed for the global style (at root).
export function declareCSSVariables(variables: Record<string, string>) {
  let output = '';
  // eslint-disable-next-line no-restricted-syntax
  for (const [key, value] of Object.entries(variables)) {
    output += `${key}: ${value};\n`;
  }

  return output;
}
