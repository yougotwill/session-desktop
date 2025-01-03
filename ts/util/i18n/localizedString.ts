import { pluralsDictionary, simpleDictionary } from '../../localization/locales';
import {
  ArgsFromToken,
  deSanitizeHtmlTags,
  getStringForRule,
  isPluralToken,
  isSimpleToken,
  MergedLocalizerTokens,
  sanitizeArgs,
} from '../../localization/localeTools';
import { i18nLog, getCrowdinLocale } from './shared';
import { CrowdinLocale, LOCALE_DEFAULTS } from '../../localization/constants';

type ArgString = `${string}{${string}}${string}`;

/**
 * Checks if a string contains a dynamic variable.
 * @param localizedString - The string to check.
 * @returns `true` if the string contains a dynamic variable, otherwise `false`.
 */
const isStringWithArgs = (localizedString: string): localizedString is ArgString =>
  localizedString.includes('{');

const isReplaceLocalizedStringsWithKeysEnabled = () =>
  !!(typeof window !== 'undefined' && window?.sessionFeatureFlags?.replaceLocalizedStringsWithKeys);

export class LocalizedStringBuilder<T extends MergedLocalizerTokens> extends String {
  private readonly token: T;
  private args?: ArgsFromToken<T>;
  private isStripped = false;
  private isEnglishForced = false;

  private readonly renderStringAsToken = isReplaceLocalizedStringsWithKeysEnabled();

  constructor(token: T) {
    super(token);
    this.token = token;
  }

  public toString(): string {
    try {
      if (this.renderStringAsToken) {
        return this.token;
      }

      const rawString = this.getRawString();
      const str = isStringWithArgs(rawString) ? this.formatStringWithArgs(rawString) : rawString;

      if (this.isStripped) {
        return this.postProcessStrippedString(str);
      }

      return str;
    } catch (error) {
      i18nLog(error);
      return this.token;
    }
  }

  withArgs(args: ArgsFromToken<T>): Omit<this, 'withArgs'> {
    this.args = args;
    return this;
  }

  forceEnglish(): Omit<this, 'forceEnglish'> {
    this.isEnglishForced = true;
    return this;
  }

  strip(): Omit<this, 'strip'> {
    const sanitizedArgs = this.args ? sanitizeArgs(this.args, '\u200B') : undefined;
    if (sanitizedArgs) {
      this.args = sanitizedArgs as ArgsFromToken<T>;
    }
    this.isStripped = true;

    return this;
  }

  private postProcessStrippedString(str: string): string {
    const strippedString = str.replaceAll(/<[^>]*>/g, '');
    return deSanitizeHtmlTags(strippedString, '\u200B');
  }

  private localeToTarget(): CrowdinLocale {
    return this.isEnglishForced ? 'en' : getCrowdinLocale();
  }

  private getRawString(): string {
    try {
      if (this.renderStringAsToken) {
        return this.token;
      }

      if (isSimpleToken(this.token)) {
        return simpleDictionary[this.token][this.localeToTarget()];
      }

      if (!isPluralToken(this.token)) {
        throw new Error('invalid token provided');
      }

      return this.resolvePluralString();
    } catch (error) {
      i18nLog(error.message);
      return this.token;
    }
  }

  private resolvePluralString(): string {
    const pluralKey = 'count' as const;

    let num: number | string | undefined = this.args?.[pluralKey as keyof ArgsFromToken<T>];

    if (num === undefined) {
      i18nLog(
        `Attempted to get plural count for missing argument '${pluralKey} for token '${this.token}'`
      );
      num = 0;
    }

    if (typeof num !== 'number') {
      i18nLog(
        `Attempted to get plural count for argument '${pluralKey}' which is not a number for token '${this.token}'`
      );
      num = parseInt(num, 10);
      if (Number.isNaN(num)) {
        i18nLog(
          `Attempted to get parsed plural count for argument '${pluralKey}' which is not a number for token '${this.token}'`
        );
        num = 0;
      }
    }

    const localeToTarget = this.localeToTarget();
    const cardinalRule = new Intl.PluralRules(localeToTarget).select(num);

    if (!isPluralToken(this.token)) {
      throw new Error('resolvePluralString can only be called with a plural string');
    }

    let pluralString = getStringForRule({
      cardinalRule,
      crowdinLocale: localeToTarget,
      dictionary: pluralsDictionary,
      token: this.token,
    });

    if (!pluralString) {
      i18nLog(
        `Plural string not found for cardinal '${cardinalRule}': '${this.token}' Falling back to 'other' cardinal`
      );

      pluralString = getStringForRule({
        cardinalRule: 'other',
        crowdinLocale: localeToTarget,
        dictionary: pluralsDictionary,
        token: this.token,
      });

      if (!pluralString) {
        i18nLog(`Plural string not found for fallback cardinal 'other': '${this.token}'`);

        return this.token;
      }
    }

    return pluralString.replaceAll('#', `${num}`);
  }

  private formatStringWithArgs(str: ArgString): string {
    /** Find and replace the dynamic variables in a localized string and substitute the variables with the provided values */
    return str.replace(/\{(\w+)\}/g, (match, arg: string) => {
      const matchedArg = this.args
        ? this.args[arg as keyof ArgsFromToken<T>]?.toString()
        : undefined;

      return matchedArg ?? LOCALE_DEFAULTS[arg as keyof typeof LOCALE_DEFAULTS] ?? match;
    });
  }
}

export function localize<T extends MergedLocalizerTokens>(token: T) {
  return new LocalizedStringBuilder<T>(token);
}

export function localizeFromOld<T extends MergedLocalizerTokens>(token: T, args: ArgsFromToken<T>) {
  return new LocalizedStringBuilder<T>(token).withArgs(args);
}
