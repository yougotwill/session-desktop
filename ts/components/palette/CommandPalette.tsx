import { Command } from 'cmdk';
import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import styled from 'styled-components';
import { v4 as uuidv4 } from 'uuid';
import { updateCommandPaletteModal } from '../../state/ducks/modalDialog';
import { SessionFocusTrap } from '../SessionFocusTrap';

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
      }

      if (e.key === 'Enter') {
        setVisible(false);
        dispatch(updateCommandPaletteModal(null));
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
      width: 16px;
      height: 16px;
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

export function CommandPalette(props: CommandPaletteModalProps) {
  const { visible } = props;

  const [commandValue, setCommandValue] = useState('');
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
              onValueChange={setCommandValue}
              placeholder="Search..."
            />
            <Command.List>
              <Command.Empty>No results found.</Command.Empty>

              {window.commands.map((command: any) => (
                <Command.Item
                  key={`command-${uuidv4()}`}
                  onSelect={() => {
                    if (command.click) {
                      void command.click();
                      dispatch(updateCommandPaletteModal(null));
                    }
                  }}
                >
                  {command.label}
                  {command.role && ` - ${command.role}`}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </StyledCommandPalette>
      </div>
    </SessionFocusTrap>
  );
}
