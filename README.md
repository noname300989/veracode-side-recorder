# Veracode SIDE Recorder

A recorder and editor for Selenium IDE (`.side`) login and crawl flows that stays inside Veracode-accepted Selenium commands.

## Overview

This project includes two recorders:

1. A Chrome extension that records directly while you browse.
2. An Electron desktop app with an embedded browser recorder and editor.

The shared export logic keeps the generated `.side` files aligned with Veracode's enhanced authentication and automation workflow guidance.

## Supported Recording Subset

The recorder is intentionally narrow and focuses on the commands we want for Veracode login and crawl scripts:

- `open`
- `click`
- `type`
- `select`
- `check`
- `uncheck`
- `submit`
- `waitForPageToLoad`
- `waitForElementPresent`
- `verifyTextPresent`
- `pause`

`waitForElementVisible` is not auto-generated. Veracode guidance mentions it as an example, but the current supported-command table does not list it, so the recorder uses `waitForElementPresent` or `verifyTextPresent` instead.

## Export Modes

Two `.side` export modes are available:

- `Veracode .side`: converts recorded internal wait steps into `waitForPageToLoad`. Use this for Veracode Dynamic Analysis uploads.
- `Selenium IDE .side`: keeps recorded internal wait steps as `pause`. Use this if your Selenium IDE environment rejects `waitForPageToLoad`.

Both modes keep the same login flow structure:

1. `open`
2. page wait
3. `type` username, password, OTP, TOTP, or text CAPTCHA values
4. `click` or `submit`
5. page wait
6. `waitForElementPresent` or `verifyTextPresent`

## Chrome Extension

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click Load unpacked and select `chrome-extension/`.
4. Open the target application.
5. Start recording from the extension popup.
6. Run the login flow.
7. Export either `Veracode .side` or `Selenium IDE .side`.

For local `file://` pages, enable Allow access to file URLs in the extension settings.

## Electron Desktop App

Double-click `open-electron-app.cmd` on Windows to start the desktop app. The launcher can bootstrap the local Electron dependency if Node is already available.

If you prefer manual startup:

1. Open a terminal in `electron-app/`.
2. Run `npm install`.
3. Run `npm start`.

## Best Practices

- Prefer targets that resolve to `id=...` whenever the page exposes stable IDs.
- End login scripts with `waitForElementPresent` or `verifyTextPresent` so Veracode can confirm the signed-in state.
- Re-record if the target app uses a different login page for username and password so the `Next` click is captured as a separate step.
- Complex SSO, multi-window auth, and widget CAPTCHAs may still need manual review after recording.
