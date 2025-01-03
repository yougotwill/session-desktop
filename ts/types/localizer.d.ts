import type {
  ArgsFromToken,
  MergedLocalizerTokens,
  GetMessageArgs,
  LocalizerComponentProps,
} from '../localization/localeTools';
import { CrowdinLocale } from '../localization/constants';

export type I18nMethods = {
  /** @see {@link window.i18n.stripped} */
  stripped: <T extends MergedLocalizerTokens>(...[token, args]: GetMessageArgs<T>) => string | T;
  strippedWithObj: <T extends MergedLocalizerTokens>(
    opts: LocalizerComponentProps<T>
  ) => string | T;
  /** @see {@link window.i18n.inEnglish} */
  inEnglish: <T extends MergedLocalizerTokens>(...[token, args]: GetMessageArgs<T>) => string | T;
  /** @see {@link window.i18n.formatMessageWithArgs */
  getRawMessage: <T extends MergedLocalizerTokens>(
    crowdinLocale: CrowdinLocale,
    ...[token, args]: GetMessageArgs<T>
  ) => string | T;
  /** @see {@link window.i18n.formatMessageWithArgs} */
  formatMessageWithArgs: <T extends MergedLocalizerTokens>(
    rawMessage: string,
    args?: ArgsFromToken<T>
  ) => string | T;
};

export type SetupI18nReturnType = I18nMethods &
  (<T extends MergedLocalizerTokens>(...[token, args]: GetMessageArgs<T>) => string);
