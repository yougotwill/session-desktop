import type { ElementType } from 'react';
import type { Dictionary } from '../localization/locales';

/** The dictionary of localized strings */
export type LocalizerDictionary = Dictionary;

/** A localization dictionary key */
export type LocalizerToken = keyof Dictionary;

/** A dynamic argument that can be used in a localized string */
type DynamicArg = string | number;
type DynamicArgStr = 'string' | 'number';

/** A record of dynamic arguments for a specific key in the localization dictionary */
export type ArgsRecord<T extends LocalizerToken> = Record<DynamicArgs<Dictionary[T]>, DynamicArg>;

// TODO: create a proper type for this
export type DictionaryWithoutPluralStrings = Dictionary;
export type PluralKey = 'count';
export type PluralString = `{${string}, plural, one [${string}] other [${string}]}`;

type ArgsTypeStrToTypes<T extends DynamicArgStr> = T extends 'string'
  ? string
  : T extends 'number'
    ? number
    : never;

// those are still a string of the type "string" | "number" and not the typescript types themselves
type ArgsFromTokenStr<T extends LocalizerToken> = Dictionary[T]['args'] extends undefined
  ? never
  : Dictionary[T]['args'];

type ArgsFromToken<T extends LocalizerToken> = MappedToTsTypes<ArgsFromTokenStr<T>>;
type IsTokenWithCountArgs<T extends LocalizerToken> = 'count' extends keyof ArgsFromToken<T>
  ? true
  : false;

/** The arguments for retrieving a localized message */
export type GetMessageArgs<T extends LocalizerToken> = T extends LocalizerToken
  ? ArgsFromToken<T> extends never
    ? [T]
    : [T, ArgsFromToken<T>]
  : never;

type MappedToTsTypes<T extends Record<string, DynamicArgStr>> = {
  [K in keyof T]: ArgsTypeStrToTypes<T[K]>;
};

/** Basic props for all calls of the Localizer component */
type LocalizerComponentBaseProps<T extends LocalizerToken> = {
  token: T;
  asTag?: ElementType;
  className?: string;
};

/** The props for the localization component */
export type LocalizerComponentProps<T extends LocalizerToken> = T extends LocalizerToken
  ? ArgsFromToken<T> extends never
    ? LocalizerComponentBaseProps<T>
    : ArgsFromToken<T> extends Record<string, never>
      ? LocalizerComponentBaseProps<T>
      : LocalizerComponentBaseProps<T> & { args: ArgsFromToken<T> }
  : never;

export type LocalizerComponentPropsObject = LocalizerComponentProps<LocalizerToken>;

export type I18nMethods = {
  /** @see {@link window.i18n.stripped} */
  stripped: <T extends LocalizerToken, R extends LocalizerDictionary[T]>(
    ...[token, args]: GetMessageArgs<T>
  ) => R | T;
  /** @see {@link window.i18n.inEnglish} */
  inEnglish: <T extends LocalizerToken, R extends LocalizerDictionary[T]>(
    ...[token, args]: GetMessageArgs<T>
  ) => R | T;
  /** @see {@link window.i18n.formatMessageWithArgs */
  getRawMessage: <T extends LocalizerToken, R extends DictionaryWithoutPluralStrings[T]>(
    ...[token, args]: GetMessageArgs<T>
  ) => R | T;
  /** @see {@link window.i18n.formatMessageWithArgs} */
  formatMessageWithArgs: <T extends LocalizerToken, R extends DictionaryWithoutPluralStrings[T]>(
    rawMessage: R,
    args?: ArgsRecord<T>
  ) => R;
};

export type SetupI18nReturnType = I18nMethods &
  (<T extends LocalizerToken, R extends LocalizerDictionary[T]>(
    ...[token, args]: GetMessageArgs<T>
  ) => R);
