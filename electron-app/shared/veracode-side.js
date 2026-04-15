(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.VeracodeSide = factory();
  }
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  var SUPPORTED_COMMANDS = [
    "assertAlert",
    "assertPrompt",
    "assertConfirmation",
    "assertChecked",
    "assertElementPresent",
    "assertText",
    "verifyText",
    "assertTextPresent",
    "verifyTextPresent",
    "check",
    "uncheck",
    "click",
    "clickAndWait",
    "clickAt",
    "deleteAllCookies",
    "doubleClick",
    "doubleClickAndWait",
    "fireEvent",
    "focus",
    "keyUp",
    "keyDown",
    "keyPress",
    "mouseDown",
    "mouseUp",
    "mouseOver",
    "mouseMove",
    "mouseOut",
    "open",
    "close",
    "pause",
    "refresh",
    "runScript",
    "select",
    "selectAndWait",
    "selectFrame",
    "selectPopUp",
    "selectWindow",
    "submit",
    "type",
    "typeKeys",
    "sendKeys",
    "verifyHtmlSource",
    "waitForElementToLoad",
    "waitForTitle",
    "waitForTextPresent",
    "waitForElementPresent",
    "waitForFrameToLoad",
    "waitForPageToLoad"
  ];

  var SUPPORTED_COMMAND_SET = new Set(SUPPORTED_COMMANDS);
  var AUTO_RECORD_COMMANDS = [
    "open",
    "click",
    "type",
    "select",
    "check",
    "uncheck",
    "submit",
    "pause",
    "verifyTextPresent",
    "waitForElementPresent"
  ];
  var AUTO_RECORD_SET = new Set(AUTO_RECORD_COMMANDS);
  var DEFAULT_WAIT_TIMEOUT_MS = "30000";
  var DEFAULT_PAUSE_MS = "1000";
  var DEFAULT_SIDE_TIMEOUT_SECONDS = 300;
  var EXPORT_WAIT_MODE_VERACODE = "veracode";
  var EXPORT_WAIT_MODE_SELENIUM_IDE = "selenium-ide";
  var VERIFICATION_COMMANDS = [
    "assertElementPresent",
    "assertText",
    "verifyText",
    "assertTextPresent",
    "verifyTextPresent",
    "waitForTextPresent",
    "waitForElementPresent"
  ];
  var VERIFICATION_COMMAND_SET = new Set(VERIFICATION_COMMANDS);

  function cloneJsonSafe(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeTrim(value) {
    return String(value == null ? "" : value).trim();
  }

  function generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (character) {
      var random = Math.floor(Math.random() * 16);
      var next = character === "x" ? random : (random & 0x3) | 0x8;
      return next.toString(16);
    });
  }

  function safeUrl(url) {
    if (!url) {
      return null;
    }

    try {
      return new URL(url);
    } catch (_error) {
      return null;
    }
  }

  function normalizeBaseUrl(url) {
    var parsed = safeUrl(url);
    if (!parsed || parsed.protocol === "file:" || parsed.origin === "null") {
      return "";
    }

    return parsed.origin;
  }

  function toOpenTarget(url, baseUrl) {
    var parsedUrl = safeUrl(url);
    var parsedBase = safeUrl(baseUrl);

    if (!parsedUrl) {
      return safeTrim(url);
    }

    if (parsedBase && parsedBase.origin === parsedUrl.origin) {
      return parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
    }

    return parsedUrl.toString();
  }

  function isSupportedCommand(command) {
    return SUPPORTED_COMMAND_SET.has(safeTrim(command));
  }

  function isAutoRecordCommand(command) {
    return AUTO_RECORD_SET.has(safeTrim(command));
  }

  function normalizeTargets(target, targets) {
    var normalized = Array.isArray(targets) ? targets.filter(Array.isArray) : [];

    if (!normalized.length && target) {
      normalized.push([target, "primary"]);
    }

    return normalized;
  }

  function createCommand(input) {
    var command = safeTrim(input && input.command);

    if (!isSupportedCommand(command)) {
      throw new Error("Unsupported Veracode Selenium command: " + command);
    }

    return {
      id: safeTrim(input && input.id) || generateId(),
      comment: safeTrim(input && input.comment),
      command: command,
      target: String(input && input.target != null ? input.target : ""),
      targets: normalizeTargets(input && input.target, input && input.targets),
      value: String(input && input.value != null ? input.value : "")
    };
  }

  function createRecording(overrides) {
    var recording = overrides || {};

    return {
      projectName: safeTrim(recording.projectName) || "Veracode Recording",
      testName: safeTrim(recording.testName) || "Recorded Flow",
      baseUrl: safeTrim(recording.baseUrl),
      commands: Array.isArray(recording.commands)
        ? recording.commands.map(createCommand)
        : [],
      metadata: Object.assign(
        {
          source: "manual",
          createdAt: new Date().toISOString()
        },
        recording.metadata || {}
      )
    };
  }

  function sanitizeRecording(recording, options) {
    var config = Object.assign(
      {
        autoOnly: false,
        keepUnsupported: false
      },
      options || {}
    );
    var dropped = [];
    var commands = [];

    (recording && Array.isArray(recording.commands) ? recording.commands : []).forEach(function (command) {
      var normalized = null;

      try {
        normalized = createCommand(command);
      } catch (error) {
        dropped.push({
          command: command,
          reason: error.message
        });
        return;
      }

      if (config.autoOnly && !isAutoRecordCommand(normalized.command)) {
        dropped.push({
          command: normalized,
          reason: "Not part of the automatic recorder subset."
        });

        if (!config.keepUnsupported) {
          return;
        }
      }

      commands.push(normalized);
    });

    return {
      recording: createRecording(
        Object.assign({}, recording || {}, {
          commands: commands
        })
      ),
      dropped: dropped
    };
  }

  function findCommandBaseUrl(recording) {
    if (recording && recording.baseUrl) {
      return recording.baseUrl;
    }

    var commands = recording && Array.isArray(recording.commands) ? recording.commands : [];
    for (var index = 0; index < commands.length; index += 1) {
      var command = commands[index];
      if (command.command === "open") {
        var normalized = normalizeBaseUrl(command.target);
        if (normalized) {
          return normalized;
        }
      }
    }

    return "";
  }

  function collectOrigins(recording) {
    var baseUrl = findCommandBaseUrl(recording);
    var origins = new Set();
    var baseOrigin = normalizeBaseUrl(baseUrl);

    if (baseOrigin) {
      origins.add(baseOrigin + "/");
    }

    (recording.commands || []).forEach(function (command) {
      if (command.command !== "open") {
        return;
      }

      var absoluteUrl = safeUrl(command.target) || (baseOrigin ? safeUrl(baseOrigin + command.target) : null);
      if (absoluteUrl && absoluteUrl.protocol !== "file:" && absoluteUrl.origin !== "null") {
        origins.add(absoluteUrl.origin + "/");
      }
    });

    return Array.from(origins);
  }

  function buildSideProject(recording, options) {
    var config = Object.assign(
      {
        timeoutSeconds: DEFAULT_SIDE_TIMEOUT_SECONDS,
        waitMode: EXPORT_WAIT_MODE_VERACODE
      },
      options || {}
    );
    var sanitized = sanitizeRecording(recording);
    var normalized = sanitized.recording;
    assertExportable(normalized, config);
    var testId = generateId();
    var suiteId = generateId();
    var baseUrl = findCommandBaseUrl(normalized);

    return {
      id: generateId(),
      version: "2.0",
      name: normalized.projectName,
      url: baseUrl,
      tests: [
        {
          id: testId,
          name: normalized.testName,
          commands: cloneJsonSafe(normalizeCommandsForExport(normalized.commands, config))
        }
      ],
      suites: [
        {
          id: suiteId,
          name: "Default Suite",
          persistSession: false,
          parallel: false,
          timeout: config.timeoutSeconds,
          tests: [testId]
        }
      ],
      urls: collectOrigins(normalized),
      plugins: []
    };
  }

  function parseSideProject(project) {
    var firstTest = project && Array.isArray(project.tests) && project.tests.length
      ? project.tests[0]
      : { name: "Recorded Flow", commands: [] };

    return createRecording({
      projectName: safeTrim(project && project.name) || "Imported Veracode Recording",
      testName: safeTrim(firstTest.name) || "Recorded Flow",
      baseUrl: safeTrim(project && project.url),
      commands: Array.isArray(firstTest.commands) ? firstTest.commands : [],
      metadata: {
        source: "side-import",
        importedAt: new Date().toISOString()
      }
    });
  }

  function parseRecordingText(text) {
    var parsed = JSON.parse(text);

    if (parsed && parsed.version === "2.0" && Array.isArray(parsed.tests)) {
      return parseSideProject(parsed);
    }

    if (parsed && Array.isArray(parsed.commands)) {
      return createRecording(parsed);
    }

    throw new Error("Unsupported recording JSON format.");
  }

  function exportSideText(recording, options) {
    return JSON.stringify(buildSideProject(recording, options), null, 2);
  }

  function isVerificationCommand(command) {
    return !!(command && VERIFICATION_COMMAND_SET.has(safeTrim(command.command || command)));
  }

  function hasVerificationCommand(commands) {
    return (commands || []).some(isVerificationCommand);
  }

  function hasAuthInteraction(commands) {
    return (commands || []).some(function (command) {
      var normalizedCommand = safeTrim(command && command.command);
      if (normalizedCommand !== "type" && normalizedCommand !== "click" && normalizedCommand !== "submit") {
        return false;
      }

      var candidates = [safeTrim(command && command.target).toLowerCase()];
      (Array.isArray(command && command.targets) ? command.targets : []).forEach(function (candidate) {
        if (Array.isArray(candidate) && candidate[0]) {
          candidates.push(safeTrim(candidate[0]).toLowerCase());
        }
      });

      return candidates.some(function (value) {
        return /user|email|login|pass|password|otp|totp|captcha|code|pin|signin|sign-in/.test(value);
      });
    });
  }

  function createNavigationWaitCommand(waitMode) {
    if (waitMode === EXPORT_WAIT_MODE_SELENIUM_IDE) {
      return createCommand({
        command: "pause",
        target: DEFAULT_PAUSE_MS,
        targets: [[DEFAULT_PAUSE_MS, "timeout"]],
        value: ""
      });
    }

    return createCommand({
      command: "waitForPageToLoad",
      target: DEFAULT_WAIT_TIMEOUT_MS,
      targets: [[DEFAULT_WAIT_TIMEOUT_MS, "timeout"]],
      value: ""
    });
  }

  function isNavigationWaitCommand(command) {
    var normalizedCommand = safeTrim(command && command.command);
    return normalizedCommand === "pause" || normalizedCommand === "waitForPageToLoad";
  }

  function normalizeCommandsForExport(commands, options) {
    var config = Object.assign(
      {
        waitMode: EXPORT_WAIT_MODE_VERACODE
      },
      options || {}
    );

    var mappedCommands = (commands || []).map(function (command) {
      if (command.command !== "pause") {
        return command;
      }

      if (config.waitMode === EXPORT_WAIT_MODE_SELENIUM_IDE) {
        return command;
      }

      return createCommand({
        id: command.id,
        comment: command.comment,
        command: "waitForPageToLoad",
        target: DEFAULT_WAIT_TIMEOUT_MS,
        targets: [[DEFAULT_WAIT_TIMEOUT_MS, "timeout"]],
        value: ""
      });
    });

    var normalizedCommands = [];

    mappedCommands.forEach(function (command, index) {
      normalizedCommands.push(command);

      if (command.command !== "open") {
        return;
      }

      var nextCommand = mappedCommands[index + 1];
      if (isNavigationWaitCommand(nextCommand)) {
        return;
      }

      normalizedCommands.push(createNavigationWaitCommand(config.waitMode));
    });

    return normalizedCommands;
  }

  function collectExportIssues(recording, options) {
    var config = Object.assign(
      {
        waitMode: EXPORT_WAIT_MODE_VERACODE
      },
      options || {}
    );
    var issues = [];
    var commands = recording && Array.isArray(recording.commands) ? recording.commands : [];

    if (!commands.length || commands[0].command !== "open") {
      issues.push("The script must begin with an open command.");
    }

    if (hasAuthInteraction(commands) && !hasVerificationCommand(commands)) {
      issues.push("The script includes login-like interactions but does not contain a verification command such as verifyTextPresent or waitForElementPresent.");
    }

    if (config.waitMode === EXPORT_WAIT_MODE_VERACODE) {
      var normalizedCommands = normalizeCommandsForExport(commands, config);
      if (normalizedCommands.length > 1 && normalizedCommands[0].command === "open" && normalizedCommands[1].command !== "waitForPageToLoad") {
        issues.push("The Veracode export must wait for the page to load immediately after open.");
      }
    }

    return issues;
  }

  function assertExportable(recording, options) {
    var issues = collectExportIssues(recording, options);
    if (issues.length) {
      throw new Error(issues[0]);
    }
  }

  function exportRecordingText(recording) {
    var sanitized = sanitizeRecording(recording);
    return JSON.stringify(sanitized.recording, null, 2);
  }

  function summarize(recording) {
    var counts = {};

    (recording.commands || []).forEach(function (command) {
      counts[command.command] = (counts[command.command] || 0) + 1;
    });

    return {
      totalCommands: (recording.commands || []).length,
      commandCounts: counts
    };
  }

  return {
    SUPPORTED_COMMANDS: SUPPORTED_COMMANDS,
    AUTO_RECORD_COMMANDS: AUTO_RECORD_COMMANDS,
    DEFAULT_WAIT_TIMEOUT_MS: DEFAULT_WAIT_TIMEOUT_MS,
    DEFAULT_PAUSE_MS: DEFAULT_PAUSE_MS,
    DEFAULT_SIDE_TIMEOUT_SECONDS: DEFAULT_SIDE_TIMEOUT_SECONDS,
    EXPORT_WAIT_MODE_VERACODE: EXPORT_WAIT_MODE_VERACODE,
    EXPORT_WAIT_MODE_SELENIUM_IDE: EXPORT_WAIT_MODE_SELENIUM_IDE,
    VERIFICATION_COMMANDS: VERIFICATION_COMMANDS,
    createRecording: createRecording,
    createCommand: createCommand,
    sanitizeRecording: sanitizeRecording,
    isSupportedCommand: isSupportedCommand,
    isAutoRecordCommand: isAutoRecordCommand,
    isVerificationCommand: isVerificationCommand,
    hasVerificationCommand: hasVerificationCommand,
    buildSideProject: buildSideProject,
    parseSideProject: parseSideProject,
    parseRecordingText: parseRecordingText,
    normalizeCommandsForExport: normalizeCommandsForExport,
    collectExportIssues: collectExportIssues,
    assertExportable: assertExportable,
    exportSideText: exportSideText,
    exportRecordingText: exportRecordingText,
    generateId: generateId,
    normalizeBaseUrl: normalizeBaseUrl,
    toOpenTarget: toOpenTarget,
    summarize: summarize
  };
});
