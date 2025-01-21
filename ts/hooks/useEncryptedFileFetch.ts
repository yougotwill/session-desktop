import { useCallback, useEffect, useState } from 'react';

import { DecryptedAttachmentsManager } from '../session/crypto/DecryptedAttachmentsManager';
import { AttachmentDecryptError } from '../session/utils/errors';

export const useEncryptedFileFetch = (
  /** undefined if the message is not visible yet, url is '' if visible but we have not tried to decrypt yet */
  url: string | undefined,
  contentType: string,
  isAvatar: boolean,
  pending?: boolean
): {
  urlToLoad: string | undefined;
  loading: boolean;
  failed: boolean;
} => {
  const [urlToLoad, setUrlToLoad] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);

  const alreadyDecrypted = DecryptedAttachmentsManager.getAlreadyDecryptedMediaUrl(url || '');

  const fetchUrl = useCallback(
    async (mediaUrl: string | undefined) => {
      try {
        if (alreadyDecrypted) {
          setUrlToLoad(alreadyDecrypted);
          setLoading(false);
          window.log.debug(`WIP: [useEncryptedFileFetch] alreadyDecrypted ${alreadyDecrypted}`);
          return;
        }

        // not visible yet
        if (mediaUrl === undefined) {
          window.log.debug(`WIP: [useEncryptedFileFetch] not visible yet`);
          return;
        }

        if (!waiting) {
          setWaiting(true);
          window.log.debug(
            `WIP: [useEncryptedFileFetch]  mediaUrl is defined and now we wait for decryption`
          );
          return;
        }

        if (!mediaUrl && waiting) {
          return;
        }

        if (!mediaUrl) {
          window.log.debug(
            `WIP: [useEncryptedFileFetch] we are no longer waiting but mediaUrl is defined so throw error`
          );
          throw new AttachmentDecryptError();
        }

        const decryptedUrl = await DecryptedAttachmentsManager.getDecryptedMediaUrl(
          mediaUrl,
          contentType,
          isAvatar
        );

        if (!decryptedUrl) {
          window.log.error(`WIP: [useEncryptedFileFetch] !decryptedUrl throwing error`);
          throw new AttachmentDecryptError();
        }

        setUrlToLoad(decryptedUrl);
        window.log.debug(`WIP: [useEncryptedFileFetch] decryptedUrl ${decryptedUrl}`);

        setLoading(false);
      } catch (error) {
        setFailed(true);
        setUrlToLoad('');
        setWaiting(false);
        setLoading(false);
      }
    },
    [alreadyDecrypted, contentType, isAvatar, waiting]
  );

  useEffect(() => {
    void fetchUrl(url);
  }, [fetchUrl, url]);

  useEffect(() => {
    if (urlToLoad && waiting && !pending) {
      setWaiting(false);
    }
  }, [pending, urlToLoad, waiting]);

  return {
    urlToLoad,
    loading,
    failed,
  };
};
