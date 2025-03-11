// eslint:disable: no-require-imports no-var-requires
const { clipboard, ipcRenderer: ipc, webFrame } = require('electron/main');
const { Storage } = require('./ts/util/storage');

const { isTestNet, isTestIntegration } = require('./ts/shared/env_vars');

const os = require('os');
const url = require('url');

const _ = require('lodash');

const { setupI18n } = require('./ts/util/i18n/i18n');
const { UserUtils } = require('./ts/session/utils');
const { BlindingActions } = require('./ts/webworker/workers/browser/libsession_worker_interface');

const { crowdinLocale } = ipc.sendSync('locale-data');

const config = url.parse(window.location.toString(), true).query;
const configAny = config;

window.i18n = setupI18n({ crowdinLocale });

let title = config.name;
if (config.environment !== 'production') {
  title += ` - ${config.environment}`;
}
if (config.appInstance) {
  title += ` - ${config.appInstance}`;
}

window.platform = process.platform;
window.getTitle = () => title;
window.getEnvironment = () => configAny.environment;
window.getAppInstance = () => configAny.appInstance;
window.getVersion = () => configAny.version;
window.getCommitHash = () => configAny.commitHash;
window.getNodeVersion = () => configAny.node_version;
window.getOSRelease = () =>
  `${os.type()} ${os.release()}, Node.js ${config.node_version} ${os.platform()} ${os.arch()}`;
window.saveLog = additionalText => ipc.send('save-debug-log', additionalText);
window.getUserKeys = async () => {
  const pubkey = UserUtils.getOurPubKeyStrFromCache();
  const userEd25519SecretKey = (await UserUtils.getUserED25519KeyPairBytes())?.privKeyBytes;
  const blindedPkHex = await BlindingActions.blindVersionPubkey({
    ed25519SecretKey: userEd25519SecretKey,
  });

  return { id: pubkey, vbid: blindedPkHex };
};

window.sessionFeatureFlags = {
  useOnionRequests: true,
  useTestNet: isTestNet() || isTestIntegration(),
  useClosedGroupV2: false, // TODO DO NOT MERGE Remove after QA
  forceLegacyGroupsDeprecated: false, // TODO DO NOT MERGE Remove after QA
  useClosedGroupV2QAButtons: false, // TODO DO NOT MERGE Remove after QA
  replaceLocalizedStringsWithKeys: false,
  debug: {
    debugLogging: !_.isEmpty(process.env.SESSION_DEBUG),
    debugLibsessionDumps: !_.isEmpty(process.env.SESSION_DEBUG_LIBSESSION_DUMPS),
    debugBuiltSnodeRequests: !_.isEmpty(process.env.SESSION_DEBUG_BUILT_SNODE_REQUEST),
    debugFileServerRequests: false,
    debugNonSnodeRequests: false,
    debugOnionRequests: false,
  },
};

window.versionInfo = {
  environment: window.getEnvironment(),
  version: window.getVersion(),
  commitHash: window.getCommitHash(),
  appInstance: window.getAppInstance(),
};

window.updateZoomFactor = () => {
  const zoomFactor = window.getSettingValue('zoom-factor-setting') || 100;
  window.setZoomFactor(zoomFactor / 100);
};

window.setZoomFactor = number => {
  webFrame.setZoomFactor(number);
};

// Set the password for the database
window.setPassword = async (passPhrase, oldPhrase) =>
  new Promise((resolve, reject) => {
    ipc.once('set-password-response', (_event, response) => {
      if (!response) {
        // We don't reject here, but return undefined and handle the result in the caller.
        // The reason is because we sometimes want to reject, but sometimes not depending on what the caller is doing (set/change/remove)
        // For instance, removing a password makes `!response` true, and so we would reject here even if we
        // technically didn't have an reason to.
        return resolve(undefined);
      }
      return resolve(response);
    });
    ipc.send('set-password', passPhrase, oldPhrase);
  });

// called to verify that the password is correct when showing the recovery from seed modal
window.onTryPassword = async passPhrase =>
  new Promise((resolve, reject) => {
    ipc.once('password-recovery-phrase-response', (_event, error) => {
      if (error) {
        return reject(error);
      }
      return resolve();
    });
    ipc.send('password-recovery-phrase', passPhrase);
  });

window.setStartInTray = async startInTray =>
  new Promise((resolve, reject) => {
    ipc.once('start-in-tray-on-start-response', (_event, error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
      return;
    });
    ipc.send('start-in-tray-on-start', startInTray);
  });

window.getStartInTray = async () => {
  return new Promise(resolve => {
    ipc.once('get-start-in-tray-response', (_event, value) => {
      resolve(value);
    });
    ipc.send('get-start-in-tray');
  });
};

window.getOpengroupPruning = async () => {
  return new Promise(resolve => {
    ipc.once('get-opengroup-pruning-response', (_event, value) => {
      resolve(value);
    });
    ipc.send('get-opengroup-pruning');
  });
};

window.setOpengroupPruning = async opengroupPruning =>
  new Promise((resolve, reject) => {
    ipc.once('set-opengroup-pruning-response', (_event, error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
      return;
    });
    ipc.send('set-opengroup-pruning', opengroupPruning);
  });

window._ = require('lodash');

// We never do these in our code, so we'll prevent it everywhere
window.open = () => null;
// eslint-disable-next-line no-eval, no-multi-assign
window.eval = global.eval = () => null;

window.drawAttention = () => {
  // window.log.debug('draw attention');
  ipc.send('draw-attention');
};

window.showWindow = () => {
  window.log.info('show window');
  ipc.send('show-window');
};

window.setAutoHideMenuBar = autoHide => {
  ipc.send('set-auto-hide-menu-bar', autoHide);
};
window.setMenuBarVisibility = visibility => {
  ipc.send('set-menu-bar-visibility', visibility);
};

window.restart = () => {
  window.log.info('restart');
  ipc.send('restart');
};

window.closeAbout = () => {
  ipc.send('close-about');
};
window.readyForUpdates = () => {
  ipc.send('ready-for-updates');
};

ipc.on('get-theme-setting', () => {
  const theme = window.Events.getThemeSetting();
  ipc.send('get-success-theme-setting', theme);
});

window.getSettingValue = (settingID, comparisonValue = null) => {
  // Comparison value allows you to pull boolean values from any type.
  // Eg. window.getSettingValue('theme', 'classic-dark')
  // returns 'false' when the value is 'classic-light'.

  // We need to get specific settings from the main process
  if (settingID === 'media-permissions') {
    return window.getMediaPermissions();
  } else if (settingID === 'call-media-permissions') {
    return window.getCallMediaPermissions();
  } else if (settingID === 'auto-update') {
    return window.getAutoUpdateEnabled();
  }

  const settingVal = Storage.get(settingID);
  return comparisonValue ? !!settingVal === comparisonValue : settingVal;
};

window.setSettingValue = async (settingID, value) => {
  // For auto updating we need to pass the value to the main process
  if (settingID === 'auto-update') {
    window.setAutoUpdateEnabled(value);
    return;
  }

  await Storage.put(settingID, value);
};

window.getMediaPermissions = () => ipc.sendSync('get-media-permissions');
window.setMediaPermissions = value => {
  ipc.send('set-media-permissions', !!value);
};

window.getCallMediaPermissions = () => ipc.sendSync('get-call-media-permissions');
window.setCallMediaPermissions = value => {
  ipc.send('set-call-media-permissions', !!value);
};

window.askForMediaAccess = () => {
  ipc.send('media-access');
};

// Auto update setting
window.getAutoUpdateEnabled = () => ipc.sendSync('get-auto-update-setting');
window.setAutoUpdateEnabled = value => {
  ipc.send('set-auto-update-setting', !!value);
};

ipc.on('get-ready-for-shutdown', async () => {
  const { shutdown } = window.Events || {};
  if (!shutdown) {
    window.log.error('preload shutdown handler: shutdown method not found');
    ipc.send('now-ready-for-shutdown');
    return;
  }

  try {
    await shutdown();
    ipc.send('now-ready-for-shutdown');
  } catch (error) {
    ipc.send('now-ready-for-shutdown', error && error.stack ? error.stack : error);
  }
});

// We pull these dependencies in now, from here, because they have Node.js dependencies

require('./ts/util/logging');

if (config.proxyUrl) {
  window.log.info('Using provided proxy url');
}
window.nodeSetImmediate = setImmediate;

const data = require('./ts/data/dataInit');
data.initData();

const { ConvoHub } = require('./ts/session/conversations/ConversationController');
window.getConversationController = ConvoHub.use;

// Linux seems to periodically let the event loop stop, so this is a global workaround
setInterval(() => {
  window.nodeSetImmediate(() => {});
}, 1000);

window.clipboard = clipboard;

window.getSeedNodeList = () =>
  window.sessionFeatureFlags.useTestNet
    ? ['http://seed2.getsession.org:38157']
    : [
        // Note: for each of the seed nodes, the cert pinned is the one provided on the port 4443 and not the 4433, because the 4443 is a 10year one
        'https://seed1.getsession.org:4443/',
        'https://seed2.getsession.org:4443/',
        'https://seed3.getsession.org:4443/',
      ];

window.addEventListener('contextmenu', e => {
  const editable = e && e.target.closest('textarea, input, [contenteditable="true"]');
  const link = e && e.target.closest('a');
  const selection = Boolean(window && window.getSelection() && window.getSelection().toString());
  if (!editable && !selection && !link) {
    e.preventDefault();
  }
});
