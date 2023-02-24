import { isEmpty } from 'lodash';
import { UserUtils } from '..';
import { UserConfigWrapperActions } from '../../../webworker/workers/browser/libsession_worker_interface';
import { getConversationController } from '../../conversations';
import { fromHexToArray } from '../String';

async function insertUserProfileIntoWrapper() {
  const us = UserUtils.getOurPubKeyStrFromCache();
  const ourConvo = getConversationController().get(us);

  if (!ourConvo) {
    throw new Error('insertUserProfileIntoWrapper needs a ourConvo to exist');
  }

  const dbName = ourConvo.get('displayNameInProfile') || '';
  const dbProfileUrl = ourConvo.get('avatarPointer') || '';
  const dbProfileKey = fromHexToArray(ourConvo.get('profileKey') || '');
  await UserConfigWrapperActions.setName(dbName);

  if (dbProfileUrl && !isEmpty(dbProfileKey)) {
    await UserConfigWrapperActions.setProfilePicture(dbProfileUrl, dbProfileKey);
  } else {
    await UserConfigWrapperActions.setProfilePicture('', new Uint8Array());
  }
}

export const SessionUtilUserProfile = {
  insertUserProfileIntoWrapper,
};