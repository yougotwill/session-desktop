import { expect } from 'chai';
import { MultiEncryptWrapperNode, UserGroupsWrapperNode } from 'libsession_util_nodejs';
import Sinon from 'sinon';
import { fromHexToArray } from '../../../../session/utils/String';
import { TestUtils } from '../../../test-utils';

describe('libsession_multi_encrypt', () => {
  // let us: TestUserKeyPairs;
  // let groupX25519SecretKey: Uint8Array;

  beforeEach(async () => {
    // us = await TestUtils.generateUserKeyPairs();
    // const group = await TestUtils.generateGroupV2(us.ed25519KeyPair.privKeyBytes);
    // if (!group.secretKey) {
    //   throw new Error('failed to create grou[p');
    // }
    // groupX25519SecretKey = group.secretKey;
  });
  afterEach(() => {
    Sinon.restore();
  });

  describe('encrypt/decrypt multi encrypt/decrypt  message', () => {
    it('can encrypt/decrypt message one message to one recipient', async () => {
      const toEncrypt = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      const plaintext = new Uint8Array(toEncrypt);
      const domain = 'domain';

      const us = await TestUtils.generateUserKeyPairs();
      const userXPk = us.x25519KeyPair.pubKey.slice(1); // remove 05 prefix
      const userSk = us.ed25519KeyPair.privKeyBytes;

      const groupWrapper = new UserGroupsWrapperNode(us.ed25519KeyPair.privKeyBytes, null);
      const group = await groupWrapper.createGroup();
      if (!group.secretKey) {
        throw new Error('failed to create group');
      }
      const groupEd25519SecretKey = group.secretKey;
      const groupEd25519Pubkey = fromHexToArray(group.pubkeyHex).slice(1); // remove 03 prefix

      const encrypted = MultiEncryptWrapperNode.multiEncrypt({
        messages: [plaintext],
        recipients: [userXPk],
        ed25519SecretKey: groupEd25519SecretKey,
        domain,
      });
      const decrypted = MultiEncryptWrapperNode.multiDecryptEd25519({
        domain,
        encoded: encrypted,
        ed25519SecretKey: userSk,
        senderEd25519Pubkey: groupEd25519Pubkey,
      });
      console.warn('decrypted', decrypted);
      expect(decrypted).to.be.deep.eq(Buffer.from(toEncrypt));
    });
  });
});
