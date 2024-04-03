import classNames from 'classnames';
import FocusTrap from 'focus-trap-react';
import React, { useRef } from 'react';
import useKey from 'react-use/lib/useKey';

import styled from 'styled-components';
import { SessionIconButton } from './icon';

import { Flex } from './basic/Flex';
import { SessionButton, SessionButtonColor, SessionButtonType } from './basic/SessionButton';

const StyledWrapperHeader = styled(Flex)`
  font-family: var(--font-default);
  font-size: var(--font-size-lg);
  font-weight: 500;
  text-align: center;
  line-height: 18px;
  padding: var(--margins-lg);

  .session-modal__header__close,
  .session-modal__header__icons {
    width: 60px;
  }
`;

export type SessionWrapperModalType = {
  title?: string;
  showHeader?: boolean;
  onConfirm?: () => void;
  onClose?: () => void;
  showClose?: boolean;
  confirmText?: string;
  cancelText?: string;
  showExitIcon?: boolean;
  headerIconButtons?: Array<any>;
  children: any;
  headerReverse?: boolean;
  additionalClassName?: string;
};

export const SessionWrapperModal = (props: SessionWrapperModalType) => {
  const {
    title,
    onConfirm,
    onClose,
    showHeader = true,
    showClose = false,
    confirmText,
    cancelText,
    showExitIcon,
    headerIconButtons,
    headerReverse,
    additionalClassName,
  } = props;

  useKey(
    'Esc',
    () => {
      props.onClose?.();
    },
    undefined,
    [props.onClose]
  );

  useKey(
    'Escape',
    () => {
      props.onClose?.();
    },
    undefined,
    [props.onClose]
  );

  const modalRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: any) => {
    if (!modalRef.current?.contains(e.target)) {
      props.onClose?.();
    }
  };

  const fallbackFocusId = 'session-wrapper-modal';

  return (
    <FocusTrap focusTrapOptions={{ fallbackFocus: `#${fallbackFocusId}`, allowOutsideClick: true }}>
      <div
        className={classNames('loki-dialog modal', additionalClassName || null)}
        onClick={handleClick}
        role="dialog"
        id={fallbackFocusId}
      >
        <div className="session-confirm-wrapper">
          <div ref={modalRef} className="session-modal">
            {showHeader ? (
              <StyledWrapperHeader
                container={true}
                flexDirection={headerReverse ? 'row-reverse' : 'row'}
                justifyContent="space-between"
                alignItems="center"
                className={classNames('session-modal__header')}
              >
                <Flex
                  container={true}
                  justifyContent={headerReverse ? 'flex-end' : 'flex-start'}
                  alignItems="center"
                  className="session-modal__header__close"
                >
                  {showExitIcon ? (
                    <SessionIconButton
                      iconType="exit"
                      iconSize="small"
                      onClick={props.onClose}
                      dataTestId="modal-close-button"
                    />
                  ) : null}
                </Flex>
                <div className="session-modal__header__title">{title}</div>
                <Flex
                  container={true}
                  justifyContent={headerReverse ? 'flex-start' : 'flex-end'}
                  alignItems="center"
                  className="session-modal__header__icons"
                >
                  {headerIconButtons
                    ? headerIconButtons.map((iconItem: any) => {
                        return (
                          <SessionIconButton
                            key={iconItem.iconType}
                            iconType={iconItem.iconType}
                            iconSize={'large'}
                            iconRotation={iconItem.iconRotation}
                            onClick={iconItem.onClick}
                          />
                        );
                      })
                    : null}
                </Flex>
              </StyledWrapperHeader>
            ) : null}

            <div className="session-modal__body">
              <div className="session-modal__centered">
                {props.children}

                <div className="session-modal__button-group">
                  {onConfirm ? (
                    <SessionButton buttonType={SessionButtonType.Simple} onClick={props.onConfirm}>
                      {confirmText || window.i18n('ok')}
                    </SessionButton>
                  ) : null}
                  {onClose && showClose ? (
                    <SessionButton
                      buttonType={SessionButtonType.Simple}
                      buttonColor={SessionButtonColor.Danger}
                      onClick={props.onClose}
                    >
                      {cancelText || window.i18n('close')}
                    </SessionButton>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
};
