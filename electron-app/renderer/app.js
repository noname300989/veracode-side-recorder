var state = {
  recording: VeracodeSide.createRecording({
    metadata: {
      source: "electron-app"
    }
  }),
  isRecording: true,
  runtime: {
    pendingNavigation: false,
    lastKnownUrl: "",
    manualNavigationPending: false,
    authVerificationPending: false,
    lastActionAt: 0,
    lastClickSignature: ""
  }
};

var INJECTED_RECORDER_PREFIX = "__VSR__";

var elements = {
  projectName: document.getElementById("projectName"),
  testName: document.getElementById("testName"),
  baseUrl: document.getElementById("baseUrl"),
  startRecording: document.getElementById("startRecording"),
  stopRecording: document.getElementById("stopRecording"),
  newRecording: document.getElementById("newRecording"),
  importFile: document.getElementById("importFile"),
  exportVeracodeSide: document.getElementById("exportVeracodeSide"),
  exportSeleniumIdeSide: document.getElementById("exportSeleniumIdeSide"),
  exportJson: document.getElementById("exportJson"),
  addCommand: document.getElementById("addCommand"),
  commandRows: document.getElementById("commandRows"),
  statusText: document.getElementById("statusText"),
  addressInput: document.getElementById("addressInput"),
  goButton: document.getElementById("goButton"),
  autoCommands: document.getElementById("autoCommands"),
  recorderView: document.getElementById("recorderView")
};

function isRecordableUrl(url) {
  return /^https?:|^file:/i.test(String(url || ""));
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function debounce(callback, waitMs) {
  var timeoutId = null;
  return function () {
    var args = arguments;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(function () {
      callback.apply(null, args);
    }, waitMs);
  };
}

function updateRecordingMeta() {
  state.recording.projectName = elements.projectName.value || "Veracode Recording";
  state.recording.testName = elements.testName.value || "Recorded Flow";
  state.recording.baseUrl = elements.baseUrl.value || "";
}

function appendCommand(commandInput) {
  var command = VeracodeSide.createCommand(commandInput);
  var commands = state.recording.commands;
  var lastCommand = commands[commands.length - 1];
  var signature = command.command + "|" + command.target + "|" + command.value;
  var now = Date.now();

  if (
    command.command === "click" &&
    state.runtime.lastClickSignature === signature &&
    now - state.runtime.lastActionAt < 500
  ) {
    return;
  }

  if (
    lastCommand &&
    lastCommand.target === command.target &&
    ["type", "select", "check", "uncheck"].indexOf(lastCommand.command) >= 0 &&
    ["type", "select", "check", "uncheck"].indexOf(command.command) >= 0
  ) {
    commands[commands.length - 1] = command;
  } else if (
    lastCommand &&
    lastCommand.command === command.command &&
    lastCommand.target === command.target &&
    lastCommand.value === command.value &&
    (command.command === "waitForPageToLoad" || command.command === "pause")
  ) {
    return;
  } else {
    commands.push(command);
  }

  state.runtime.lastActionAt = now;
  if (command.command === "click") {
    state.runtime.lastClickSignature = signature;
  }
}

function ensureOpenSequence(url) {
  if (!url) {
    return;
  }

  updateRecordingMeta();

  if (!state.recording.baseUrl) {
    state.recording.baseUrl = VeracodeSide.normalizeBaseUrl(url);
    elements.baseUrl.value = state.recording.baseUrl;
  }

  if (!state.recording.commands.length) {
    appendCommand({
      command: "open",
      target: VeracodeSide.toOpenTarget(url, state.recording.baseUrl),
      value: "",
      targets: []
    });
    appendCommand({
      command: "pause",
      target: VeracodeSide.DEFAULT_PAUSE_MS,
      value: "",
      targets: []
    });
  }

  state.runtime.lastKnownUrl = url;
}

function setStatus(message) {
  var summary = VeracodeSide.summarize(state.recording);
  var exportIssues = VeracodeSide.collectExportIssues(state.recording, {
    waitMode: VeracodeSide.EXPORT_WAIT_MODE_VERACODE
  });
  elements.statusText.textContent =
    message +
    " " +
    summary.totalCommands +
    " commands in the current recording." +
    (exportIssues.length ? " Veracode export check: " + exportIssues[0] : "");
}

function renderCommandRows() {
  var commands = state.recording.commands;

  elements.commandRows.innerHTML = commands.length
    ? commands
        .map(function (command, index) {
          return (
            "<tr>" +
            "<td><select data-field=\"command\" data-index=\"" + index + "\">" +
            VeracodeSide.SUPPORTED_COMMANDS.map(function (candidate) {
              return "<option value=\"" + escapeHtml(candidate) + "\"" + (candidate === command.command ? " selected" : "") + ">" + escapeHtml(candidate) + "</option>";
            }).join("") +
            "</select></td>" +
            "<td><input data-field=\"target\" data-index=\"" + index + "\" value=\"" + escapeHtml(command.target) + "\" /></td>" +
            "<td><input data-field=\"value\" data-index=\"" + index + "\" value=\"" + escapeHtml(command.value) + "\" /></td>" +
            "<td class=\"table-actions\"><button data-action=\"delete\" data-index=\"" + index + "\">Delete</button></td>" +
            "</tr>"
          );
        })
        .join("")
    : "<tr><td colspan=\"4\">No commands recorded yet.</td></tr>";
}

function render() {
  elements.projectName.value = state.recording.projectName || "";
  elements.testName.value = state.recording.testName || "";
  elements.baseUrl.value = state.recording.baseUrl || "";
  renderCommandRows();
  elements.startRecording.disabled = state.isRecording;
  elements.stopRecording.disabled = !state.isRecording;
  setStatus(state.isRecording ? "Embedded recorder is active." : "Embedded recorder is idle.");
}

function sendRecorderState(enabled) {
  if (elements.recorderView && elements.recorderView.send) {
    elements.recorderView.send("recorder-control", {
      type: "set-recording",
      enabled: enabled
    });
  }
}

function startInAppRecording() {
  state.isRecording = true;
  var currentUrl = elements.recorderView.getURL();
  if (isRecordableUrl(currentUrl)) {
    ensureOpenSequence(currentUrl);
  }
  sendRecorderState(true);
  render();
}

function stopInAppRecording() {
  state.isRecording = false;
  state.runtime.pendingNavigation = false;
  sendRecorderState(false);
  render();
}

function resetRecording() {
  state.recording = VeracodeSide.createRecording({
    metadata: {
      source: "electron-app",
      createdAt: new Date().toISOString()
    }
  });
  state.runtime.pendingNavigation = false;
  state.runtime.lastKnownUrl = "";
  state.runtime.manualNavigationPending = false;
  state.runtime.authVerificationPending = false;
  render();
}

async function importFile() {
  var result = await window.recorderApp.openFile();
  if (!result) {
    return;
  }

  try {
    state.recording = VeracodeSide.parseRecordingText(result.content);
    state.recording.metadata = Object.assign({}, state.recording.metadata, {
      source: "imported-file",
      importedFile: result.fileName
    });
    render();
    setStatus("Imported " + result.fileName + ".");
  } catch (error) {
    setStatus("Import failed: " + error.message);
  }
}

async function saveRecording(format) {
  updateRecordingMeta();

  var content = "";

  try {
    content = format === "side-veracode"
      ? VeracodeSide.exportSideText(state.recording, {
          waitMode: VeracodeSide.EXPORT_WAIT_MODE_VERACODE
        })
      : format === "side-selenium-ide"
      ? VeracodeSide.exportSideText(state.recording, {
          waitMode: VeracodeSide.EXPORT_WAIT_MODE_SELENIUM_IDE
        })
      : VeracodeSide.exportRecordingText(state.recording);
  } catch (error) {
    setStatus("Export blocked: " + error.message);
    return;
  }

  var filename = format === "side-veracode"
    ? "veracode-recording-veracode.side"
    : format === "side-selenium-ide"
    ? "veracode-recording-selenium-ide.side"
    : "veracode-recording.json";

  var result = await window.recorderApp.saveFile({
    defaultPath: filename,
    content: content,
    filters: format === "side-veracode" || format === "side-selenium-ide"
      ? [{ name: "SIDE Files", extensions: ["side"] }]
      : [{ name: "JSON Files", extensions: ["json"] }]
  });

  if (result) {
    setStatus("Saved " + result.filePath + ".");
  }
}

function hasAuthField(payload) {
  var candidates = [String(payload && payload.target || "").toLowerCase()];
  (Array.isArray(payload && payload.targets) ? payload.targets : []).forEach(function (candidate) {
    if (Array.isArray(candidate) && candidate[0]) {
      candidates.push(String(candidate[0]).toLowerCase());
    }
  });

  return candidates.some(function (value) {
    return /user|email|login|pass|password|otp|totp|captcha|code|pin|signin|sign-in/.test(value);
  });
}

async function collectLoginVerification() {
  if (!elements.recorderView || !elements.recorderView.executeJavaScript) {
    return false;
  }

  var script = `
    (() => {
      const buildLocatorBundle = (element) => {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
          return null;
        }
        const targets = [];
        let primary = "";
        if (element.id) {
          primary = "id=" + element.id;
          targets.push([primary, "id"]);
        }
        if (element.name) {
          targets.push(["name=" + element.name, "name"]);
          if (!primary) {
            primary = "name=" + element.name;
          }
        }
        if (!primary) {
          return null;
        }
        return { primary, targets };
      };

      const pageText = document.body && document.body.innerText ? document.body.innerText : "";
      const textCandidates = [
        "Sign Off",
        "Sign Out",
        "Logout",
        "Log Out",
        "Welcome",
        "My Account",
        "Account Summary",
        "Transfer Funds",
        "View Account Summary"
      ].filter((candidate) => pageText.indexOf(candidate) >= 0);

      if (textCandidates.length) {
        return {
          command: "verifyTextPresent",
          target: textCandidates[0],
          targets: [[textCandidates[0], "text"]],
          value: ""
        };
      }

      const selectors = [
        "a[href*='logout']",
        "a[href*='signoff']",
        "a[href*='signout']",
        "form[action*='logout']",
        "[id*='logout']",
        "[name*='logout']"
      ];

      for (let index = 0; index < selectors.length; index += 1) {
        const element = document.querySelector(selectors[index]);
        const locator = buildLocatorBundle(element);
        if (locator) {
          return {
            command: "waitForElementPresent",
            target: locator.primary,
            targets: locator.targets,
            value: ""
          };
        }
      }

      return null;
    })();
  `;

  try {
    var response = await elements.recorderView.executeJavaScript(script);
    if (!response || !response.command) {
      return false;
    }

    appendCommand({
      command: response.command,
      target: response.target,
      targets: response.targets,
      value: response.value
    });
    return true;
  } catch (_error) {
    return false;
  }
}

function navigateFromAddressBar() {
  var url = elements.addressInput.value.trim();
  if (!url) {
    return;
  }

  if (!/^https?:|^file:/i.test(url)) {
    url = "https://" + url;
  }

  state.runtime.manualNavigationPending = true;
  elements.recorderView.src = url;
}

function handleWebviewRecorderEvent(payload) {
  if (!state.isRecording || !isRecordableUrl(elements.recorderView.getURL())) {
    return;
  }

  ensureOpenSequence(elements.recorderView.getURL());

  appendCommand({
    command: payload.command,
    target: payload.target,
    targets: payload.targets,
    value: payload.value
  });

  if (payload.expectsNavigation) {
    state.runtime.pendingNavigation = true;
  }

  if (hasAuthField(payload)) {
    state.runtime.authVerificationPending = true;
  }

  render();
}

function installFallbackRecorder() {
  if (!elements.recorderView || !elements.recorderView.executeJavaScript) {
    return;
  }

  var script = `
    (() => {
      if (window.__veracodeSideRecorderInstalled) {
        return;
      }
      window.__veracodeSideRecorderInstalled = true;

      const PREFIX = "${INJECTED_RECORDER_PREFIX}";
      const pendingTextCaptures = new WeakMap();

      const send = (payload) => {
        try {
          console.debug(PREFIX + JSON.stringify(payload));
        } catch (_error) {}
      };

      const stringValue = (value) => String(value == null ? "" : value).trim();
      const isHtmlElement = (element) => !!(element && element.nodeType === Node.ELEMENT_NODE);
      const cssEscape = (value) => {
        if (typeof CSS !== "undefined" && CSS.escape) {
          return CSS.escape(value);
        }
        return String(value).replace(/[^a-zA-Z0-9_\\u00A0-\\uFFFF-]/g, (character) => "\\\\" + character);
      };
      const uniqueSelector = (selector) => {
        try {
          return document.querySelectorAll(selector).length === 1;
        } catch (_error) {
          return false;
        }
      };
      const hasUsefulAttribute = (element, attributeName) => {
        const value = stringValue(element.getAttribute(attributeName));
        return value && value.length <= 200;
      };
      const buildCssSelector = (element) => {
        if (!isHtmlElement(element)) {
          return "";
        }
        if (element.id) {
          return "#" + cssEscape(element.id);
        }
        const directAttributes = ["data-testid", "data-test", "data-qa", "aria-label", "name"];
        for (let index = 0; index < directAttributes.length; index += 1) {
          const attributeName = directAttributes[index];
          if (hasUsefulAttribute(element, attributeName)) {
            const selector = element.tagName.toLowerCase() + "[" + attributeName + "=\\"" + element.getAttribute(attributeName).replace(/"/g, "\\\\\\"") + "\\"]";
            if (uniqueSelector(selector)) {
              return selector;
            }
          }
        }
        const parts = [];
        let current = element;
        while (current && current !== document.body && current.nodeType === Node.ELEMENT_NODE) {
          let part = current.tagName.toLowerCase();
          if (current.id) {
            part += "#" + cssEscape(current.id);
            parts.unshift(part);
            break;
          }
          const siblings = current.parentElement
            ? Array.prototype.filter.call(current.parentElement.children, (child) => child.tagName === current.tagName)
            : [];
          if (siblings.length > 1) {
            part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
          }
          parts.unshift(part);
          current = current.parentElement;
          const selectorCandidate = parts.join(" > ");
          if (selectorCandidate && uniqueSelector(selectorCandidate)) {
            return selectorCandidate;
          }
        }
        return parts.join(" > ");
      };
      const buildLocatorBundle = (element) => {
        if (!isHtmlElement(element)) {
          return null;
        }
        const targets = [];
        let primary = "";
        if (element.id) {
          primary = "id=" + element.id;
          targets.push([primary, "id"]);
        }
        if (element.name) {
          targets.push(["name=" + element.name, "name"]);
          if (!primary) {
            primary = "name=" + element.name;
          }
        }
        ["data-testid", "data-test", "data-qa", "aria-label"].forEach((attributeName) => {
          if (hasUsefulAttribute(element, attributeName)) {
            const locator = "css=" + element.tagName.toLowerCase() + "[" + attributeName + "=\\"" + element.getAttribute(attributeName).replace(/"/g, "\\\\\\"") + "\\"]";
            if (!targets.some((candidate) => candidate[0] === locator)) {
              targets.push([locator, "css"]);
              if (!primary) {
                primary = locator;
              }
            }
          }
        });
        const cssSelector = buildCssSelector(element);
        if (cssSelector) {
          const cssLocator = "css=" + cssSelector;
          if (!targets.some((candidate) => candidate[0] === cssLocator)) {
            targets.push([cssLocator, "css"]);
            if (!primary) {
              primary = cssLocator;
            }
          }
        }
        if (!primary) {
          return null;
        }
        return { primary, targets };
      };
      const isTextInput = (element) => {
        if (!isHtmlElement(element)) {
          return false;
        }
        if (element.tagName === "TEXTAREA") {
          return true;
        }
        if (element.tagName !== "INPUT") {
          return false;
        }
        const type = stringValue(element.type).toLowerCase();
        return ["", "color", "date", "datetime-local", "email", "month", "number", "password", "search", "tel", "text", "time", "url", "week"].indexOf(type) >= 0;
      };
      const isCheckable = (element) => isHtmlElement(element) && element.tagName === "INPUT" && ["checkbox", "radio"].indexOf(stringValue(element.type).toLowerCase()) >= 0;
      const isSelect = (element) => isHtmlElement(element) && element.tagName === "SELECT";
      const isSubmitControl = (element) => {
        if (!isHtmlElement(element)) {
          return false;
        }
        if (element.tagName === "BUTTON") {
          const buttonType = stringValue(element.type).toLowerCase();
          return !buttonType || buttonType === "submit";
        }
        if (element.tagName === "INPUT") {
          return ["submit", "image"].indexOf(stringValue(element.type).toLowerCase()) >= 0;
        }
        return false;
      };
      const getAssociatedForm = (element) => {
        if (!isHtmlElement(element)) {
          return null;
        }
        return element.form || element.closest("form");
      };
      const isNativeClickElement = (element) => {
        if (!isHtmlElement(element)) {
          return false;
        }
        if (["A", "BUTTON", "SUMMARY"].indexOf(element.tagName) >= 0) {
          return true;
        }
        if (element.tagName === "INPUT") {
          const type = stringValue(element.type).toLowerCase();
          return ["button", "image", "reset", "submit"].indexOf(type) >= 0;
        }
        return element.getAttribute("role") === "button";
      };
      const findClickableTarget = (startNode) => {
        if (!startNode) {
          return null;
        }
        let element = startNode.nodeType === Node.TEXT_NODE ? startNode.parentElement : startNode;
        while (element && element !== document.body) {
          if (isNativeClickElement(element)) {
            return element;
          }
          element = element.parentElement;
        }
        return null;
      };
      const anchorTriggersNavigation = (anchor) => {
        if (!isHtmlElement(anchor) || anchor.tagName !== "A") {
          return false;
        }
        const href = stringValue(anchor.getAttribute("href"));
        if (!href || href === "#" || href.toLowerCase().indexOf("javascript:") === 0) {
          return false;
        }
        return anchor.target !== "_blank";
      };
      const getSelectedOptionLocator = (selectElement) => {
        if (!isSelect(selectElement)) {
          return "";
        }
        const option = selectElement.options[selectElement.selectedIndex];
        if (!option) {
          return "";
        }
        const optionValue = stringValue(option.value);
        if (optionValue) {
          return "value=" + optionValue;
        }
        return "label=" + stringValue(option.textContent);
      };
      const recordTextEntry = (element) => {
        if (!isTextInput(element)) {
          return;
        }
        const locator = buildLocatorBundle(element);
        if (!locator) {
          return;
        }
        send({
          command: "type",
          target: locator.primary,
          targets: locator.targets,
          value: element.value || ""
        });
      };
      const recordControlState = (element) => {
        if (!element) {
          return;
        }
        if (isTextInput(element)) {
          recordTextEntry(element);
          return;
        }
        const locator = buildLocatorBundle(element);
        if (!locator) {
          return;
        }
        if (isCheckable(element)) {
          send({
            command: element.checked ? "check" : "uncheck",
            target: locator.primary,
            targets: locator.targets,
            value: ""
          });
          return;
        }
        if (isSelect(element)) {
          const selectedValue = getSelectedOptionLocator(element);
          if (!selectedValue) {
            return;
          }
          send({
            command: "select",
            target: locator.primary,
            targets: locator.targets,
            value: selectedValue
          });
        }
      };
      const flushFormState = (form) => {
        if (!form || !form.elements) {
          return;
        }
        Array.prototype.forEach.call(form.elements, (element) => recordControlState(element));
      };
      const flushDocumentState = () => {
        Array.prototype.forEach.call(document.querySelectorAll("input, textarea, select"), (element) => recordControlState(element));
      };
      const scheduleTextCapture = (element) => {
        if (!isTextInput(element)) {
          return;
        }
        const existingTimeout = pendingTextCaptures.get(element);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }
        const timeoutId = setTimeout(() => {
          pendingTextCaptures.delete(element);
          recordTextEntry(element);
        }, 0);
        pendingTextCaptures.set(element, timeoutId);
      };
      document.addEventListener("input", (event) => scheduleTextCapture(event.target), true);
      document.addEventListener("keyup", (event) => scheduleTextCapture(event.target), true);
      document.addEventListener("paste", (event) => scheduleTextCapture(event.target), true);
      document.addEventListener("cut", (event) => scheduleTextCapture(event.target), true);
      document.addEventListener("change", (event) => {
        const element = event.target;
        if (isTextInput(element)) {
          scheduleTextCapture(element);
          return;
        }
        recordControlState(element);
      }, true);
      document.addEventListener("blur", (event) => scheduleTextCapture(event.target), true);
      document.addEventListener("mousedown", (event) => {
        flushDocumentState();
        const clickable = findClickableTarget(event.target);
        if (!clickable) {
          return;
        }
        const relatedForm = getAssociatedForm(clickable);
        if (relatedForm) {
          flushFormState(relatedForm);
        }
        if (!anchorTriggersNavigation(clickable) && !isSubmitControl(clickable) && !relatedForm) {
          return;
        }
        const locator = buildLocatorBundle(clickable);
        if (!locator) {
          return;
        }
        send({
          command: "click",
          target: locator.primary,
          targets: locator.targets,
          value: "",
          expectsNavigation: anchorTriggersNavigation(clickable) || isSubmitControl(clickable)
        });
      }, true);
      document.addEventListener("click", () => {
        if (document.activeElement && isTextInput(document.activeElement)) {
          recordTextEntry(document.activeElement);
        }
      }, true);
      document.addEventListener("submit", (event) => {
        if (document.activeElement && isTextInput(document.activeElement)) {
          recordTextEntry(document.activeElement);
        }
        const form = event.target;
        flushFormState(form);
        const locator = buildLocatorBundle(form);
        if (!locator) {
          return;
        }
        send({
          command: "submit",
          target: locator.primary,
          targets: locator.targets,
          value: "",
          expectsNavigation: true
        });
      }, true);
      window.addEventListener("beforeunload", () => {
        flushDocumentState();
      }, true);
    })();
  `;

  elements.recorderView.executeJavaScript(script).catch(function () {
    return null;
  });
}

elements.recorderView.addEventListener("ipc-message", function (event) {
  if (event.channel !== "recorder-event" || !event.args || !event.args.length) {
    return;
  }

  handleWebviewRecorderEvent(event.args[0]);
});

elements.recorderView.addEventListener("console-message", function (event) {
  var message = event.message || "";
  if (message.indexOf(INJECTED_RECORDER_PREFIX) !== 0) {
    return;
  }

  try {
    handleWebviewRecorderEvent(JSON.parse(message.slice(INJECTED_RECORDER_PREFIX.length)));
  } catch (_error) {
    setStatus("Recorder bridge emitted an unreadable payload.");
  }
});

elements.recorderView.addEventListener("dom-ready", function () {
  sendRecorderState(state.isRecording);
  installFallbackRecorder();
  elements.addressInput.value = elements.recorderView.getURL();
});

elements.recorderView.addEventListener("did-stop-loading", function () {
  var currentUrl = elements.recorderView.getURL();
  elements.addressInput.value = currentUrl;

  if (!state.isRecording || !currentUrl || !isRecordableUrl(currentUrl)) {
    return;
  }

  if (!state.recording.baseUrl) {
    state.recording.baseUrl = VeracodeSide.normalizeBaseUrl(currentUrl);
    elements.baseUrl.value = state.recording.baseUrl;
  }

  if (state.runtime.manualNavigationPending) {
    appendCommand({
      command: "open",
      target: VeracodeSide.toOpenTarget(currentUrl, state.recording.baseUrl),
      value: "",
      targets: []
    });
      appendCommand({
        command: "pause",
        target: VeracodeSide.DEFAULT_PAUSE_MS,
        value: "",
        targets: []
      });
    state.runtime.manualNavigationPending = false;
    state.runtime.pendingNavigation = false;
    state.runtime.lastKnownUrl = currentUrl;
    if (state.runtime.authVerificationPending) {
      collectLoginVerification().then(function () {
        state.runtime.authVerificationPending = false;
        render();
      });
    }
    render();
    return;
  }

  if (state.runtime.pendingNavigation) {
    appendCommand({
      command: "pause",
      target: VeracodeSide.DEFAULT_PAUSE_MS,
      value: "",
      targets: []
    });
    state.runtime.pendingNavigation = false;
    state.runtime.lastKnownUrl = currentUrl;
    if (state.runtime.authVerificationPending) {
      collectLoginVerification().then(function () {
        state.runtime.authVerificationPending = false;
        render();
      });
    }
    render();
    return;
  }

  if (currentUrl !== state.runtime.lastKnownUrl) {
    appendCommand({
      command: "open",
      target: VeracodeSide.toOpenTarget(currentUrl, state.recording.baseUrl),
      value: "",
      targets: []
    });
    appendCommand({
      command: "pause",
      target: VeracodeSide.DEFAULT_PAUSE_MS,
      value: "",
      targets: []
    });
    state.runtime.lastKnownUrl = currentUrl;
    if (state.runtime.authVerificationPending) {
      collectLoginVerification().then(function () {
        state.runtime.authVerificationPending = false;
        render();
      });
    }
    render();
  }
});

elements.commandRows.addEventListener("input", debounce(function (event) {
  var field = event.target.getAttribute("data-field");
  var index = Number(event.target.getAttribute("data-index"));
  if (!field || Number.isNaN(index) || !state.recording.commands[index]) {
    return;
  }

  state.recording.commands[index][field] = event.target.value;
  if (field === "command") {
    try {
      state.recording.commands[index] = VeracodeSide.createCommand(state.recording.commands[index]);
    } catch (error) {
      setStatus(error.message);
    }
  }
  setStatus("Updated command " + (index + 1) + ".");
}, 100));

elements.commandRows.addEventListener("change", function (event) {
  var field = event.target.getAttribute("data-field");
  var index = Number(event.target.getAttribute("data-index"));
  if (!field || Number.isNaN(index) || !state.recording.commands[index]) {
    return;
  }

  state.recording.commands[index][field] = event.target.value;
  if (field === "command") {
    try {
      state.recording.commands[index] = VeracodeSide.createCommand(state.recording.commands[index]);
      setStatus("Updated command " + (index + 1) + ".");
    } catch (error) {
      setStatus(error.message);
    }
  }
});

elements.commandRows.addEventListener("click", function (event) {
  var action = event.target.getAttribute("data-action");
  var index = Number(event.target.getAttribute("data-index"));
  if (action !== "delete" || Number.isNaN(index)) {
    return;
  }

  state.recording.commands.splice(index, 1);
  render();
});

var syncMeta = debounce(function () {
  updateRecordingMeta();
  render();
}, 100);

elements.projectName.addEventListener("input", syncMeta);
elements.testName.addEventListener("input", syncMeta);
elements.baseUrl.addEventListener("input", syncMeta);
elements.startRecording.addEventListener("click", startInAppRecording);
elements.stopRecording.addEventListener("click", stopInAppRecording);
elements.newRecording.addEventListener("click", resetRecording);
elements.importFile.addEventListener("click", importFile);
elements.exportVeracodeSide.addEventListener("click", function () {
  saveRecording("side-veracode");
});
elements.exportSeleniumIdeSide.addEventListener("click", function () {
  saveRecording("side-selenium-ide");
});
elements.exportJson.addEventListener("click", function () {
  saveRecording("json");
});
elements.addCommand.addEventListener("click", function () {
  state.recording.commands.push(
    VeracodeSide.createCommand({
      command: "click",
      target: "",
      value: "",
      targets: []
    })
  );
  render();
});
elements.goButton.addEventListener("click", navigateFromAddressBar);
elements.addressInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    navigateFromAddressBar();
  }
});

elements.recorderView.setAttribute("preload", new URL("../webview-preload.js", window.location.href).toString());
elements.autoCommands.textContent = VeracodeSide.AUTO_RECORD_COMMANDS.join(", ");
render();
