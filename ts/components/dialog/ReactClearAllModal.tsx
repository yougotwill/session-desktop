import React, { ReactElement } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';
import { updateReactClearAllModal } from '../../state/ducks/modalDialog';
import { StateType } from '../../state/reducer';
import { getMessageReactsProps } from '../../state/selectors/conversations';
import { getTheme } from '../../state/selectors/theme';
import { Flex } from '../basic/Flex';
import { SessionButton, SessionButtonColor, SessionButtonType } from '../basic/SessionButton';
import { SessionWrapperModal } from '../SessionWrapperModal';

type Props = {
  reaction: string;
  messageId: string;
};

const StyledReactClearAllContainer = styled(Flex)<{ darkMode: boolean }>`
  margin: var(--margins-lg);

  p {
    font-size: 18px;
    font-weight: bold;
    padding-bottom: var(--margins-lg);
    margin: var(--margins-md) auto;
    border-bottom: 1.5px solid ${props => (props.darkMode ? '#2D2D2D' : '#EEEEEE')};

    span {
      margin-left: 4px;
    }
  }

  .session-button {
    font-size: 16px;
    height: 36px;
    padding-top: 3px;
  }
`;

// tslint:disable-next-line: max-func-body-length
export const ReactClearAllModal = (props: Props): ReactElement => {
  const { reaction, messageId } = props;
  const msgProps = useSelector((state: StateType) => getMessageReactsProps(state, messageId));

  if (!msgProps) {
    return <></>;
  }

  const dispatch = useDispatch();
  const darkMode = useSelector(getTheme) === 'dark';
  const confirmButtonColor = darkMode ? SessionButtonColor.Green : SessionButtonColor.Secondary;

  const handleClose = () => {
    dispatch(updateReactClearAllModal(null));
  };

  const handleClearAll = () => {
    // TODO Handle Batch Clearing of Reactions
  };

  return (
    <SessionWrapperModal
      additionalClassName={'reaction-list-modal'}
      showHeader={false}
      onClose={handleClose}
    >
      <StyledReactClearAllContainer container={true} flexDirection={'column'} darkMode={darkMode}>
        <p>
          Are you sure you want to clear all <span>{reaction}</span>?
        </p>
        <div className="session-modal__button-group">
          <SessionButton
            text={'Clear'}
            buttonColor={confirmButtonColor}
            buttonType={SessionButtonType.BrandOutline}
            onClick={handleClearAll}
          />
          <SessionButton
            text={'Cancel'}
            buttonColor={SessionButtonColor.Danger}
            buttonType={SessionButtonType.BrandOutline}
            onClick={handleClose}
          />
        </div>
      </StyledReactClearAllContainer>
    </SessionWrapperModal>
  );
};
