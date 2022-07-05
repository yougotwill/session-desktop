import { BaseEmoji } from 'emoji-mart';

export type SizeClassType = 'default' | 'small' | 'medium' | 'large' | 'jumbo';

function getRegexUnicodeEmojis() {
  return /\p{Emoji_Presentation}/gu;
}

function getCountOfAllMatches(str: string) {
  const regex = getRegexUnicodeEmojis();

  const matches = str.match(regex);

  return matches?.length || 0;
}

function hasNormalCharacters(str: string) {
  const noEmoji = str.replace(getRegexUnicodeEmojis(), '').trim();
  return noEmoji.length > 0;
}

export function getEmojiSizeClass(str: string): SizeClassType {
  if (!str || !str.length) {
    return 'small';
  }
  if (hasNormalCharacters(str)) {
    return 'small';
  }

  const emojiCount = getCountOfAllMatches(str);
  if (emojiCount > 6) {
    return 'small';
  } else if (emojiCount > 4) {
    return 'medium';
  } else if (emojiCount > 2) {
    return 'large';
  } else {
    return 'jumbo';
  }
}

export let nativeEmojiData: any = {};

export function generateEmojiSearchIndexes(data: any) {
  Object.entries(data.emojis).forEach(([key, value]: [string, any]) => {
    value.search = `,${[
      [value.id, false],
      [value.name, true],
      [value.keywords, false],
      [value.emoticons, false],
    ]
      .map(([strings, split]) => {
        if (!strings) {
          return null;
        }
        return (Array.isArray(strings) ? strings : [strings])
          .map(string =>
            (split ? string.split(/[-|_|\s]+/) : [string]).map((s: string) => s.toLowerCase())
          )
          .flat();
      })
      .flat()
      .filter(a => a && a.trim())
      .join(',')})}`;

    data.emojis[key] = value;
  });
  nativeEmojiData = data;
}

// Synchronous version of Emoji Mart's SearchIndex.search()
// If you upgrade the package things will probably break
export function searchSync(query: string, args?: any): Array<any> {
  if (!nativeEmojiData || nativeEmojiData === {}) {
    window.log.error('No native emoji data found');
    return [];
  }

  if (!query || !query.trim().length) {
    return [];
  }

  const maxResults = args && args.maxResults ? args.maxResults : 90;
  const values = query
    .toLowerCase()
    .replace(/(\w)-/, '$1 ')
    .split(/[\s|,]+/)
    .filter((word: string, i: number, words: Array<string>) => {
      return word.trim() && words.indexOf(word) === i;
    });

  if (!values.length) {
    return [];
  }

  let pool: any = Object.values(nativeEmojiData.emojis);
  let results: Array<BaseEmoji> = [];
  let scores: Record<string, number> = {};

  for (const value of values) {
    if (!pool.length) {
      break;
    }

    results = [];
    scores = {};

    for (const emoji of pool) {
      if (!emoji.search) {
        continue;
      }
      const score: number = emoji.search.indexOf(`,${value}`);
      if (score === -1) {
        continue;
      }

      results.push(emoji);
      scores[emoji.id] = scores[emoji.id] ? scores[emoji.id] : 0;
      scores[emoji.id] += emoji.id === value ? 0 : score + 1;
    }
    pool = results;
  }

  if (results.length < 2) {
    return results;
  }

  results.sort((a: BaseEmoji, b: BaseEmoji) => {
    const aScore = scores[a.id];
    const bScore = scores[b.id];

    if (aScore === bScore) {
      return a.id.localeCompare(b.id);
    }

    return aScore - bScore;
  });

  if (results.length > maxResults) {
    results = results.slice(0, maxResults);
  }
  return results;
}
