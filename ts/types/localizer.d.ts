import type { ElementType } from 'react';
import type { ArgsFromToken, MergedLocalizerTokens } from '../localization/localeTools';
import { CrowdinLocale } from '../localization/constants';

/** Basic props for all calls of the Localizer component */
type LocalizerComponentBaseProps<T extends MergedLocalizerTokens> = {
  token: T;
  asTag?: ElementType;
  className?: string;
};

/** The props for the localization component */
export type LocalizerComponentProps<T extends MergedLocalizerTokens> =
  T extends MergedLocalizerTokens
    ? ArgsFromToken<T> extends never
      ? LocalizerComponentBaseProps<T>
      : ArgsFromToken<T> extends Record<string, never>
        ? LocalizerComponentBaseProps<T>
        : LocalizerComponentBaseProps<T> & { args: ArgsFromToken<T> }
    : never;

export type LocalizerComponentPropsObject = LocalizerComponentProps<MergedLocalizerTokens>;

export type I18nMethods = {
  /** @see {@link window.i18n.stripped} */
  stripped: <T extends MergedLocalizerTokens, R extends LocalizerDictionary[T]>(
    ...[token, args]: GetMessageArgs<T>
  ) => R | T;
  /** @see {@link window.i18n.inEnglish} */
  inEnglish: <T extends MergedLocalizerTokens, R extends LocalizerDictionary[T]>(
    ...[token, args]: GetMessageArgs<T>
  ) => R | T;
  /** @see {@link window.i18n.formatMessageWithArgs */
  getRawMessage: <T extends MergedLocalizerTokens>(
    crowdinLocale: CrowdinLocale,
    ...[token, args]: GetMessageArgs<T>
  ) => string;
  /** @see {@link window.i18n.formatMessageWithArgs} */
  formatMessageWithArgs: <T extends MergedLocalizerTokens>(
    rawMessage: string,
    args?: ArgsFromToken<T>
  ) => string;
};

export type SetupI18nReturnType = I18nMethods &
  (<T extends MergedLocalizerTokens>(...[token, args]: GetMessageArgs<T>) => string);
