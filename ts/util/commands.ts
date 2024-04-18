import { shell } from 'electron';

export function openReleaseNotes(appVersion: string) {
  void shell.openExternal(`https://github.com/oxen-io/session-desktop/releases/tag/v${appVersion}`);
}

export function openSupportPage() {
  void shell.openExternal('https://docs.oxen.io/products-built-on-oxen/session');
}
