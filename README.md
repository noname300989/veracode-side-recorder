# Veracode SIDE Recorder 🚀

A professional recording and editing suite designed to capture Selenium IDE (`.side`) flows specifically optimized for **Veracode Dynamic Analysis**.

## Overview

This project provides two powerful ways to capture browser interactions and export them as Veracode-compliant `.side` files:

1.  **Chrome Extension**: A lightweight background recorder that captures interactions directly as you browse.
2.  **Electron App**: A standalone desktop editor and recorder with an embedded browser, allowing for deep inspection and manual adjustment of your Selenium scripts.

---

## 🛡️ Focused Command Set

To ensure high reliability in Dynamic Analysis, this recorder focuses on a strict subset of Selenium commands:

| Command | Description |
| :--- | :--- |
| `open` | Opens a target URL. |
| `click` | Records mouse clicks on elements. |
| `type` | Captures keyboard input (optimized for login forms). |
| `select` | Handles dropdown and list selections. |
| `check` / `uncheck` | Manages checkboxes and radio buttons. |
| `submit` | Explicitly captures form submissions. |
| `waitForPageToLoad` | Ensures the engine waits for navigation to complete. |

*Note: The Electron editor limits commands to those currently supported by Veracode, preventing the accidental addition of unsupported Selenium IDE operations.*

---

## 🛠️ Getting Started

### 🌐 Chrome Extension

Capture flows natively in your browser.

1.  Navigate to `chrome://extensions`.
2.  Enable **Developer mode** (top right).
3.  Click **Load unpacked** and select the `chrome-extension/` folder from this repository.
4.  Open your target application in Chrome.
5.  Launch the extension popup and click **Start Recording**.
6.  Perform your login/crawl steps and click **Export .side** when finished.

> [!TIP]
> For local `file://` pages, ensure you enable "Allow access to file URLs" in the extension settings.

### 💻 Electron Desktop App

A full-featured IDE for recording, importing, and editing Veracode-compatible scripts.

#### Prerequisites
- [Node.js](https://nodejs.org/) (LTS recommended)

#### Quick Start (Windows)
Double-click `open-electron-app.cmd` to automatically install dependencies and launch the app.

#### Manual Setup
1.  Open a terminal in the `electron-app/` directory.
2.  Install dependencies: `npm install`
3.  Start the application: `npm start`

---

## 📂 Project Structure

- `chrome-extension/`: Source code for the browser-based recorder.
- `electron-app/`: Source code for the desktop editor and embedded recorder.
- `shared/`: Shared logic for SIDE export and DOM utilities used by both components.

---

## ⚠️ Limits & Best Practices

- **Complex SPAs**: Single Page Applications with unconventional transitions may require manual `waitFor` commands.
- **SSO/Multi-Window**: Specialized authentication flows (e.g., pop-up based SSO) are best recorded using the Chrome Extension.
- **Validation**: We recommend adding a final `assertText` or `waitForElementPresent` command in the Electron editor to verify successful login states.

---

## 🤝 Contributing

This project is designed for security professionals and developers working with Veracode Dynamic Analysis. Contributions and feedback are welcome!
