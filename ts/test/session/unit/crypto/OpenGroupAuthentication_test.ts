import chai, { expect } from 'chai';
import * as sinon from 'sinon';
import chaiBytes from 'chai-bytes';
import { getOpenGroupHeaders } from '../../../../session/apis/open_group_api/opengroupV2/OpenGroupAuthentication';
import { KeyPair } from 'libsodium-wrappers-sumo';

chai.use(chaiBytes);

// tslint:disable-next-line: max-func-body-length
describe('OpenGroupAuthentication', () => {
  const sandbox = sinon.createSandbox();
  const signingKeys: KeyPair = {
    keyType: 'ed25519',
    privateKey: new Uint8Array([
      192,
      16,
      216,
      158,
      204,
      186,
      245,
      209,
      198,
      209,
      157,
      247,
      102,
      198,
      238,
      223,
      150,
      93,
      74,
      40,
      165,
      111,
      135,
      201,
      252,
      129,
      158,
      219,
      89,
      137,
      109,
      217,
      186,
      198,
      231,
      30,
      253,
      125,
      250,
      74,
      131,
      201,
      142,
      210,
      79,
      37,
      74,
      178,
      194,
      103,
      249,
      204,
      219,
      23,
      42,
      82,
      128,
      160,
      68,
      74,
      210,
      78,
      137,
      204,
    ]),
    publicKey: new Uint8Array([
      186,
      198,
      231,
      30,
      253,
      125,
      250,
      74,
      131,
      201,
      142,
      210,
      79,
      37,
      74,
      178,
      194,
      103,
      249,
      204,
      219,
      23,
      42,
      82,
      128,
      160,
      68,
      74,
      210,
      78,
      137,
      204,
    ]),
  };
  const serverPK = new Uint8Array([
    195,
    179,
    198,
    243,
    47,
    10,
    181,
    165,
    127,
    133,
    60,
    196,
    243,
    15,
    93,
    167,
    253,
    165,
    98,
    75,
    12,
    119,
    179,
    251,
    8,
    41,
    222,
    86,
    42,
    218,
    8,
    29,
  ]);
  const ts = 1642472103;
  const method = 'GET';
  const path = '/room/the-best-room/messages/recent?limit=25';

  const nonce = new Uint8Array([
    9,
    208,
    121,
    159,
    34,
    149,
    153,
    1,
    130,
    195,
    171,
    52,
    6,
    251,
    252,
    91,
  ]);

  const body = 'This is a test message body 12345';

  afterEach(() => {
    sandbox.restore();
  });

  describe('HeaderCreation', () => {
    describe('Blinded Headers', () => {
      describe('X-SOGS-Nonce', () => {
        it('should produce correct X-SOGS-Nonce', async () => {
          const headers = await getOpenGroupHeaders({
            signingKeys,
            serverPK,
            nonce,
            method,
            path,
            timestamp: ts,
            blinded: true,
          });
          expect(headers['X-SOGS-Nonce']).to.be.equal('CdB5nyKVmQGCw6s0Bvv8Ww==');
        });

        it('should produce correct X-SOGS-Pubkey', async () => {
          const headers = await getOpenGroupHeaders({
            signingKeys,
            serverPK,
            nonce,
            method,
            path,
            timestamp: ts,
            blinded: true,
          });
          expect(headers['X-SOGS-Pubkey']).to.be.equal(
            '1598932d4bccbe595a8789d7eb1629cefc483a0eaddc7e20e8fe5c771efafd9af5'
          );
        });

        it('should produce correct X-SOGS-Timestamp', async () => {
          const headers = await getOpenGroupHeaders({
            signingKeys,
            serverPK,
            nonce,
            method,
            path,
            timestamp: ts,
            blinded: true,
          });
          expect(headers['X-SOGS-Timestamp']).to.be.equal('1642472103');
        });
        it('should produce correct X-SOGS-Signature without body', async () => {
          const headers = await getOpenGroupHeaders({
            signingKeys,
            serverPK,
            nonce,
            method,
            path,
            timestamp: ts,
            blinded: true,
          });
          expect(headers['X-SOGS-Signature']).to.be.equal(
            'gYqpWZX6fnF4Gb2xQM3xaXs0WIYEI49+B8q4mUUEg8Rw0ObaHUWfoWjMHMArAtP9QlORfiydsKWz1o6zdPVeCQ=='
          );
        });

        it('should produce correct X-SOGS-Signature with body', async () => {
          const headers = await getOpenGroupHeaders({
            signingKeys,
            serverPK,
            nonce,
            method,
            path,
            timestamp: ts,
            blinded: true,
            body,
          });
          expect(headers['X-SOGS-Signature']).to.be.equal(
            'Bs680K7t2VOmbiXNX+uIPa7dDWzxKQfLk8SxdGxe2wwadFQOr9KdAetVmVQ6w4MfyHOD6WiP0JAVb4Tb8I5lAA=='
          );
        });
      });

      describe('Unblinded Headers', () => {
        it('should produce correct X-SOGS-Nonce', async () => {
          const headers = await getOpenGroupHeaders({
            signingKeys,
            serverPK,
            nonce,
            method,
            path,
            timestamp: ts,
            blinded: false,
          });
          expect(headers['X-SOGS-Nonce']).to.be.equal('CdB5nyKVmQGCw6s0Bvv8Ww==');
        });

        it('should produce correct X-SOGS-Pubkey', async () => {
          const headers = await getOpenGroupHeaders({
            signingKeys,
            serverPK,
            nonce,
            method,
            path,
            timestamp: ts,
            blinded: false,
          });
          expect(headers['X-SOGS-Pubkey']).to.be.equal(
            '00bac6e71efd7dfa4a83c98ed24f254ab2c267f9ccdb172a5280a0444ad24e89cc'
          );
        });

        it('should produce correct X-SOGS-Timestamp', async () => {
          const headers = await getOpenGroupHeaders({
            signingKeys,
            serverPK,
            nonce,
            method,
            path,
            timestamp: ts,
            blinded: false,
          });
          expect(headers['X-SOGS-Timestamp']).to.be.equal('1642472103');
        });
        it('should produce correct X-SOGS-Signature without body', async () => {
          const headers = await getOpenGroupHeaders({
            signingKeys,
            serverPK,
            nonce,
            method,
            path,
            timestamp: ts,
            blinded: false,
          });
          expect(headers['X-SOGS-Signature']).to.be.equal(
            'xxLpXHbomAJMB9AtGMyqvBsXrdd2040y+Ol/IKzElWfKJa3EYZRv1GLO6CTLhrDFUwVQe8PPltyGs54Kd7O5Cg=='
          );
        });

        it('should produce correct X-SOGS-Signature with body', async () => {
          const headers = await getOpenGroupHeaders({
            signingKeys,
            serverPK,
            nonce,
            method,
            path,
            timestamp: ts,
            blinded: false,
            body,
          });
          expect(headers['X-SOGS-Signature']).to.be.equal(
            '2w9zMiGPqa3RApSpVbL0zhh7cUd6Z9skbZlf2XqyDTND2aDadGOAcKpXANcOSA+zi+kmgP8+zVkDdz0JOiB1Cw=='
          );
        });
      });

  });
});
