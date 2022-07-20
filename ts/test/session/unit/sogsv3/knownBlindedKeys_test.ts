// tslint:disable: no-implicit-dependencies max-func-body-length no-unused-expression
import { expect } from 'chai';
import Sinon from 'sinon';
import { ConversationCollection } from '../../../../models/conversation';
import { ConversationTypeEnum } from '../../../../models/conversationAttributes';
import { getSodiumNode } from '../../../../node/sodiumNode';
import {
  addCachedBlindedKey,
  BlindedIdMapping,
  findCachedBlindedIdFromUnblinded,
  findCachedBlindedMatchOrItLookup,
  getCachedNakedKeyFromBlinded,
  getCachedNakedKeyFromBlindedNoServerPubkey,
  isNonBlindedKey,
  isUsAnySogsFromCache,
  KNOWN_BLINDED_KEYS_ITEM,
  loadKnownBlindedKeys,
  TEST_getCachedBlindedKeys,
  TEST_resetCachedBlindedKeys,
  tryMatchBlindWithStandardKey,
  writeKnownBlindedKeys,
} from '../../../../session/apis/open_group_api/sogsv3/knownBlindedkeys';
import { getConversationController } from '../../../../session/conversations';
import { LibSodiumWrappers } from '../../../../session/crypto';
import { UserUtils } from '../../../../session/utils';
import { expectAsyncToThrow, stubData, stubWindowLog } from '../../../test-utils/utils';
// import chaiAsPromised from 'chai-as-promised';
// chai.use(chaiAsPromised as any);
// tslint:disable: chai-vague-errors

const serverPublicKey = 'serverPublicKey';
const blindedId = '151111';
const blindedId2 = '152222';
const realSessionId = '051111';
const realSessionId2 = '052222';

const knownBlindingMatch: BlindedIdMapping = {
  realSessionId: '055bcd2bb6e600c43741173e489d925a505a11ab2b971afde56e50272e430f8b37',
  blindedId: '1562b2368a1d5452cc25c713b9add4f29405e5e58f6c4aa83fde602a7308bae714',
  serverPublicKey: '1615317ca1d8ecdf12dad1bbf1d28d3a90c94fc0010043a7fdc1609ad1c5d111',
};

describe('knownBlindedKeys', () => {
  let getItemById: Sinon.SinonStub;
  let createOrUpdateItem: Sinon.SinonStub;
  let sodium: LibSodiumWrappers;
  beforeEach(async () => {
    getItemById = stubData('getItemById');
    createOrUpdateItem = stubData('createOrUpdateItem');
    TEST_resetCachedBlindedKeys();
    stubWindowLog();
    sodium = await getSodiumNode();
  });

  afterEach(Sinon.restore);

  describe('loadFromDb', () => {
    it('loadFromDb with null', async () => {
      getItemById.resolves({ id: '', value: null });
      await loadKnownBlindedKeys();
      expect(TEST_getCachedBlindedKeys()).to.deep.eq([]);
    });

    it('loadFromDb with empty string', async () => {
      getItemById.resolves({ id: '', value: '[]' });
      await loadKnownBlindedKeys();
      expect(TEST_getCachedBlindedKeys()).to.deep.eq([]);
    });

    it('loadFromDb with valid json', async () => {
      getItemById.resolves({ id: '', value: JSON.stringify([{}, {}]) });
      await loadKnownBlindedKeys();
      expect(TEST_getCachedBlindedKeys()).to.deep.eq([{}, {}]);
    });

    it('loadFromDb with invalid json', async () => {
      getItemById.resolves({ id: '', value: 'plop invalid json' });
      await loadKnownBlindedKeys();
      expect(TEST_getCachedBlindedKeys()).to.deep.eq([]);
    });

    it('loadFromDb once or throws if retry', async () => {
      getItemById.resolves({ id: '', value: JSON.stringify([{}, {}]) });
      await loadKnownBlindedKeys();
      expect(TEST_getCachedBlindedKeys()).to.deep.eq([{}, {}]);

      try {
        await loadKnownBlindedKeys();
        throw new Error('fake'); // the loadKnownBlindedKeys should throw so we should not throw fake
      } catch (e) {
        expect(e.message).to.not.eq('fake');
        expect(e.message).to.eq('loadKnownBlindedKeys must only be called once');
      }
    });
  });

  describe('writeKnownBlindedKeys', () => {
    it('writeKnownBlindedKeys with null', async () => {
      // the cached blinded keys is resetted on each test, so that first one we try to write null
      await writeKnownBlindedKeys();
      expect(createOrUpdateItem.notCalled).to.be.true;
    });

    it('writeKnownBlindedKeys with null but loaded', async () => {
      // the cached blinded keys is resetted on each test, so that first one we try to write null

      getItemById.resolves(null);
      await loadKnownBlindedKeys();
      await writeKnownBlindedKeys();
      expect(createOrUpdateItem.notCalled).to.be.true;
    });

    it('writeKnownBlindedKeys with array with few elements', async () => {
      getItemById.resolves({ id: '', value: JSON.stringify([{}, {}]) });
      await loadKnownBlindedKeys();

      await writeKnownBlindedKeys();
      expect(createOrUpdateItem.callCount).to.be.eq(1);

      expect(createOrUpdateItem.lastCall.args[0]).to.be.deep.eq({
        id: KNOWN_BLINDED_KEYS_ITEM,
        value: '[{},{}]',
      });
    });
  });

  describe('isNonBlindedKey', () => {
    it('with unblinded key', () => {
      expect(isNonBlindedKey('00abcdef1234')).to.be.true;
    });

    it('with naked blinded key', () => {
      expect(isNonBlindedKey('05abcdef1234')).to.be.true;
    });

    it('with blinded key', () => {
      expect(isNonBlindedKey('15abcdef1234')).to.be.false;
    });
  });

  describe('getCachedNakedKeyFromBlinded', () => {
    it('with blinded key', async () => {
      const initialInDb: Array<BlindedIdMapping> = [{ blindedId, realSessionId, serverPublicKey }];
      getItemById.resolves({
        id: KNOWN_BLINDED_KEYS_ITEM,
        value: JSON.stringify(initialInDb),
      });
      await loadKnownBlindedKeys();

      expect(getCachedNakedKeyFromBlinded(blindedId, serverPublicKey)).to.be.eq(realSessionId);
    });

    it('with unblinded key', async () => {
      const initialInDb: Array<BlindedIdMapping> = [
        { blindedId, realSessionId: realSessionId2, serverPublicKey: 'serverPublicKey1' },
      ];
      getItemById.resolves({
        id: KNOWN_BLINDED_KEYS_ITEM,
        value: JSON.stringify(initialInDb),
      });
      await loadKnownBlindedKeys();

      expect(getCachedNakedKeyFromBlinded(realSessionId2, 'serverPublicKey1')).to.be.eq(
        realSessionId2
      );
    });

    it('with blinded key not found', async () => {
      const initialInDb: Array<BlindedIdMapping> = [
        { blindedId, realSessionId: realSessionId2, serverPublicKey: 'serverPublicKey1' },
      ];
      getItemById.resolves({
        id: KNOWN_BLINDED_KEYS_ITEM,
        value: JSON.stringify(initialInDb),
      });
      await loadKnownBlindedKeys();

      expect(getCachedNakedKeyFromBlinded('151112', 'serverPublicKey1')).to.be.eq(undefined);
    });
  });

  describe('findCachedBlindedIdFromUnblinded', () => {
    it('throws with blinded key', async () => {
      const initialInDb: Array<BlindedIdMapping> = [
        { blindedId, realSessionId: realSessionId2, serverPublicKey: 'serverPublicKey1' },
      ];
      getItemById.resolves({
        id: KNOWN_BLINDED_KEYS_ITEM,
        value: JSON.stringify(initialInDb),
      });
      await loadKnownBlindedKeys();

      expect(() => findCachedBlindedIdFromUnblinded(blindedId, 'serverPublicKey1')).to.throw(
        'findCachedBlindedIdFromUnblinded needs an unblindedID'
      );
    });

    it('with unblinded key', async () => {
      const initialInDb: Array<BlindedIdMapping> = [
        { blindedId, realSessionId: realSessionId2, serverPublicKey: 'serverPublicKey1' },
      ];
      getItemById.resolves({
        id: KNOWN_BLINDED_KEYS_ITEM,
        value: JSON.stringify(initialInDb),
      });
      await loadKnownBlindedKeys();

      expect(findCachedBlindedIdFromUnblinded(realSessionId2, 'serverPublicKey1')).to.be.eq(
        blindedId
      );
    });

    it('with blinded key not found', async () => {
      const initialInDb: Array<BlindedIdMapping> = [
        { blindedId, realSessionId: realSessionId2, serverPublicKey: 'serverPublicKey1' },
      ];
      getItemById.resolves({
        id: KNOWN_BLINDED_KEYS_ITEM,
        value: JSON.stringify(initialInDb),
      });
      await loadKnownBlindedKeys();

      expect(findCachedBlindedIdFromUnblinded('051112', 'serverPublicKey1')).to.be.eq(undefined);
    });
  });

  describe('addCachedBlindedKey', () => {
    it('throws with blinded key not blinded', async () => {
      getItemById.resolves();
      await loadKnownBlindedKeys();

      await expectAsyncToThrow(async () => {
        await addCachedBlindedKey({
          blindedId: realSessionId,
          serverPublicKey: 'serverPublicKey1',
          realSessionId: realSessionId2,
        });
      }, 'blindedId is not a blinded key');
    });

    it('throws with realSessionId not unlinded', async () => {
      getItemById.resolves();
      await loadKnownBlindedKeys();

      await expectAsyncToThrow(async () => {
        await addCachedBlindedKey({
          blindedId,
          serverPublicKey: 'serverPublicKey1',
          realSessionId: blindedId2,
        });
      }, 'realSessionId must not be blinded');
    });

    it('add to cache and write', async () => {
      getItemById.resolves();
      await loadKnownBlindedKeys();
      await addCachedBlindedKey({
        blindedId,
        serverPublicKey: 'serverPublicKey1',
        realSessionId: realSessionId2,
      });

      expect(createOrUpdateItem.callCount).to.be.eq(1);
      expect(createOrUpdateItem.lastCall.args[0]).to.be.deep.eq({
        id: KNOWN_BLINDED_KEYS_ITEM,
        value: JSON.stringify([
          {
            blindedId,
            serverPublicKey: 'serverPublicKey1',
            realSessionId: realSessionId2,
          },
        ]),
      });
    });

    it('replace existing if found matching with server and blindedId', async () => {
      getItemById.resolves();
      await loadKnownBlindedKeys();
      await addCachedBlindedKey({
        blindedId,
        serverPublicKey: 'serverPublicKey1',
        realSessionId: realSessionId2,
      });

      await addCachedBlindedKey({
        blindedId,
        serverPublicKey: 'serverPublicKey1',
        realSessionId: '052223', // changing this the second time
      });

      expect(createOrUpdateItem.callCount).to.be.eq(2);
      expect(createOrUpdateItem.firstCall.args[0]).to.be.deep.eq({
        id: KNOWN_BLINDED_KEYS_ITEM,
        value: JSON.stringify([
          {
            blindedId,
            serverPublicKey: 'serverPublicKey1',
            realSessionId: realSessionId2,
          },
        ]),
      });
      expect(createOrUpdateItem.lastCall.args[0]).to.be.deep.eq({
        id: KNOWN_BLINDED_KEYS_ITEM,
        value: JSON.stringify([
          {
            blindedId,
            serverPublicKey: 'serverPublicKey1',
            realSessionId: '052223',
          },
        ]),
      });
    });

    it('adds a new one if not matching serverpubkey', async () => {
      getItemById.resolves();
      await loadKnownBlindedKeys();
      await addCachedBlindedKey({
        blindedId,
        serverPublicKey: 'serverPublicKey1',
        realSessionId: realSessionId2,
      });

      await addCachedBlindedKey({
        blindedId,
        serverPublicKey: 'serverPublicKey2', // changing this the second time
        realSessionId: realSessionId2,
      });

      expect(createOrUpdateItem.callCount).to.be.eq(2);
      expect(createOrUpdateItem.firstCall.args[0]).to.be.deep.eq({
        id: KNOWN_BLINDED_KEYS_ITEM,
        value: JSON.stringify([
          {
            blindedId,
            serverPublicKey: 'serverPublicKey1',
            realSessionId: realSessionId2,
          },
        ]),
      });
      expect(createOrUpdateItem.lastCall.args[0]).to.be.deep.eq({
        id: KNOWN_BLINDED_KEYS_ITEM,
        value: JSON.stringify([
          {
            blindedId,
            serverPublicKey: 'serverPublicKey1',
            realSessionId: realSessionId2,
          },

          {
            blindedId,
            serverPublicKey: 'serverPublicKey2',
            realSessionId: realSessionId2,
          },
        ]),
      });
    });
  });

  describe('isUsAnySogsFromCache', () => {
    it('not blinded pubkey, just check if for a match with us from cache', () => {
      Sinon.stub(UserUtils, 'getOurPubKeyStrFromCache').returns(realSessionId);

      expect(isUsAnySogsFromCache(realSessionId)).to.be.true;
    });

    it('blinded pubkey, look for something matching it in the cache', async () => {
      Sinon.stub(UserUtils, 'getOurPubKeyStrFromCache').returns(realSessionId);

      getItemById.resolves();
      await loadKnownBlindedKeys();

      await addCachedBlindedKey({
        blindedId,
        serverPublicKey: 'serverPublicKey1',
        realSessionId,
      });
      expect(isUsAnySogsFromCache(blindedId)).to.be.true;
    });

    it('blinded pubkey, look for something matching it in the cache, but there is none', async () => {
      Sinon.stub(UserUtils, 'getOurPubKeyStrFromCache').returns(realSessionId);

      getItemById.resolves();
      await loadKnownBlindedKeys();

      await addCachedBlindedKey({
        blindedId,
        serverPublicKey: 'serverPublicKey1',
        realSessionId: '051112',
      });
      expect(isUsAnySogsFromCache(blindedId)).to.be.false;
    });
  });

  describe('getCachedNakedKeyFromBlindedNoServerPubkey', () => {
    it('not blinded pubkey, just return it', async () => {
      getItemById.resolves();
      await loadKnownBlindedKeys();
      expect(getCachedNakedKeyFromBlindedNoServerPubkey(realSessionId)).to.be.eq(realSessionId);
    });

    it('blinded pubkey, find the corresponding realSessionID ', async () => {
      getItemById.resolves({
        id: KNOWN_BLINDED_KEYS_ITEM,
        value: JSON.stringify([{ blindedId, realSessionId, serverPublicKey: 'whatever' }]),
      });
      await loadKnownBlindedKeys();
      expect(getCachedNakedKeyFromBlindedNoServerPubkey(blindedId)).to.be.eq(realSessionId);
    });
  });

  describe('tryMatchBlindWithStandardKey', () => {
    it('throws if standardSessionId is not standard', async () => {
      await expectAsyncToThrow(async () => {
        tryMatchBlindWithStandardKey(blindedId, blindedId, serverPublicKey, await getSodiumNode());
      }, 'standardKey must be a standard key (starting with 05)');
    });

    it('throws if blindedSessionId is not standard', () => {
      expect(() => {
        tryMatchBlindWithStandardKey(realSessionId, realSessionId, serverPublicKey, sodium);
      }).to.throw('blindedKey must be a blinded key (starting with 15)');
    });

    it('returns true if those keys are not matching blind & naked', () => {
      const matching = tryMatchBlindWithStandardKey(
        knownBlindingMatch.realSessionId,
        knownBlindingMatch.blindedId,
        knownBlindingMatch.serverPublicKey,
        sodium
      );
      expect(matching).to.be.true;
    });

    it('returns false if those keys are not matching blind & naked', () => {
      const matching = tryMatchBlindWithStandardKey(
        '054dc9d99c11060ccff2bef18bfe4f53e8bb548f07d1bfa17fc45cf8f019fb0846', // fake but real sessionID
        knownBlindingMatch.blindedId,
        knownBlindingMatch.serverPublicKey,
        sodium
      );
      expect(matching).to.be.false;
    });
  });

  describe('findCachedBlindedMatchOrItLookup', () => {
    it('return unblinded pubkey if already unblinded', async () => {
      const real = await findCachedBlindedMatchOrItLookup(realSessionId, serverPublicKey, sodium);
      expect(createOrUpdateItem.callCount).to.be.eq(0);
      expect(real).to.be.eq(realSessionId);
    });

    it('does hit the cache first', async () => {
      getItemById.resolves();
      await loadKnownBlindedKeys();

      await addCachedBlindedKey({
        blindedId: knownBlindingMatch.blindedId,
        serverPublicKey: knownBlindingMatch.serverPublicKey,
        realSessionId: knownBlindingMatch.realSessionId,
      });
      const real = await findCachedBlindedMatchOrItLookup(realSessionId, serverPublicKey, sodium);
      // just one call with that addCachedBlindedKey, and none else, as the cache was hit
      expect(createOrUpdateItem.callCount).to.eq(1);
      expect(real).to.eq(realSessionId);
    });

    it('does hit the cache first', async () => {
      getItemById.resolves();
      await loadKnownBlindedKeys();

      await addCachedBlindedKey({
        blindedId: knownBlindingMatch.blindedId,
        serverPublicKey: knownBlindingMatch.serverPublicKey,
        realSessionId: knownBlindingMatch.realSessionId,
      });
      const real = await findCachedBlindedMatchOrItLookup(realSessionId, serverPublicKey, sodium);
      // just one call with that addCachedBlindedKey, and none else, as the cache was hit
      expect(createOrUpdateItem.callCount).to.eq(1);
      expect(real).to.eq(realSessionId);
    });

    describe('when not in cache', () => {
      beforeEach(async () => {
        getConversationController().reset();

        stubData('getAllConversations').resolves(new ConversationCollection([]));
        stubData('saveConversation').resolves();
        await getConversationController().load();
      });

      it('does iterate over all the conversations and find the first one matching (fails)', async () => {
        getItemById.resolves();
        await loadKnownBlindedKeys();

        await addCachedBlindedKey({
          blindedId: knownBlindingMatch.blindedId,
          serverPublicKey: knownBlindingMatch.serverPublicKey,
          realSessionId: knownBlindingMatch.realSessionId,
        });

        Sinon.stub(getConversationController(), 'getConversations').returns([]);
        const real = await findCachedBlindedMatchOrItLookup(realSessionId, serverPublicKey, sodium);
        // we should have 2 calls here as the value was not in the cache at first
        expect(createOrUpdateItem.callCount).to.eq(1);
        // expect(createOrUpdateItem.lastCall.args[0]).to.deep.eq({});
        expect(real).to.eq(realSessionId);
      });

      it('does iterate over all the conversations and find the first one matching (passes)', async () => {
        getItemById.resolves();
        await loadKnownBlindedKeys();

        // await addCachedBlindedKey({
        //   blindedId: knownBlindingMatch.blindedId,
        //   serverPublicKey: knownBlindingMatch.serverPublicKey,
        //   realSessionId: knownBlindingMatch.realSessionId,
        // });

        await getConversationController().getOrCreateAndWait(
          realSessionId,
          ConversationTypeEnum.PRIVATE
        );
        const real = await findCachedBlindedMatchOrItLookup(
          knownBlindingMatch.blindedId,
          serverPublicKey,
          sodium
        );
        expect(createOrUpdateItem.callCount).to.eq(1);
        // expect(createOrUpdateItem.lastCall.args[0]).to.deep.eq({});
        expect(real).to.eq(realSessionId);
      });
    });
  });
});
