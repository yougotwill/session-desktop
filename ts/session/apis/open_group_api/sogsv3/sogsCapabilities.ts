import { from_hex } from 'libsodium-wrappers-sumo';
import { findIndex } from 'lodash';
import { getConversationById } from '../../../../data/data';
import {
  getV2OpenGroupRoomsByServerUrl,
  OpenGroupV2Room,
  saveV2OpenGroupRoom,
} from '../../../../data/opengroups';
import { DecodedResponseBodiesV4 } from '../../../onions/onionv4';
import { UserUtils } from '../../../utils';
import { getBlindedPubKey } from './sogsBlinding';
import { BatchSogsReponse, OpenGroupBatchRow } from './sogsV3BatchPoll';
import { capabilitiesListHasBlindEnabled, parseCapabilities } from './sogsV3Capabilities';

/**
 * @param subrequestOptionsLookup list of subrequests used for the batch request (order sensitive)
 * @param batchPollResults The result from the batch request (order sensitive)
 */
export const getCapabilitiesFromBatch = (
  subrequestOptionsLookup: Array<OpenGroupBatchRow>,
  bodies: DecodedResponseBodiesV4
): Array<string> | null => {
  const capabilitiesBatchIndex = findIndex(
    subrequestOptionsLookup,
    (subrequest: OpenGroupBatchRow) => {
      return subrequest.type === 'capabilities';
    }
  );
  const capabilities: Array<string> | null =
    parseCapabilities(bodies?.[capabilitiesBatchIndex]?.body) || null;
  return capabilities;
};

/** using this as explicit way to ensure order  */
export const handleCapabilities = async (
  subrequestOptionsLookup: Array<OpenGroupBatchRow>,
  batchPollResults: BatchSogsReponse,
  serverUrl: string
  // roomId: string
): Promise<null | Array<string>> => {
  if (!batchPollResults.body) {
    return null;
  }
  const capabilities = getCapabilitiesFromBatch(subrequestOptionsLookup, batchPollResults.body);
  if (!capabilities) {
    window?.log?.error(
      'Failed capabilities subrequest - cancelling capabilities response handling'
    );
    return null;
  }

  // get all v2OpenGroup rooms with the matching serverUrl and set the capabilities.
  // TODO: implement - update capabilities. Unsure whether to store in DB or save to instance of this obj.

  const rooms = getV2OpenGroupRoomsByServerUrl(serverUrl);

  if (!rooms || !rooms.length) {
    window?.log?.error('handleCapabilities - Found no groups with matching server url');
    return null;
  }

  await Promise.all(
    rooms.map(async (room: OpenGroupV2Room) => {
      // doing this to get the roomId? and conversationId? Optionally could include

      // TODO: uncomment once complete
      // if (_.isEqual(room.capabilities, capabilities)) {
      //   return;
      // }

      // updating the db values for the open group room
      const roomUpdate = { ...room, capabilities };
      await saveV2OpenGroupRoom(roomUpdate);

      // updating values in the conversation
      // generate blindedPK for
      if (capabilitiesListHasBlindEnabled(capabilities) && room.conversationId) {
        // generate blinded PK for the room and save it to the conversation.
        const conversationToAddBlindedKey = await getConversationById(room.conversationId);

        if (!conversationToAddBlindedKey) {
          window?.log?.error('No conversation to add blinded pubkey to');
        }

        const ourSignKeyBytes = await UserUtils.getUserED25519KeyPairBytes();
        if (!room.serverPublicKey || !ourSignKeyBytes) {
          window?.log?.error(
            'handleCapabilities - missing required signing keys or server public key for blinded key generation'
          );
          return;
        }

        const blindedPubKey = await getBlindedPubKey(
          from_hex(room.serverPublicKey),
          ourSignKeyBytes
        );

        if (!blindedPubKey) {
          window?.log?.error('Failed to generate blinded pubkey');
          return;
        }

        console.error('yo todo');
        // await conversationToAddBlindedKey?.set({
        //   blindedPubKey,
        // });
      }
    })
  );
  return capabilities;
};
