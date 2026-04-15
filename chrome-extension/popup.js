var elements = {
  toggleRecording: document.getElementById("toggleRecording"),
  newSession: document.getElementById("newSession"),
  exportSide: document.getElementById("exportSide"),
  exportJson: document.getElementById("exportJson"),
  projectName: document.getElementById("projectName"),
  testName: document.getElementById("testName"),
  baseUrl: document.getElementById("baseUrl"),
  stats: document.getElementById("stats"),
  commandList: document.getElementById("commandList"),
  autoCommands: document.getElementById("autoCommands")
};

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
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

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderState(state) {
  var commands = state.session.commands || [];
  var summary = state.summary || VeracodeSide.summarize(state.session);

  elements.toggleRecording.textContent = state.isRecording ? "Pause Recording" : "Resume Recording";
  elements.projectName.value = state.session.projectName || "";
  elements.testName.value = state.session.testName || "";
  elements.baseUrl.value = state.session.baseUrl || "";
  elements.stats.textContent =
    summary.totalCommands +
    " commands recorded. " +
    (state.isRecording ? "Auto recorder is live in the current tab." : "Recorder is paused.");

  var recentCommands = commands.slice(-12).reverse();
  elements.commandList.innerHTML = recentCommands.length
    ? recentCommands
        .map(function (command) {
          return (
            '<div class="command"><strong>' +
            escapeHtml(command.command) +
            "</strong>" +
            escapeHtml(command.target || "") +
            (command.value ? "<br />" + escapeHtml(command.value) : "") +
            "</div>"
          );
        })
        .join("")
    : '<div class="command">No commands recorded yet.</div>';
}

function downloadFile(filename, content, mimeType) {
  var blob = new Blob([content], { type: mimeType });
  var url = URL.createObjectURL(blob);

  chrome.downloads.download({
    filename: filename,
    saveAs: true,
    url: url
  }, function () {
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 5000);
  });
}

async function refresh() {
  var state = await sendMessage({ type: "get-state" });
  renderState(state);
}

var updateMetadata = debounce(async function () {
  var state = await sendMessage({
    type: "update-metadata",
    projectName: elements.projectName.value,
    testName: elements.testName.value,
    baseUrl: elements.baseUrl.value
  });
  renderState(state);
}, 200);

elements.toggleRecording.addEventListener("click", async function () {
  var state = await sendMessage({ type: "get-state" });
  var nextState = state.isRecording
    ? await sendMessage({ type: "stop-recording" })
    : await sendMessage({ type: "start-recording", resetSession: !state.session.commands.length });

  if (nextState.error) {
    elements.stats.textContent = nextState.error;
    return;
  }

  renderState(nextState);
});

elements.newSession.addEventListener("click", async function () {
  var cleared = await sendMessage({ type: "clear-session" });
  renderState(cleared);
});

elements.exportSide.addEventListener("click", async function () {
  var file = await sendMessage({ type: "export", format: "side" });
  downloadFile(file.filename, file.content, file.mimeType);
});

elements.exportJson.addEventListener("click", async function () {
  var file = await sendMessage({ type: "export", format: "recording" });
  downloadFile(file.filename, file.content, file.mimeType);
});

elements.projectName.addEventListener("input", updateMetadata);
elements.testName.addEventListener("input", updateMetadata);
elements.baseUrl.addEventListener("input", updateMetadata);
elements.autoCommands.textContent = VeracodeSide.AUTO_RECORD_COMMANDS.join(", ");

refresh();
