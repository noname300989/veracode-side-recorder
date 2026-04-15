importScripts("shared/veracode-side.js");

var STORAGE_KEY = "veracodeRecorderState";
var state = {
  isRecording: true,
  session: VeracodeSide.createRecording({
    metadata: {
      source: "chrome-extension"
    }
  }),
  runtime: {
    tabId: null,
    lastKnownUrl: "",
    pendingNavigation: false,
    lastActionAt: 0,
    lastClickSignature: ""
  }
};

var initialization = loadState();

async function loadState() {
  var result = await chrome.storage.local.get(STORAGE_KEY);
  if (!result || !result[STORAGE_KEY]) {
    await persistState();
    return;
  }

  var stored = result[STORAGE_KEY];
  state = {
    isRecording: stored.isRecording !== false,
    session: VeracodeSide.createRecording(Object.assign({}, stored.session || {}, {
      metadata: Object.assign(
        {
          source: "chrome-extension"
        },
        stored.session && stored.session.metadata ? stored.session.metadata : {}
      )
    })),
    runtime: Object.assign(
      {
        tabId: null,
        lastKnownUrl: "",
        pendingNavigation: false,
        lastActionAt: 0,
        lastClickSignature: ""
      },
      stored.runtime || {}
    )
  };
}

function persistState() {
  return chrome.storage.local.set({
    veracodeRecorderState: state
  });
}

function isRecordableUrl(url) {
  return /^https?:|^file:/i.test(String(url || ""));
}

function setSessionDefaults(tab) {
  if (state.session.commands.length) {
    return;
  }

  state.session.projectName = "Veracode Recording";
  state.session.testName = tab && tab.title ? tab.title : "Recorded Flow";
  state.session.baseUrl = VeracodeSide.normalizeBaseUrl(tab && tab.url);
  state.session.metadata = Object.assign({}, state.session.metadata, {
    source: "chrome-extension",
    createdAt: state.session.metadata.createdAt || new Date().toISOString()
  });
}

function appendCommand(commandInput, options) {
  var config = Object.assign(
    {
      replaceSimilar: true,
      dedupeClicks: true
    },
    options || {}
  );
  var command = VeracodeSide.createCommand(commandInput);
  var commands = state.session.commands;
  var lastCommand = commands[commands.length - 1];
  var signature = command.command + "|" + command.target + "|" + command.value;
  var now = Date.now();

  if (
    config.dedupeClicks &&
    command.command === "click" &&
    state.runtime.lastClickSignature === signature &&
    now - state.runtime.lastActionAt < 500
  ) {
    return false;
  }

  if (
    config.replaceSimilar &&
    lastCommand &&
    lastCommand.target === command.target &&
    ["type", "select", "check", "uncheck"].indexOf(command.command) >= 0 &&
    ["type", "select", "check", "uncheck"].indexOf(lastCommand.command) >= 0
  ) {
    commands[commands.length - 1] = command;
  } else if (
    lastCommand &&
    lastCommand.command === command.command &&
    lastCommand.target === command.target &&
    lastCommand.value === command.value &&
    command.command === "waitForPageToLoad"
  ) {
    return false;
  } else {
    commands.push(command);
  }

  state.runtime.lastActionAt = now;
  if (command.command === "click") {
    state.runtime.lastClickSignature = signature;
  }
  return true;
}

function ensureOpenSequence(url) {
  if (!isRecordableUrl(url)) {
    return;
  }

  setSessionDefaults({
    url: url
  });

  if (!state.session.baseUrl) {
    state.session.baseUrl = VeracodeSide.normalizeBaseUrl(url);
  }

  if (!state.session.commands.length) {
    appendCommand({
      command: "open",
      target: VeracodeSide.toOpenTarget(url, state.session.baseUrl),
      value: "",
      targets: []
    });
    appendCommand({
      command: "waitForPageToLoad",
      target: VeracodeSide.DEFAULT_WAIT_TIMEOUT_MS,
      value: "",
      targets: []
    }, {
      dedupeClicks: false
    });
  }

  state.runtime.lastKnownUrl = url;
}

async function startRecording(resetSession) {
  await initialization;

  var tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true
  });
  var tab = tabs[0];

  if (!tab || !isRecordableUrl(tab.url)) {
    throw new Error("Open an HTML page in the active tab before recording.");
  }

  if (resetSession) {
    state.session = VeracodeSide.createRecording({
      projectName: "Veracode Recording",
      testName: tab.title || "Recorded Flow",
      baseUrl: VeracodeSide.normalizeBaseUrl(tab.url),
      metadata: {
        source: "chrome-extension",
        createdAt: new Date().toISOString()
      }
    });
  }

  setSessionDefaults(tab);
  state.isRecording = true;
  state.runtime.tabId = tab.id;
  state.runtime.pendingNavigation = false;
  ensureOpenSequence(tab.url);
  await persistState();
  return snapshotState();
}

async function stopRecording() {
  await initialization;
  state.isRecording = false;
  state.runtime.pendingNavigation = false;
  await persistState();
  return snapshotState();
}

async function clearSession() {
  await initialization;
  state.session = VeracodeSide.createRecording({
    metadata: {
      source: "chrome-extension",
      createdAt: new Date().toISOString()
    }
  });
  state.runtime.tabId = null;
  state.runtime.lastKnownUrl = "";
  state.runtime.pendingNavigation = false;
  state.runtime.lastClickSignature = "";
  await persistState();
  return snapshotState();
}

function snapshotState() {
  return {
    isRecording: state.isRecording,
    session: state.session,
    summary: VeracodeSide.summarize(state.session),
    runtime: {
      tabId: state.runtime.tabId,
      lastKnownUrl: state.runtime.lastKnownUrl,
      pendingNavigation: state.runtime.pendingNavigation
    }
  };
}

async function exportContent(format) {
  await initialization;

  if (format === "recording") {
    return {
      filename: "veracode-recording.json",
      mimeType: "application/json",
      content: VeracodeSide.exportRecordingText(state.session)
    };
  }

  return {
    filename: "veracode-recording.side",
    mimeType: "application/json",
    content: VeracodeSide.exportSideText(state.session)
  };
}

chrome.runtime.onInstalled.addListener(function () {
  initialization.then(persistState);
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  initialization.then(function () {
    if (!state.isRecording || tabId !== state.runtime.tabId || changeInfo.status !== "complete" || !isRecordableUrl(tab.url)) {
      return;
    }

    if (state.runtime.pendingNavigation) {
      appendCommand({
        command: "waitForPageToLoad",
        target: VeracodeSide.DEFAULT_WAIT_TIMEOUT_MS,
        value: "",
        targets: []
      }, {
        dedupeClicks: false
      });
      state.runtime.pendingNavigation = false;
    } else if (tab.url !== state.runtime.lastKnownUrl) {
      appendCommand({
        command: "open",
        target: VeracodeSide.toOpenTarget(tab.url, state.session.baseUrl),
        value: "",
        targets: []
      }, {
        dedupeClicks: false
      });
      appendCommand({
        command: "waitForPageToLoad",
        target: VeracodeSide.DEFAULT_WAIT_TIMEOUT_MS,
        value: "",
        targets: []
      }, {
        dedupeClicks: false
      });
    }

    state.runtime.lastKnownUrl = tab.url;
    persistState();
  });
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  initialization.then(async function () {
    try {
      switch (message && message.type) {
        case "get-state":
          sendResponse(snapshotState());
          break;
        case "start-recording":
          sendResponse(await startRecording(!!message.resetSession));
          break;
        case "stop-recording":
          sendResponse(await stopRecording());
          break;
        case "clear-session":
          sendResponse(await clearSession());
          break;
        case "update-metadata":
          state.session = VeracodeSide.createRecording(
            Object.assign({}, state.session, {
              projectName: message.projectName,
              testName: message.testName,
              baseUrl: message.baseUrl,
              metadata: Object.assign({}, state.session.metadata, {
                source: "chrome-extension"
              })
            })
          );
          await persistState();
          sendResponse(snapshotState());
          break;
        case "export":
          sendResponse(await exportContent(message.format));
          break;
        case "record-command":
          if (!state.isRecording || !sender.tab || !isRecordableUrl(sender.tab.url)) {
            sendResponse({
              ignored: true
            });
            break;
          }

          if (state.runtime.tabId == null) {
            state.runtime.tabId = sender.tab.id;
            ensureOpenSequence(sender.tab.url);
          }

          if (sender.tab.id !== state.runtime.tabId) {
            sendResponse({
              ignored: true
            });
            break;
          }

          if (message.command === "open" && message.url) {
            ensureOpenSequence(message.url);
          } else {
            appendCommand({
              command: message.command,
              target: message.target,
              targets: message.targets,
              value: message.value
            });
          }

          if (message.expectsNavigation) {
            state.runtime.pendingNavigation = true;
          }

          await persistState();
          sendResponse(snapshotState());
          break;
        default:
          sendResponse({
            ok: true
          });
          break;
      }
    } catch (error) {
      sendResponse({
        error: error.message
      });
    }
  });

  return true;
});
