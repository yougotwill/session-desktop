import { RenderTextCallbackType } from '../../types/Util';
import classNames from 'classnames';
import { PubKey } from '../../session/types';
import { getConversationController } from '../../session/conversations';
import React from 'react';
import { isUsAnySogsFromCache } from '../../session/apis/open_group_api/sogsv3/knownBlindedkeys';

interface MentionProps {
  key: string;
  text: string;
}

const Mention = (props: MentionProps) => {
  const blindedOrNotPubkey = props.text.slice(1);
  const foundConvo = getConversationController().get(blindedOrNotPubkey);

  // this call takes care of finding if we have a blindedId of ourself on any sogs we have joined.
  if (isUsAnySogsFromCache(blindedOrNotPubkey)) {
    return (
      <span className={classNames('mention-profile-name', 'mention-profile-name-us')}>
        @{window.i18n('you')}
      </span>
    );
  }

  return (
    <span className="mention-profile-name">
      @{foundConvo?.getContactProfileNameOrShortenedPubKey() || PubKey.shorten(props.text)}
    </span>
  );
};

type Props = {
  text: string;
  renderOther?: RenderTextCallbackType;
  isGroup: boolean;
};

const defaultRenderOther = ({ text }: { text: string }) => <>{text}</>;

export const AddMentions = (props: Props): JSX.Element => {
  const { text, renderOther, isGroup } = props;
  const results: Array<JSX.Element> = [];
  const FIND_MENTIONS = new RegExp(`@${PubKey.regexForPubkeys}`, 'g');

  const renderWith = renderOther || defaultRenderOther;

  let match = FIND_MENTIONS.exec(text);
  let last = 0;
  let count = 1000;

  if (!match) {
    return renderWith({ text, key: 0, isGroup });
  }

  while (match) {
    count++;
    const key = count;
    if (last < match.index) {
      const otherText = text.slice(last, match.index);
      results.push(renderWith({ text: otherText, key, isGroup }));
    }

    const pubkey = text.slice(match.index, FIND_MENTIONS.lastIndex);
    results.push(<Mention text={pubkey} key={`${key}`} />);

    last = FIND_MENTIONS.lastIndex;
    match = FIND_MENTIONS.exec(text);
  }

  if (last < text.length) {
    results.push(renderWith({ text: text.slice(last), key: count++, isGroup }));
  }

  return <>{results}</>;
};
