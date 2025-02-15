import { SearchIndex } from 'emoji-mart';
import styled from 'styled-components';
import type { SuggestionDataItem } from 'react-mentions';
import { searchSync } from '../../../util/emoji';
import type { SessionSuggestionDataItem } from './types';

const EmojiQuickResult = styled.span`
  display: flex;
  align-items: center;
  min-width: 250px;
  width: 100%;
  padding-inline-end: 20px;
  padding-inline-start: 10px;
`;
const EmojiQuickResultIcon = styled.span`
  padding-inline-end: 20px;
  padding-inline-start: 10px;
  font-size: 1.4rem;
`;
const EmojiQuickResultText = styled.span``;

export const renderEmojiQuickResultRow = (suggestion: SuggestionDataItem) => {
  return (
    <EmojiQuickResult>
      <EmojiQuickResultIcon>{suggestion.id}</EmojiQuickResultIcon>
      <EmojiQuickResultText>{suggestion.display}</EmojiQuickResultText>
    </EmojiQuickResult>
  );
};

export const searchEmojiForQuery = (query: string): Array<SessionSuggestionDataItem> => {
  if (query.length === 0 || !SearchIndex) {
    return [];
  }

  const results1 = searchSync(`:${query}`);
  const results2 = searchSync(query);
  const results = [...new Set(results1.concat(results2))];
  if (!results || !results.length) {
    return [];
  }

  const cleanResults = results
    .map(emoji => {
      return {
        id: emoji.skins[0].native,
        display: `:${emoji.id}:`,
      };
    })
    .slice(0, 8);
  return cleanResults;
};
