import { expect } from 'chai';
import { MetaGroupWrapperNode, UserGroupsWrapperNode } from 'libsession_util_nodejs';
import Sinon from 'sinon';
import { HexString } from '../../../../node/hexStrings';
import { toFixedUint8ArrayOfLength } from '../../../../types/sqlSharedTypes';
import { TestUtils } from '../../../test-utils';
import { TestUserKeyPairs } from '../../../test-utils/utils';

describe('libsession_metagroup', () => {
  let us: TestUserKeyPairs;
  let groupCreated: ReturnType<UserGroupsWrapperNode['createGroup']>;
  let metaGroupWrapper: MetaGroupWrapperNode;

  beforeEach(async () => {
    us = await TestUtils.generateUserKeyPairs();
    const groupWrapper = new UserGroupsWrapperNode(us.ed25519KeyPair.privateKey, null);
    groupCreated = groupWrapper.createGroup();

    metaGroupWrapper = new MetaGroupWrapperNode({
      groupEd25519Pubkey: toFixedUint8ArrayOfLength(
        HexString.fromHexString(groupCreated.pubkeyHex.slice(2)),
        32
      ),
      groupEd25519Secretkey: groupCreated.secretKey,
      metaDumped: null,
      userEd25519Secretkey: toFixedUint8ArrayOfLength(us.ed25519KeyPair.privateKey, 64),
    });
  });
  afterEach(() => {
    Sinon.restore();
  });

  describe("encrypt/decrypt group's message", () => {
    it('can encrypt/decrypt message for group with us as author', async () => {
      const plaintext = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      const toEncrypt = new Uint8Array(plaintext);
      const encrypted = metaGroupWrapper.encryptMessage(toEncrypt);
      const decrypted = metaGroupWrapper.decryptMessage(encrypted);

      expect(decrypted.plaintext).to.be.deep.eq(toEncrypt);
      expect(decrypted.pubkeyHex).to.be.deep.eq(us.x25519KeyPair.pubkeyHex);
    });

    it('throws when encrypt/decrypt message when content is messed up', async () => {
      const plaintext = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      const toEncrypt = new Uint8Array(plaintext);
      const encrypted = metaGroupWrapper.encryptMessage(toEncrypt);

      encrypted[1] = 67;
      const func = () => metaGroupWrapper.decryptMessage(encrypted);
      expect(func).to.throw('unable to decrypt ciphertext with any current group keys');
    });
  });
});
