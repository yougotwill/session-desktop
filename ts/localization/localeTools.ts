import { isEmpty } from 'lodash';
import { CrowdinLocale } from './constants';
import { getMessage } from '../util/i18n/functions/getMessage';
import { pluralsDictionary, simpleDictionary } from './locales';

export type SimpleDictionary = typeof simpleDictionary;
export type PluralDictionary = typeof pluralsDictionary;

export type SimpleLocalizerTokens = keyof SimpleDictionary;
export type PluralLocalizerTokens = keyof PluralDictionary;

export type MergedLocalizerTokens = SimpleLocalizerTokens | PluralLocalizerTokens;

type Logger = (message: string) => void;
let logger: Logger | undefined;

export function setLogger(cb: Logger) {
  if (logger) {
    // eslint-disable-next-line no-console
    console.log('logger already initialized');
  }
  logger = cb;
}

function log(message: Parameters<Logger>[0]) {
  logger?.(message);
}

export function isSimpleToken(token: string): token is SimpleLocalizerTokens {
  return token in simpleDictionary;
}

export function isPluralToken(token: string): token is PluralLocalizerTokens {
  return token in pluralsDictionary;
}

type TokenWithArgs<D> = {
  [K in keyof D]: D[K] extends { args: undefined } | { args: never } ? never : K;
}[keyof D];

type MergedTokenWithArgs = TokenWithArgs<SimpleDictionary> | TokenWithArgs<PluralDictionary>;

export function isTokenWithArgs(token: string): token is MergedTokenWithArgs {
  return (
    (isSimpleToken(token) && !isEmpty(simpleDictionary[token]?.args)) ||
    (isPluralToken(token) && !isEmpty(pluralsDictionary[token]?.args))
  );
}

type DynamicArgStr = 'string' | 'number';

export type LocalizerDictionary = SimpleDictionary;

type ArgsTypeStrToTypes<T extends DynamicArgStr> = T extends 'string'
  ? string
  : T extends 'number'
    ? number
    : never;

// those are still a string of the type "string" | "number" and not the typescript types themselves
type ArgsFromTokenStr<T extends SimpleLocalizerTokens | PluralLocalizerTokens> =
  T extends SimpleLocalizerTokens
    ? SimpleDictionary[T] extends { args: infer A }
      ? A extends Record<string, any>
        ? A
        : never
      : never
    : T extends PluralLocalizerTokens
      ? PluralDictionary[T] extends { args: infer A }
        ? A extends Record<string, any>
          ? A
          : never
        : never
      : never;

export type ArgsFromToken<T extends MergedLocalizerTokens> = MappedToTsTypes<ArgsFromTokenStr<T>>;

/** The arguments for retrieving a localized message */
export type GetMessageArgs<T extends MergedLocalizerTokens> = T extends MergedLocalizerTokens
  ? T extends MergedTokenWithArgs
    ? [T, ArgsFromToken<T>]
    : [T]
  : never;

type MappedToTsTypes<T extends Record<string, DynamicArgStr>> = {
  [K in keyof T]: ArgsTypeStrToTypes<T[K]>;
};

/** NOTE: Because of docstring limitations changes MUST be manually synced between {@link setupI18n.inEnglish } and {@link window.i18n.inEnglish } */
/**
 * Retrieves a message string in the {@link en} locale, substituting variables where necessary.
 *
 * NOTE: This does not work for plural strings. This function should only be used for debug and
 * non-user-facing strings. Plural string support can be added splitting out the logic for
 * {@link setupI18n.formatMessageWithArgs} and creating a new getMessageFromDictionary, which
 * specifies takes a dictionary as an argument. This is left as an exercise for the reader.
 * @deprecated this will eventually be replaced by LocalizedStringBuilder
 *
 * @param token - The token identifying the message to retrieve.
 * @param args - An optional record of substitution variables and their replacement values. This is equired if the string has dynamic variables.
 */
export function inEnglish<T extends MergedLocalizerTokens>([token, args]: GetMessageArgs<T>) {
  if (!isSimpleToken(token)) {
    throw new Error('inEnglish only supports simple strings for now');
  }
  const rawMessage = simpleDictionary[token].en;

  if (!rawMessage) {
    log(`Attempted to get forced en string for nonexistent key: '${token}' in fallback dictionary`);
    return token;
  }
  return formatMessageWithArgs(rawMessage, args);
}

/**
 * Retrieves a localized message string, substituting variables where necessary. Then strips the message of any HTML and custom tags.
 *
 * @deprecated This will eventually be replaced altogether by LocalizedStringBuilder
 *
 * @param token - The token identifying the message to retrieve.
 * @param args - An optional record of substitution variables and their replacement values. This is required if the string has dynamic variables.
 *
 * @returns The localized message string with substitutions applied. Any HTML and custom tags are removed.
 */

export function stripped<T extends MergedLocalizerTokens>(
  ...[token, args]: GetMessageArgs<T>
): string {
  const sanitizedArgs = args ? sanitizeArgs(args, '\u200B') : undefined;

  const i18nString = getMessage<T>(...([token, sanitizedArgs] as GetMessageArgs<T>));

  const strippedString = i18nString.replaceAll(/<[^>]*>/g, '');

  return deSanitizeHtmlTags(strippedString, '\u200B');
}

/**
 * Sanitizes the args to be used in the i18n function
 * @param args The args to sanitize
 * @param identifier The identifier to use for the args. Use this if you want to de-sanitize the args later.
 * @returns The sanitized args
 */
export function sanitizeArgs(
  args: Record<string, string | number>,
  identifier?: string
): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [
      key,
      typeof value === 'string' ? sanitizeHtmlTags(value, identifier) : value,
    ])
  );
}

/**
 * Formats a localized message string with arguments and returns the formatted string.
 * @param rawMessage - The raw message string to format. After using @see {@link getRawMessage} to get the raw string.
 * @param args - An optional record of substitution variables and their replacement values. This
 * is required if the string has dynamic variables. This can be optional as a strings args may be defined in @see {@link LOCALE_DEFAULTS}
 *
 * @returns The formatted message string.
 *
 * @deprecated
 *
 */
export function formatMessageWithArgs<T extends MergedLocalizerTokens>(
  rawMessage: string,
  args?: ArgsFromToken<T>
): string {
  /** Find and replace the dynamic variables in a localized string and substitute the variables with the provided values */
  return rawMessage.replace(/\{(\w+)\}/g, (match: any, arg: string) => {
    const matchedArg = args ? args[arg as keyof typeof args] : undefined;

    return matchedArg?.toString() ?? match;
  });
}

/**
 * Retrieves a localized message string, without substituting any variables. This resolves any plural forms using the given args
 * @param token - The token identifying the message to retrieve.
 * @param args - An optional record of substitution variables and their replacement values. This is required if the string has dynamic variables.
 *
 * @returns The localized message string with substitutions applied.
 *
 * NOTE: This is intended to be used to get the raw string then format it with {@link formatMessageWithArgs}
 */
export function getRawMessage<T extends MergedLocalizerTokens>(
  crowdinLocale: CrowdinLocale,
  ...[token, args]: GetMessageArgs<T>
): string {
  try {
    if (
      typeof window !== 'undefined' &&
      window?.sessionFeatureFlags?.replaceLocalizedStringsWithKeys
    ) {
      return token as T;
    }

    if (isSimpleToken(token)) {
      return simpleDictionary[token][crowdinLocale];
    }
    if (!isPluralToken(token)) {
      throw new Error('invalid token, neither simple nor plural');
    }
    const pluralsObjects = pluralsDictionary[token];
    const localePluralsObject = pluralsObjects[crowdinLocale];

    if (!localePluralsObject || isEmpty(localePluralsObject)) {
      log(`Attempted to get translation for nonexistent key: '${token}'`);
      return token;
    }

    const num = args && 'count' in args ? args.count : 0;

    const cardinalRule = new Intl.PluralRules(crowdinLocale).select(num);

    const pluralString = getStringForRule({
      dictionary: pluralsDictionary,
      crowdinLocale,
      cardinalRule,
      token,
    });

    if (!pluralString) {
      log(`Plural string not found for cardinal '${cardinalRule}': '${pluralString}'`);
      return token as T;
    }

    return pluralString.replaceAll('#', `${num}`);
  } catch (error) {
    log(error.message);
    return token as T;
  }
}

export function getStringForRule({
  dictionary,
  token,
  crowdinLocale,
  cardinalRule,
}: {
  dictionary: PluralDictionary;
  token: PluralLocalizerTokens;
  crowdinLocale: CrowdinLocale;
  cardinalRule: Intl.LDMLPluralRule;
}) {
  const dictForLocale = dictionary[token][crowdinLocale];
  return cardinalRule in dictForLocale ? ((dictForLocale as any)[cardinalRule] as string) : token;
}

/**
 * Replaces all html tag identifiers with their escaped equivalents
 * @param str The string to sanitize
 * @param identifier The identifier to use for the args. Use this if you want to de-sanitize the args later.
 * @returns The sanitized string
 */
export function sanitizeHtmlTags(str: string, identifier: string = ''): string {
  if (identifier && /[a-zA-Z0-9></\\\-\s]+/g.test(identifier)) {
    throw new Error('Identifier is not valid');
  }

  return str
    .replace(/&/g, `${identifier}&amp;${identifier}`)
    .replace(/</g, `${identifier}&lt;${identifier}`)
    .replace(/>/g, `${identifier}&gt;${identifier}`);
}

/**
 * Replaces all sanitized html tags with their real equivalents
 * @param str The string to de-sanitize
 * @param identifier The identifier used when the args were sanitized
 * @returns The de-sanitized string
 */
export function deSanitizeHtmlTags(str: string, identifier: string): string {
  if (!identifier || /[a-zA-Z0-9></\\\-\s]+/g.test(identifier)) {
    throw new Error('Identifier is not valid');
  }

  return str
    .replace(new RegExp(`${identifier}&amp;${identifier}`, 'g'), '&')
    .replace(new RegExp(`${identifier}&lt;${identifier}`, 'g'), '<')
    .replace(new RegExp(`${identifier}&gt;${identifier}`, 'g'), '>');
}
