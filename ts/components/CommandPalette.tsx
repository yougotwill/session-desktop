import { Command } from 'cmdk';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';
import { updateCommandPaletteModal } from '../state/ducks/modalDialog';
import { SessionFocusTrap } from './SessionFocusTrap';
import {
  SearchResultsMergedListItem,
  getHasSearchResults,
  getSearchResultsList,
} from '../state/selectors/search';
import { debounce, isString } from 'lodash';
import { Avatar, AvatarSize } from './avatar/Avatar';
import { openConversationWithMessages } from '../state/ducks/conversations';
import { clearSearch, search, updateSearchTerm } from '../state/ducks/search';
import { Dispatch } from '@reduxjs/toolkit';
import { ContactName } from './conversation/ContactName';
import { Flex } from './basic/Flex';
import { AtSymbol, UnreadCount } from './leftpane/conversation-list-item/HeaderItem';
import { SpacerSM, SpacerXS } from './basic/Text';

export const useCommandPalette = () => {
  const [visible, setVisible] = useState(false);
  const dispatch = useDispatch();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && e.metaKey) {
        e.preventDefault();
        const newVisible = !visible;
        setVisible(newVisible);
        dispatch(updateCommandPaletteModal(newVisible ? { visible: newVisible } : null));
      }

      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        setVisible(false);
        dispatch(updateCommandPaletteModal(null));
        dispatch(clearSearch());
      }

      if (e.key === 'Enter') {
        setVisible(false);
        dispatch(updateCommandPaletteModal(null));
        dispatch(clearSearch());
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [dispatch, visible]);
};

const StyledCommandPalette = styled.div`
  animation: fadein var(--default-duration);
  z-index: 150;
  min-width: 500px;
  box-sizing: border-box;
  max-height: 70vh;
  max-width: calc(min(70vw, 500px));

  background: var(--command-palette-background-color);
  color: var(--command-palette-text-color);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  box-shadow: var(--modal-drop-shadow);

  position: absolute;
  top: 25%;

  overflow: hidden;
  display: flex;
  flex-direction: column;

  [cmdk-root] {
    max-width: 900px;
    width: 100%;
    background: var(--command-palette-background-color);
    border-radius: 8px;
    overflow: hidden;
    padding: 0;
    outline: none;
  }

  [cmdk-linear-badge] {
    height: 24px;
    padding: 0 8px;
    font-size: 12px;
    color: var(--command-palette-text-color);
    background: var(--command-palette-background-color);
    border-radius: 4px;
    width: fit-content;
    display: flex;
    align-items: center;
    margin: 16px 16px 0;
  }

  [cmdk-linear-shortcuts] {
    display: flex;
    margin-left: auto;
    gap: 8px;

    kbd {
      font-size: 13px;
      color: var(--command-palette-text-color);
    }
  }

  [cmdk-input] {
    border: none;
    width: 100%;
    font-size: 18px;
    padding: 20px;
    outline: none;
    background: var(--command-palette-background-color);
    color: var(--command-palette-text-color);
    border-bottom: 1px solid var(--border-color);
    border-radius: 0;
    caret-color: var(--command-palette-text-color);
    margin: 0;

    &::placeholder {
      color: var(--command-palette-text-color);
    }
  }

  [cmdk-item] {
    content-visibility: auto;

    cursor: pointer;
    height: 48px;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    color: var(--command-palette-text-color);
    user-select: none;
    will-change: background, color;
    transition: all 150ms ease;
    transition-property: none;
    position: relative;

    &[data-selected='true'] {
      background: var(--command-palette-background-selected-color);

      svg {
        color: var(--command-palette-text-color);
      }
    }

    &[data-disabled='true'] {
      color: var(--command-palette-text-color);
      cursor: not-allowed;
    }

    &:active,
    &:hover {
      transition-property: background;
      background: var(--command-palette-background-hover-color);
    }

    & + [cmdk-item] {
      margin-top: 4px;
    }

    svg {
      color: var(--command-palette-text-color);
    }
  }

  [cmdk-list] {
    height: min(300px, var(--cmdk-list-height));
    max-height: 400px;
    overflow: auto;
    overscroll-behavior: contain;
    transition: 100ms ease;
    transition-property: height;
  }

  [cmdk-group-heading] {
    user-select: none;
    font-size: 12px;
    color: var(--command-palette-text-color);
    padding: 0 8px;
    display: flex;
    align-items: center;
  }

  [cmdk-empty] {
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 64px;
    white-space: pre-wrap;
    color: var(--command-palette-text-color);
  }
`;

export type CommandPaletteModalProps = { visible?: boolean };

type CommandResultType = SearchResultsMergedListItem;

function isContact(item: CommandResultType): item is { contactConvoId: string } {
  return (item as any).contactConvoId !== undefined;
}

const doTheSearch = (dispatch: Dispatch<any>, cleanedTerm: string) => {
  dispatch(search(cleanedTerm));
};

const debouncedSearch = debounce(doTheSearch, 50);

function CommandResult({
  children,
  value,
  onSelect,
  keywords,
}: {
  children: React.ReactNode;
  value: string;
  onSelect: () => void;
  keywords?: string[];
}) {
  return (
    <Command.Item value={value} keywords={keywords} onSelect={onSelect}>
      {children}
    </Command.Item>
  );
}

export function CommandPalette(props: CommandPaletteModalProps) {
  const { visible } = props;

  const [commandValue, setCommandValue] = useState('');

  // TODO need to separatte search results UI from left panel search results
  const hasSearchResults = useSelector(getHasSearchResults);

  const searchResultList: Array<CommandResultType> = useSelector(getSearchResultsList);

  const dispatch = useDispatch();

  if (!visible) {
    return null;
  }

  return (
    <SessionFocusTrap>
      <div className={'loki-dialog modal'} role="dialog">
        <StyledCommandPalette id={'command-palette'} className="session-modal">
          <Command label="Command Menu">
            <Command.Input
              autoFocus={true}
              value={commandValue}
              onValueChange={(search: string) => {
                window.log.debug(`WIP: [CMD] command input: ${search}`);
                setCommandValue(search);
                if (!search) {
                  window.log.debug(`WIP: [CMD] clearing command input`);
                  dispatch(clearSearch());
                  return;
                }

                // this updates our current state and text field.
                dispatch(updateSearchTerm(search));

                debouncedSearch(dispatch, search);
              }}
              placeholder={window.i18n('searchFor...')}
            />
            <Command.List>
              {hasSearchResults ? (
                searchResultList.map((result: CommandResultType) => {
                  // window.log.debug(`WIP: [CMD] result: ${JSON.stringify(result)}`);
                  if (isString(result)) {
                    // TODO this is a heading we need to handle it somehow
                    // return <Command.Item key={`command-${uuidv4()}`}>{result}</Command.Item>;
                    return null;
                  }

                  if (isContact(result)) {
                    return (
                      <CommandResult
                        value={result.contactConvoId}
                        onSelect={() => {
                          void openConversationWithMessages({
                            conversationKey: result.contactConvoId,
                            messageId: null,
                          });
                          dispatch(updateCommandPaletteModal(null));
                          dispatch(clearSearch());
                        }}
                      >
                        <Flex
                          container={true}
                          justifyContent="flex-start"
                          alignItems="center"
                          width="100%"
                          height="100%"
                        >
                          <Avatar size={AvatarSize.S} pubkey={result.contactConvoId} />
                          <SpacerSM />
                          <ContactName
                            pubkey={result.contactConvoId}
                            name={result.displayName}
                            profileName={result.displayName}
                            module="module-conversation__user"
                            boldProfileName={true}
                            shouldShowPubkey={false}
                          />
                          <SpacerXS />
                          <UnreadCount convoId={result.contactConvoId} />
                          <AtSymbol convoId={result.contactConvoId} />
                        </Flex>
                      </CommandResult>
                    );
                  }

                  // TODO this is a message result
                  // return (
                  //   <CommandResult
                  //     value={result.id}
                  //     onSelect={() => {
                  //       void openConversationToSpecificMessage({
                  //         conversationKey: result.conversationId,
                  //         messageIdToNavigateTo: result.id,
                  //         shouldHighlightMessage: true,
                  //       });
                  //       dispatch(updateCommandPaletteModal(null));
                  //     }}
                  //   >
                  //     <MessageBodyHighlight text={result.snippet || ''} isGroup={false} />
                  //   </CommandResult>
                  // );

                  // return (
                  //   <Command.Item>
                  //     {JSON.stringify(result)}
                  //   </Command.Item>
                  // );
                  return null;
                })
              ) : commandValue ? (
                <Command.Empty>{window.i18n('noSearchResults', [commandValue])}</Command.Empty>
              ) : null}
            </Command.List>
          </Command>
        </StyledCommandPalette>
      </div>
    </SessionFocusTrap>
  );
}
