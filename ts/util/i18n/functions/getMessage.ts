/** NOTE: Because of docstring limitations changes MUST be manually synced between {@link setupI18n.getMessage } and {@link window.i18n } */

import type { SetupI18nReturnType } from '../../../types/localizer';
import { i18nLog } from '../shared';
import { localizeFromOld } from '../localizedString';
import {
  ArgsFromToken,
  formatMessageWithArgs,
  GetMessageArgs,
  getRawMessage,
  inEnglish,
  MergedLocalizerTokens,
  stripped,
} from '../../../localization/localeTools';

/**
 * Retrieves a localized message string, substituting variables where necessary.
 *
 * @param token - The token identifying the message to retrieve.
 * @param args - An optional record of substitution variables and their replacement values. This is required if the string has dynamic variables.
 *
 * @returns The localized message string with substitutions applied.
 */
function getMessageDefault<T extends MergedLocalizerTokens>(...props: GetMessageArgs<T>): string {
  const token = props[0];

  try {
    return localizeFromOld(props[0], props[1] as ArgsFromToken<T>).toString();
  } catch (error) {
    i18nLog(error.message);
    return token;
  }
}

getMessageDefault.inEnglish = inEnglish;
getMessageDefault.stripped = stripped;
getMessageDefault.getRawMessage = getRawMessage;
getMessageDefault.formatMessageWithArgs = formatMessageWithArgs;

export const getMessage: SetupI18nReturnType = getMessageDefault as SetupI18nReturnType;
