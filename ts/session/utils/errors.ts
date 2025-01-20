import { Response } from 'node-fetch';

export class EmptySwarmError extends Error {
  public error: any;
  public pubkey: string;
  constructor(pubkey: string, message: string) {
    // 'Error' breaks prototype chain here
    super(message);
    this.pubkey = pubkey.split('.')[0];
    this.name = 'EmptySwarmError';

    // restore prototype chain
    const actualProto = new.target.prototype;

    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    }
    // Maintains proper stack trace, where our error was thrown (only available on V8)
    //   via https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this);
    }
  }
}

export class NotFoundError extends Error {
  public error: any;
  constructor(message: string, error?: any) {
    // 'Error' breaks prototype chain here
    super(message);
    this.error = error;
    this.name = 'NotFoundError';

    // restore prototype chain
    const actualProto = new.target.prototype;

    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    }
    // Maintains proper stack trace, where our error was thrown (only available on V8)
    //   via https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this);
    }
  }
}

export class HTTPError extends Error {
  public response: Response;
  constructor(message: string, response: Response) {
    // 'Error' breaks prototype chain here
    super(`${response.status} Error: ${message}`);
    this.response = response;
    this.name = 'HTTPError';

    // restore prototype chain
    const actualProto = new.target.prototype;

    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    }
    // Maintains proper stack trace, where our error was thrown (only available on V8)
    //   via https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this);
    }
  }
}

class BaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // restore prototype chain
    Object.setPrototypeOf(this, SnodeResponseError.prototype);
  }
}

export class SigningFailed extends BaseError {}
export class InvalidSigningType extends BaseError {}
export class GroupV2SigningFailed extends SigningFailed {}
export class PreConditionFailed extends BaseError {}
export class DecryptionFailed extends BaseError {}
export class InvalidMessage extends BaseError {}
export class SnodeResponseError extends BaseError {
  constructor(message = 'sessionRpc could not talk to node') {
    super(message);
  }
}
export class RetrieveDisplayNameError extends Error {
  constructor(message = 'failed to retrieve display name after setting it') {
    super(message);
    // restore prototype chain
    Object.setPrototypeOf(this, SnodeResponseError.prototype);
  }
}

export class AttachmentDecryptError extends Error {
  constructor(message = 'failed to decrypt attachment') {
    super(message);
    // restore prototype chain
    Object.setPrototypeOf(this, SnodeResponseError.prototype);
  }
}
