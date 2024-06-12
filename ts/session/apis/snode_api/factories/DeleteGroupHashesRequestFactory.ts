import { UserGroupsGet } from 'libsession_util_nodejs';
import { isEmpty } from 'lodash';
import { ed25519Str } from '../../../utils/String';
import { DeleteHashesFromGroupNodeSubRequest } from '../SnodeRequestTypes';

function makeGroupHashesToDeleteSubRequest({
  allOldHashes,
  group,
}: {
  group: Pick<UserGroupsGet, 'secretKey' | 'pubkeyHex'>;
  allOldHashes: Set<string>;
}) {
  const groupPk = group.pubkeyHex;
  const allOldHashesArray = [...allOldHashes];
  if (allOldHashesArray.length) {
    if (!group.secretKey || isEmpty(group.secretKey)) {
      window.log.debug(
        `makeGroupHashesToDeleteSubRequest: ${ed25519Str(groupPk)}: allOldHashesArray not empty but we do not have the secretKey`
      );

      throw new Error(
        'makeGroupHashesToDeleteSubRequest: allOldHashesArray not empty but we do not have the secretKey'
      );
    }

    return new DeleteHashesFromGroupNodeSubRequest({
      messagesHashes: [...allOldHashes],
      groupPk,
      secretKey: group.secretKey,
    });
  }
  return null;
}

export const DeleteGroupHashesFactory = { makeGroupHashesToDeleteSubRequest };
