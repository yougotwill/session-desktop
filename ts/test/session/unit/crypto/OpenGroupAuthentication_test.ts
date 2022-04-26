import chai, { assert, expect } from 'chai';
import * as sinon from 'sinon';
import chaiBytes from 'chai-bytes';
import {
  decryptBlindedMessage,
  encryptBlindedMessage,
  getOpenGroupHeaders,
} from '../../../../session/apis/open_group_api/opengroupV2/OpenGroupAuthentication';
import { ByteKeyPair } from '../../../../session/utils/User';
import {
  decodeV4Response,
  encodeV4Request,
} from '../../../../session/apis/open_group_api/opengroupV2/OpenGroupPollingUtils';
import { to_hex } from 'libsodium-wrappers-sumo';

chai.use(chaiBytes);

// tslint:disable-next-line: max-func-body-length
describe('OpenGroupAuthentication', () => {
  const sandbox = sinon.createSandbox();
  const signingKeysA: ByteKeyPair = {
    privKeyBytes: new Uint8Array([
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
    pubKeyBytes: new Uint8Array([
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

  const signingKeysB: ByteKeyPair = {
    privKeyBytes: new Uint8Array([
      130,
      56,
      83,
      227,
      58,
      149,
      251,
      148,
      119,
      85,
      180,
      81,
      17,
      190,
      245,
      33,
      219,
      6,
      246,
      238,
      110,
      61,
      191,
      133,
      244,
      223,
      32,
      32,
      121,
      172,
      138,
      198,
      215,
      25,
      249,
      139,
      235,
      31,
      251,
      12,
      100,
      87,
      84,
      131,
      231,
      45,
      87,
      251,
      204,
      133,
      20,
      3,
      118,
      71,
      29,
      47,
      245,
      62,
      216,
      163,
      254,
      248,
      195,
      109,
    ]),
    pubKeyBytes: new Uint8Array([
      215,
      25,
      249,
      139,
      235,
      31,
      251,
      12,
      100,
      87,
      84,
      131,
      231,
      45,
      87,
      251,
      204,
      133,
      20,
      3,
      118,
      71,
      29,
      47,
      245,
      62,
      216,
      163,
      254,
      248,
      195,
      109,
    ]),
  };

  const serverPubKey = new Uint8Array([
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

  // const body = 'This is a test message body 12345';
  const body = 'hello 🎂';

  const postDataToEncoded =
    '{"method":"POST","endpoint":"/room/test-room/pin/123","headers":{"Content-Type":"application/json"}}';

  const getDataToEncode = '{"method":"GET","endpoint":"/room/test-room"}';
  const responseToDecode = `l129:{"code":200,"headers":{"content-type":"application/octet-stream","content-disposition":"attachment;filename*=UTF-8''myfile.txt"}}11:hello worlde`;

  // const expectedResponseMeta = {
  //   code: 200,
  //   headers: {
  //     'content-type': 'application/octet-stream',
  //     'content-disposition': "attachment;filename*=UTF-8''myfile.txt",
  //   },
  // };
  // const expectedResponseBody = 'hello world';

  afterEach(() => {
    sandbox.restore();
  });

  describe('HeaderCreation', () => {
    describe('Blinded Headers', () => {
      it('should produce correct X-SOGS-Nonce', async () => {
        const headers = await getOpenGroupHeaders({
          signingKeys: signingKeysA,
          serverPK: serverPubKey,
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
          signingKeys: signingKeysA,
          serverPK: serverPubKey,
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
          signingKeys: signingKeysA,
          serverPK: serverPubKey,
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
          signingKeys: signingKeysA,
          serverPK: serverPubKey,
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
          signingKeys: signingKeysA,
          serverPK: serverPubKey,
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
          signingKeys: signingKeysA,
          serverPK: serverPubKey,
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
          signingKeys: signingKeysA,
          serverPK: serverPubKey,
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
          signingKeys: signingKeysA,
          serverPK: serverPubKey,
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
          signingKeys: signingKeysA,
          serverPK: serverPubKey,
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
          signingKeys: signingKeysA,
          serverPK: serverPubKey,
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

  describe('Blinded Message Encryption', () => {
    it('Should encrypt blinded message correctly', async () => {
      const data = await encryptBlindedMessage(body, signingKeysA, signingKeysB, serverPubKey);
      if (data) {
        const decrypted = await decryptBlindedMessage(
          data,
          signingKeysA,
          signingKeysB,
          serverPubKey
        );
        expect(decrypted?.messageText).to.be.equal(body);
        expect(decrypted?.senderED25519PubKey).to.be.equal(to_hex(signingKeysA.pubKeyBytes));
      }
    });
  });

  describe('Message Decryption', () => {});

  describe('V4Requests', () => {
    it('Should bencode POST/PUT request with body successfully', () => {
      // TODO: update input and expected output
      // const bencoded = encodeV4Request(postDataToEncoded);
      // expect(bencoded).to.be.equal(
      //   'l100:{"method":"POST","endpoint":"/room/test-room/pin/123","headers":{"Content-Type":"application/json"}}2:{}e'
      // );
    });

    it('Should bencode GET request without body successfully', () => {
      // TODO: change ot accept request info and expect uint8 array output
      // const bencoded = encodeV4Request(getDataToEncode);
      // expect(bencoded).to.be.equal('l45:{"method":"GET","endpoint":"/room/test-room"}e');
    });

    it('Should decode bencoded response successfully', () => {
      // TODO: update input and expected output
      // const bencoded = decodeV4Response(responseToDecode);
      // console.warn({ bencoded });
    });
  });
});
