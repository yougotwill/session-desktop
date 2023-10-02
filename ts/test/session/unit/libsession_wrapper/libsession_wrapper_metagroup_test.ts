import { expect } from 'chai';
import { MetaGroupWrapperNode, UserGroupsWrapperNode } from 'libsession_util_nodejs';
import Sinon from 'sinon';
import { range } from 'lodash';
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

  describe('info', () => {
    it('all fields are accounted for', () => {
      const info = metaGroupWrapper.infoGet();
      expect(Object.keys(info).length).to.be.eq(
        7, // if you change this value, also make sure you add a test, testing that field, below
        'this test is designed to fail if you need to add tests to test a new field of libsession'
      );
    });

    it('can set and recover group name', () => {
      expect(metaGroupWrapper.infoGet().name).to.be.deep.eq(null);
      const info = metaGroupWrapper.infoGet();
      info.name = 'fake name';
      metaGroupWrapper.infoSet(info);
      expect(metaGroupWrapper.infoGet().name).to.be.deep.eq('fake name');
    });

    it('can set and recover group createdAt', () => {
      const expected = 1234;
      expect(metaGroupWrapper.infoGet().createdAtSeconds).to.be.deep.eq(null);
      const info = metaGroupWrapper.infoGet();
      info.createdAtSeconds = expected;
      metaGroupWrapper.infoSet(info);
      expect(metaGroupWrapper.infoGet().createdAtSeconds).to.be.deep.eq(expected);
    });

    it('can set and recover group deleteAttachBeforeSeconds', () => {
      const expected = 1234;
      expect(metaGroupWrapper.infoGet().deleteAttachBeforeSeconds).to.be.deep.eq(null);
      const info = metaGroupWrapper.infoGet();
      info.deleteAttachBeforeSeconds = expected;
      metaGroupWrapper.infoSet(info);
      expect(metaGroupWrapper.infoGet().deleteAttachBeforeSeconds).to.be.deep.eq(expected);
    });

    it('can set and recover group deleteBeforeSeconds', () => {
      const expected = 1234;
      expect(metaGroupWrapper.infoGet().deleteBeforeSeconds).to.be.deep.eq(null);
      const info = metaGroupWrapper.infoGet();
      info.deleteBeforeSeconds = expected;
      metaGroupWrapper.infoSet(info);
      expect(metaGroupWrapper.infoGet().deleteBeforeSeconds).to.be.deep.eq(expected);
    });

    it('can set and recover group expirySeconds', () => {
      const expected = 1234;
      expect(metaGroupWrapper.infoGet().expirySeconds).to.be.deep.eq(null);
      const info = metaGroupWrapper.infoGet();
      info.expirySeconds = expected;
      metaGroupWrapper.infoSet(info);
      expect(metaGroupWrapper.infoGet().expirySeconds).to.be.deep.eq(expected);
    });

    it('can set and recover group isDestroyed', () => {
      expect(metaGroupWrapper.infoGet().isDestroyed).to.be.deep.eq(false);
      metaGroupWrapper.infoDestroy();
      expect(metaGroupWrapper.infoGet().isDestroyed).to.be.deep.eq(true);
    });

    it('can set and recover group profilePicture', () => {
      const expected = { key: new Uint8Array(range(0, 32)), url: '1234' };
      expect(metaGroupWrapper.infoGet().profilePicture).to.be.deep.eq({ url: null, key: null });
      const info = metaGroupWrapper.infoGet();

      info.profilePicture = expected;
      metaGroupWrapper.infoSet(info);
      expect(metaGroupWrapper.infoGet().profilePicture).to.be.deep.eq(expected);
    });
  });
});
