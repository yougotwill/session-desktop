import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import Sinon from 'sinon';
import { HexString } from '../../../../node/hexStrings';
import { getSodiumNode } from '../../../../node/sodiumNode';
import { GetNetworkTime } from '../../../../session/apis/snode_api/getNetworkTime';
import { SnodeNamespaces } from '../../../../session/apis/snode_api/namespaces';
import { SnodeSignature } from '../../../../session/apis/snode_api/snodeSignatures';
import { concatUInt8Array } from '../../../../session/crypto';
import { UserUtils } from '../../../../session/utils';
import { fromBase64ToArray, fromHexToArray } from '../../../../session/utils/String';

use(chaiAsPromised);

const validGroupPk = '03eef710fcaaa73fd50c4311333f5c496e0fdbbe9e8a70fdfa95e7ec62d5032f5c';
const privKeyUint = concatUInt8Array(
  fromHexToArray('cd8488c39bf9972739046d627e7796b2bc0e38e2fa99fc4edd59205c28f2cdb1'),
  fromHexToArray(validGroupPk.slice(2))
); // len 64

const userEd25519Keypair = {
  pubKey: '37e1631b002de498caf7c5c1712718bde7f257c6dadeed0c21abf5e939e6c309',
  privKey:
    'be1d11154ff9b6de77873f0b6b0bcc460000000000000000000000000000000037e1631b002de498caf7c5c1712718bde7f257c6dadeed0c21abf5e939e6c309',
};

const hardcodedTimestamp = 1234;

async function verifySig(ret: { pubkey: string; signature: string }, verificationData: string) {
  const without03 =
    ret.pubkey.startsWith('03') || ret.pubkey.startsWith('05') ? ret.pubkey.slice(2) : ret.pubkey; //
  const pk = HexString.fromHexString(without03);
  const sodium = await getSodiumNode();
  const verified = sodium.crypto_sign_verify_detached(
    fromBase64ToArray(ret.signature),
    verificationData,
    pk
  );

  if (!verified) {
    throw new Error('sig failed to be verified');
  }
}

describe('SnodeSignature', () => {
  afterEach(() => {
    Sinon.restore();
  });

  describe('getSnodeGroupSignatureParams', () => {
    beforeEach(() => {
      Sinon.stub(GetNetworkTime, 'getNowWithNetworkOffset').returns(hardcodedTimestamp);
    });

    describe('retrieve', () => {
      it('retrieve namespace ClosedGroupInfo', async () => {
        const ret = await SnodeSignature.getSnodeGroupSignatureParams({
          method: 'retrieve',
          namespace: SnodeNamespaces.ClosedGroupInfo,
          groupIdentityPrivKey: privKeyUint,
          groupPk: validGroupPk,
        });
        expect(ret.pubkey).to.be.eq(validGroupPk);

        expect(ret.timestamp).to.be.eq(hardcodedTimestamp);
        const verificationData = `retrieve${SnodeNamespaces.ClosedGroupInfo}${hardcodedTimestamp}`;
        await verifySig(ret, verificationData);
      });

      it('retrieve namespace ClosedGroupKeys', async () => {
        const ret = await SnodeSignature.getSnodeGroupSignatureParams({
          method: 'retrieve',
          namespace: SnodeNamespaces.ClosedGroupKeys,
          groupIdentityPrivKey: privKeyUint,
          groupPk: validGroupPk,
        });
        expect(ret.pubkey).to.be.eq(validGroupPk);

        expect(ret.timestamp).to.be.eq(hardcodedTimestamp);
        const verificationData = `retrieve${SnodeNamespaces.ClosedGroupKeys}${hardcodedTimestamp}`;

        await verifySig(ret, verificationData);
      });

      it('retrieve namespace ClosedGroupMessages', async () => {
        const ret = await SnodeSignature.getSnodeGroupSignatureParams({
          method: 'retrieve',
          namespace: SnodeNamespaces.ClosedGroupMessages,
          groupIdentityPrivKey: privKeyUint,
          groupPk: validGroupPk,
        });
        expect(ret.pubkey).to.be.eq(validGroupPk);

        expect(ret.timestamp).to.be.eq(hardcodedTimestamp);
        const verificationData = `retrieve${SnodeNamespaces.ClosedGroupMessages}${hardcodedTimestamp}`;
        await verifySig(ret, verificationData);
      });
    });

    describe('store', () => {
      it('store namespace ClosedGroupInfo', async () => {
        const ret = await SnodeSignature.getSnodeGroupSignatureParams({
          method: 'store',
          namespace: SnodeNamespaces.ClosedGroupInfo,
          groupIdentityPrivKey: privKeyUint,
          groupPk: validGroupPk,
        });
        expect(ret.pubkey).to.be.eq(validGroupPk);
        expect(ret.timestamp).to.be.eq(hardcodedTimestamp);

        const verificationData = `store${SnodeNamespaces.ClosedGroupInfo}${hardcodedTimestamp}`;
        await verifySig(ret, verificationData);
      });

      it('store namespace ClosedGroupKeys', async () => {
        const ret = await SnodeSignature.getSnodeGroupSignatureParams({
          method: 'store',
          namespace: SnodeNamespaces.ClosedGroupKeys,
          groupIdentityPrivKey: privKeyUint,
          groupPk: validGroupPk,
        });
        expect(ret.pubkey).to.be.eq(validGroupPk);

        expect(ret.timestamp).to.be.eq(hardcodedTimestamp);
        const verificationData = `store${SnodeNamespaces.ClosedGroupKeys}${hardcodedTimestamp}`;
        await verifySig(ret, verificationData);
      });

      it('store namespace ClosedGroupMessages', async () => {
        const ret = await SnodeSignature.getSnodeGroupSignatureParams({
          method: 'store',
          namespace: SnodeNamespaces.ClosedGroupMessages,
          groupIdentityPrivKey: privKeyUint,
          groupPk: validGroupPk,
        });
        expect(ret.pubkey).to.be.eq(validGroupPk);
        expect(ret.timestamp).to.be.eq(hardcodedTimestamp);
        const verificationData = `store${SnodeNamespaces.ClosedGroupMessages}${hardcodedTimestamp}`;
        await verifySig(ret, verificationData);
      });
    });
  });

  describe('generateUpdateExpiryGroupSignature', () => {
    it('throws if groupPk not given', async () => {
      const func = async () => {
        return SnodeSignature.generateUpdateExpiryGroupSignature({
          groupPk: null as any,
          groupPrivKey: privKeyUint,
          messagesHashes: ['[;p['],
          shortenOrExtend: '',
          timestamp: hardcodedTimestamp,
        });
      };
      await expect(func()).to.be.rejectedWith(
        'generateUpdateExpiryGroupSignature groupPrivKey or groupPk is empty'
      );
    });

    it('throws if groupPrivKey is empty', async () => {
      const func = async () => {
        return SnodeSignature.generateUpdateExpiryGroupSignature({
          groupPk: validGroupPk,
          groupPrivKey: new Uint8Array() as any,
          messagesHashes: ['[;p['],
          shortenOrExtend: '',
          timestamp: hardcodedTimestamp,
        });
      };
      await expect(func()).to.be.rejectedWith(
        'generateUpdateExpiryGroupSignature groupPrivKey or groupPk is empty'
      );
    });

    it('works with valid pubkey and privkey', async () => {
      const hashes = ['hash4321', 'hash4221'];
      const timestamp = hardcodedTimestamp;
      const shortenOrExtend = '';
      const ret = await SnodeSignature.generateUpdateExpiryGroupSignature({
        groupPk: validGroupPk,
        groupPrivKey: privKeyUint,
        messagesHashes: hashes,
        shortenOrExtend: '',
        timestamp,
      });

      expect(ret.pubkey).to.be.eq(validGroupPk);

      const verificationData = `expire${shortenOrExtend}${timestamp}${hashes.join('')}`;
      await verifySig(ret, verificationData);
    });

    it('fails with invalid timestamp', async () => {
      const hashes = ['hash4321', 'hash4221'];
      const timestamp = hardcodedTimestamp;
      const shortenOrExtend = '';
      const ret = await SnodeSignature.generateUpdateExpiryGroupSignature({
        groupPk: validGroupPk,
        groupPrivKey: privKeyUint,
        messagesHashes: hashes,
        shortenOrExtend: '',
        timestamp,
      });

      expect(ret.pubkey).to.be.eq(validGroupPk);

      const verificationData = `expire${shortenOrExtend}${timestamp}1${hashes.join('')}`;
      const func = async () => verifySig(ret, verificationData);
      await expect(func()).rejectedWith('sig failed to be verified');
    });

    it('fails with invalid hashes', async () => {
      const hashes = ['hash4321', 'hash4221'];
      const timestamp = hardcodedTimestamp;
      const shortenOrExtend = '';
      const ret = await SnodeSignature.generateUpdateExpiryGroupSignature({
        groupPk: validGroupPk,
        groupPrivKey: privKeyUint,
        messagesHashes: hashes,
        shortenOrExtend: '',
        timestamp,
      });

      expect(ret.pubkey).to.be.eq(validGroupPk);

      const overridenHash = hashes.slice();
      overridenHash[0] = '1111';
      const verificationData = `expire${shortenOrExtend}${timestamp}${overridenHash.join('')}`;
      const func = async () => verifySig(ret, verificationData);
      await expect(func()).rejectedWith('sig failed to be verified');
    });

    it('fails with invalid number of hashes', async () => {
      const hashes = ['hash4321', 'hash4221'];
      const timestamp = hardcodedTimestamp;
      const shortenOrExtend = '';
      const ret = await SnodeSignature.generateUpdateExpiryGroupSignature({
        groupPk: validGroupPk,
        groupPrivKey: privKeyUint,
        messagesHashes: hashes,
        shortenOrExtend: '',
        timestamp,
      });

      expect(ret.pubkey).to.be.eq(validGroupPk);

      const overridenHash = [hashes[0]];
      const verificationData = `expire${shortenOrExtend}${timestamp}${overridenHash.join('')}`;
      const func = async () => verifySig(ret, verificationData);
      await expect(func()).rejectedWith('sig failed to be verified');
    });
  });

  describe('generateUpdateExpiryOurSignature', () => {
    it('throws if our ed keypair is not set', async () => {
      Sinon.stub(UserUtils, 'getUserED25519KeyPair').resolves(null as any);

      const func = async () => {
        const hashes = ['hash4321', 'hash4221'];
        const shortenOrExtend = '';
        return SnodeSignature.generateUpdateExpiryOurSignature({
          messagesHashes: hashes,
          shortenOrExtend,
          timestamp: hardcodedTimestamp,
        });
      };

      await expect(func()).to.be.rejectedWith(
        'getSnodeSignatureParams "expiry": User has no getUserED25519KeyPair()'
      );
    });

    it('throws if invalid hashes', async () => {
      Sinon.stub(UserUtils, 'getUserED25519KeyPair').resolves(userEd25519Keypair);

      const hashes = ['hash4321', 'hash4221'];
      const shortenOrExtend = '';
      const ret = await SnodeSignature.generateUpdateExpiryOurSignature({
        messagesHashes: hashes,
        shortenOrExtend,
        timestamp: hardcodedTimestamp,
      });
      const overridenHash = [hashes[0]];
      const verificationData = `expire${shortenOrExtend}${hardcodedTimestamp}${overridenHash.join(
        ''
      )}`;

      const func = async () => {
        return verifySig(ret, verificationData);
      };
      await expect(func()).to.be.rejectedWith('sig failed to be verified');
    });

    it('throws if invalid timestamp', async () => {
      Sinon.stub(UserUtils, 'getUserED25519KeyPair').resolves(userEd25519Keypair);

      const hashes = ['hash4321', 'hash4221'];
      const shortenOrExtend = '';
      const ret = await SnodeSignature.generateUpdateExpiryOurSignature({
        messagesHashes: hashes,
        shortenOrExtend,
        timestamp: hardcodedTimestamp,
      });
      const verificationData = `expire${shortenOrExtend}${hardcodedTimestamp}123${hashes.join('')}`;

      const func = async () => {
        return verifySig(ret, verificationData);
      };
      await expect(func()).to.be.rejectedWith('sig failed to be verified');
    });

    it('works with valid pubkey and privkey', async () => {
      Sinon.stub(UserUtils, 'getUserED25519KeyPair').resolves(userEd25519Keypair);

      const hashes = ['hash4321', 'hash4221'];
      const timestamp = hardcodedTimestamp;
      const shortenOrExtend = '';
      const ret = await SnodeSignature.generateUpdateExpiryOurSignature({
        messagesHashes: hashes,
        shortenOrExtend: '',
        timestamp,
      });

      expect(ret.pubkey).to.be.eq(userEd25519Keypair.pubKey);

      const verificationData = `expire${shortenOrExtend}${timestamp}${hashes.join('')}`;
      await verifySig(ret, verificationData);
    });
  });
});
