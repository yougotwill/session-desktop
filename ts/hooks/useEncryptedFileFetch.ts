import { useCallback, useEffect, useState } from 'react';

import {
  getAlreadyDecryptedMediaUrl,
  getDecryptedMediaUrl,
} from '../session/crypto/DecryptedAttachmentsManager';
import { perfEnd, perfStart } from '../session/utils/Performance';

export const useEncryptedFileFetch = (
  url: string | undefined,
  contentType: string,
  isAvatar: boolean,
  timestamp?: number
) => {
  const [urlToLoad, setUrlToLoad] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const alreadyDecrypted = url ? getAlreadyDecryptedMediaUrl(url) : '';

  const fetchUrl = useCallback(
    async (mediaUrl: string | undefined) => {
      if (alreadyDecrypted || !mediaUrl) {
        window.log.debug(
          `WIP: [Image] timestamp ${timestamp} alreadyDecrypted ${alreadyDecrypted !== '' ? alreadyDecrypted : 'empty'} mediaUrl ${mediaUrl !== '' ? mediaUrl : 'empty'}`
        );

        if (alreadyDecrypted) {
          setUrlToLoad(alreadyDecrypted);
          setLoading(false);
        }
        return;
      }

      setLoading(true);

      try {
        perfStart(`getDecryptedMediaUrl-${mediaUrl}`);
        const decryptedUrl = await getDecryptedMediaUrl(mediaUrl, contentType, isAvatar);
        perfEnd(`getDecryptedMediaUrl-${mediaUrl}`, `getDecryptedMediaUrl-${mediaUrl}`);
        window.log.debug(
          `WIP: [Image] timestamp ${timestamp} decryptedUrl ${decryptedUrl !== '' ? decryptedUrl : 'empty'}`
        );

        setUrlToLoad(decryptedUrl);
      } catch (error) {
        window.log.error(`WIP: [Image] timestamp ${timestamp} error ${error}`);
        setUrlToLoad('');
      } finally {
        setLoading(false);
      }
    },
    [alreadyDecrypted, contentType, isAvatar, timestamp]
  );

  useEffect(() => {
    void fetchUrl(url);
  }, [fetchUrl, url]);

  return { urlToLoad, loading };
};
