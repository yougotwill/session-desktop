// tslint:disable: no-implicit-dependencies max-func-body-length no-unused-expression
import { expect } from 'chai';
import Sinon from 'sinon';
import * as _ from 'lodash';
import { parseCapabilities } from '../../../../session/apis/open_group_api/sogsv3/sogsV3Capabilities';
// tslint:disable: chai-vague-errors

describe('FetchCapabilities', () => {
  beforeEach(() => {});

  afterEach(() => {
    Sinon.restore();
  });

  describe('parseCapabilities', () => {
    it('return null if null is given as body', () => {
      expect(parseCapabilities(null)).to.be.eq(null);
    });

    it('return null if undefined is given as body', () => {
      expect(parseCapabilities(undefined)).to.be.eq(null);
    });

    it('return [] if given empty array valid', () => {
      expect(parseCapabilities({ capabilities: [] })).to.be.deep.eq([]);
    });

    it('return null if given null array ', () => {
      expect(parseCapabilities({ capabilities: null })).to.be.deep.eq(null);
    });

    it('return null if given string instead of object  ', () => {
      expect(parseCapabilities('')).to.be.deep.eq(null);
    });

    it('return null if given object without cap field  ', () => {
      expect(parseCapabilities({ plop: [] })).to.be.deep.eq(null);
    });

    it('return valid if given one cap ', () => {
      expect(parseCapabilities({ capabilities: ['sogs'] })).to.be.deep.eq(['sogs']);
    });

    it('return valid if given two caps ', () => {
      expect(parseCapabilities({ capabilities: ['blinded', 'sogs'] })).to.be.deep.eq([
        'blinded',
        'sogs',
      ]);
    });

    it('return valid if given two caps, sorted ', () => {
      expect(
        parseCapabilities({
          capabilities: ['sogs', 'blinded'],
        })
      ).to.be.deep.eq(['blinded', 'sogs']);
    });
  });

  it.skip('getCapabilitiesFromBatch', () => {});
});
