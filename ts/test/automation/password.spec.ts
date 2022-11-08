import { _electron, Page, test } from '@playwright/test';
import { sleepFor } from '../../session/utils/Promise';
import { beforeAllClean, forceCloseAllWindows } from './setup/beforeEach';
import { newUser } from './setup/new_user';
import { openAppAndWait } from './setup/open';
import {
  clickOnMatchingText,
  clickOnTestIdWithText,
  typeIntoInput,
  waitForMatchingText,
  waitForTestIdWithText,
} from './utils';
let window: Page | undefined;

test.beforeEach(beforeAllClean);

test.afterEach(async () => {
  if (window) {
    await forceCloseAllWindows([window]);
  }
});

const testPassword = '123456';
const newTestPassword = '789101112';

test.describe('Password checks', () => {
  test('Set Password', async () => {
    // open Electron
    window = await openAppAndWait('1');
    // Create user
    await newUser(window, 'userA');
    // Click on settings tab
    await clickOnTestIdWithText(window, 'settings-section');
    // Click on privacy
    await clickOnTestIdWithText(window, 'privacy-settings-menu-item');
    // Click set password
    await clickOnTestIdWithText(window, 'set-password-button');
    // Enter password
    await typeIntoInput(window, 'password-input', testPassword);
    // Confirm password
    await typeIntoInput(window, 'password-input-confirm', testPassword);
    // Click Done
    await clickOnMatchingText(window, 'Done');
    // Check toast notification
    await waitForTestIdWithText(
      window,
      'session-toast',
      'Your password has been set. Please keep it safe.'
    );
    // Click on settings tab
    await sleepFor(300);
    await clickOnTestIdWithText(window, 'settings-section');
    // Type password into input field

    await typeIntoInput(window, 'password-input', testPassword);

    // Click Done
    await clickOnMatchingText(window, 'Done');
    await clickOnTestIdWithText(window, 'settings-section');

    // Change password
    await clickOnTestIdWithText(window, 'change-password-settings-button', 'Change Password');

    console.warn('clicked Change Password');
    // Enter old password
    await typeIntoInput(window, 'password-input', testPassword);
    // Enter new password
    await typeIntoInput(window, 'password-input-confirm', newTestPassword);
    await window.keyboard.press('Tab');
    // Confirm new password
    await typeIntoInput(window, 'password-input-reconfirm', newTestPassword);
    // Press enter on keyboard
    await window.keyboard.press('Enter');
    // Check toast notification for 'changed password'
    await waitForTestIdWithText(
      window,
      'session-toast',
      'Your password has been changed. Please keep it safe.'
    );
  });
  test('Wrong password', async () => {
    // Check if incorrect password works
    window = await openAppAndWait('1');
    // Create user
    await newUser(window, 'userA');
    // Click on settings tab
    await clickOnTestIdWithText(window, 'settings-section');
    // Click on privacy
    await clickOnMatchingText(window, 'Privacy');
    // Click set password
    await clickOnMatchingText(window, 'Set Password');
    // Enter password
    await typeIntoInput(window, 'password-input', testPassword);
    // Confirm password
    await typeIntoInput(window, 'password-input-confirm', testPassword);
    // Click Done
    await window.keyboard.press('Enter');
    // // Click on settings tab
    await sleepFor(100);
    await clickOnTestIdWithText(window, 'settings-section');

    // Type password into input field
    await sleepFor(100);
    await typeIntoInput(window, 'password-input', testPassword);
    // Click Done
    await clickOnMatchingText(window, 'Done');
    await sleepFor(100);
    await window.mouse.click(0, 0);
    await clickOnTestIdWithText(window, 'message-section');
    await sleepFor(100);

    // // Click on settings tab
    await sleepFor(1000);
    await clickOnTestIdWithText(window, 'settings-section');
    // // Try with incorrect password
    await typeIntoInput(window, 'password-input', '000000');
    // Confirm
    await clickOnMatchingText(window, 'Done');
    // // invalid password banner showing?
    await waitForMatchingText(window, 'Invalid password');
    // // Empty password
    // // Navigate away from settings tab
    await window.mouse.click(0, 0);
    await sleepFor(100);
    await clickOnTestIdWithText(window, 'message-section');
    await sleepFor(100);
    // // Click on settings tab
    await clickOnTestIdWithText(window, 'settings-section');
    // // No password entered
    await clickOnMatchingText(window, 'Done');
    // // Banner should ask for password to be entered
    await waitForMatchingText(window, 'Enter password');
  });
});
