const seconds = 1000;
const minutes = seconds * 60;
const hours = minutes * 60;
const days = hours * 24;

/** in milliseconds */
export const DURATION = {
  /** 1000ms */
  SECONDS: seconds,
  /** 60 * 1000 = 60,000 ms */
  MINUTES: minutes,
  /** 60 * 60 * 1000 = 3,600,000 ms */
  HOURS: hours,
  /** 24 * 60 * 60 * 1000 = 86,400,000 ms */
  DAYS: days,
  /** 7 * 24 * 60 * 60 * 1000 = 604,800,000 ms */
  WEEKS: days * 7,
};

export const DURATION_SECONDS = {
  /** 1s */
  SECONDS: Math.floor(DURATION.SECONDS / 1000),
  /** 60s */
  MINUTES: Math.floor(DURATION.MINUTES / 1000),
  /** 60 * 60 = 3,600s */
  HOURS: Math.floor(DURATION.HOURS / 1000),
  /** 24 * 60 * 60 = 86,400s */
  DAYS: Math.floor(DURATION.DAYS / 1000),
  /** 7 * 24 * 60 * 60  = 604,800s */
  WEEKS: Math.floor(DURATION.WEEKS / 1000),
};

export const FILESIZE = {
  /** 1KB */
  KB: 1024,
  /** 1MB */
  MB: 1024 * 1024,
  /** 1GB */
  GB: 1024 * 1024 * 1024,
};

export const TTL_DEFAULT = {
  /** 20 seconds */
  TYPING_MESSAGE: 20 * DURATION.SECONDS,
  /** 5 minutes */
  CALL_MESSAGE: 5 * 60 * DURATION.SECONDS,
  /** 14 days */
  CONTENT_MESSAGE: 14 * DURATION.DAYS,
  /** 30 days */
  CONFIG_MESSAGE: 30 * DURATION.DAYS,
};

export const SWARM_POLLING_TIMEOUT = {
  /** 5 seconds */
  ACTIVE: DURATION.SECONDS * 5,
  /** 1 minute */
  MEDIUM_ACTIVE: DURATION.SECONDS * 60,
  /** 2 minutes */
  INACTIVE: DURATION.SECONDS * 120,
};

export const PROTOCOLS = {
  HTTP: 'http:',
  HTTPS: 'https:',
};

// User Interface
export const CONVERSATION = {
  DEFAULT_MEDIA_FETCH_COUNT: 50,
  DEFAULT_DOCUMENTS_FETCH_COUNT: 100,
  DEFAULT_MESSAGE_FETCH_COUNT: 30,
  MAX_MESSAGE_FETCH_COUNT: 1000,
  // Maximum voice message duration of 5 minutes
  // which equates to 1.97 MB
  MAX_VOICE_MESSAGE_DURATION: 300,
  MAX_CONVO_UNREAD_COUNT: 999,
  MAX_GLOBAL_UNREAD_COUNT: 99, // the global one does not look good with 4 digits (999+) so we have a smaller one for it
  /** NOTE some existing groups might not have joinedAtSeconds and we need a fallback value that is not falsy in order to poll and show up in the conversations list */
  LAST_JOINED_FALLBACK_TIMESTAMP: 1,
  /**
   * the maximum chars that can be typed/pasted in the composition box.
   * Same as android.
   */
  MAX_MESSAGE_CHAR_COUNT: 2000,
} as const;

/**
 * The file server and onion request max upload size is 10MB precisely.
 * 10MB is still ok, but one byte more is not.
 */
export const MAX_ATTACHMENT_FILESIZE_BYTES = 10 * 1000 * 1000;

export const VALIDATION = {
  CLOSED_GROUP_SIZE_LIMIT: 100,
};

export const DEFAULT_RECENT_REACTS = ['😂', '🥰', '😢', '😡', '😮', '😈'];
export const REACT_LIMIT = 6;

export const UPDATER_INTERVAL_MS = 10 * DURATION.MINUTES;

/**
 * Start create groups as new at this time (currently Thursday March 20th 09:00 AEDT)
 */
const START_CREATE_NEW_GROUP = 1742421600000;

/**
 * Mark legacy groups readonly at this time (currently Thursday April 3rd 09:00 AEDT)
 */
const LEGACY_GROUP_READONLY = 1743631200000;

export const FEATURE_RELEASE_TIMESTAMPS = {
  DISAPPEARING_MESSAGES_V2: 1710284400000, // 13/03/2024 10:00 Melbourne time
  USER_CONFIG: 1690761600000, // Monday July 31st at 10am Melbourne time
  START_CREATE_NEW_GROUP,
  LEGACY_GROUP_READONLY,
};

export const ONBOARDING_TIMES = {
  /** 15 seconds */
  RECOVERY_TIMEOUT: 15 * DURATION.SECONDS,
  /** 0.3 seconds */
  RECOVERY_FINISHING: 0.3 * DURATION.SECONDS,
  /** 0.2 seconds */
  RECOVERY_FINISHED: 0.2 * DURATION.SECONDS,
};

export const PASSWORD_LENGTH = {
  /**
   * 6 chars
   */
  MIN_PASSWORD_LEN: 6,
  /**
   * 64 chars
   */
  MAX_PASSWORD_LEN: 64,
};
