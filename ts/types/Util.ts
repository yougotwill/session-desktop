export type RenderTextCallbackType = (options: {
  text: string;
  key: number;
  isGroup: boolean;
}) => JSX.Element;

export type LocalizerType = typeof window.i18n;

/**
 * Recursively get all keys of an object, including nested objects treating them as strings
 */
export type RecursiveKeys<T> = T extends object
  ? {
      [K in Extract<keyof T, string>]:
        | K
        | (T[K] extends object ? `${K}.${RecursiveKeys<T[K]>}` : never);
    }[Extract<keyof T, string>]
  : never;
