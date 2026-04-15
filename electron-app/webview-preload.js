const { ipcRenderer } = require("electron");
const RecorderDom = require("./shared/recorder-dom.js");

let isRecording = false;
let recentSubmit = {
  at: 0,
  formTarget: ""
};
const pendingTextCaptures = new WeakMap();

function send(payload) {
  if (!isRecording) {
    return;
  }

  ipcRenderer.sendToHost("recorder-event", payload);
}

function recordTextEntry(element) {
  if (!RecorderDom.isTextInput(element)) {
    return;
  }

  const locator = RecorderDom.buildLocatorBundle(element);
  if (!locator) {
    return;
  }

  send({
    command: "type",
    target: locator.primary,
    targets: locator.targets,
    value: element.value || ""
  });
}

function recordControlState(element) {
  if (!element) {
    return;
  }

  if (RecorderDom.isTextInput(element)) {
    recordTextEntry(element);
    return;
  }

  const locator = RecorderDom.buildLocatorBundle(element);
  if (!locator) {
    return;
  }

  if (RecorderDom.isCheckable(element)) {
    send({
      command: element.checked ? "check" : "uncheck",
      target: locator.primary,
      targets: locator.targets,
      value: ""
    });
    return;
  }

  if (RecorderDom.isSelect(element)) {
    const selectedValue = RecorderDom.getSelectedOptionLocator(element);
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
}

function flushFormState(form) {
  if (!form || !form.elements) {
    return;
  }

  Array.prototype.forEach.call(form.elements, (element) => {
    recordControlState(element);
  });
}

function scheduleTextCapture(element) {
  if (!RecorderDom.isTextInput(element)) {
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
}

function onBlur(event) {
  scheduleTextCapture(event.target);
}

function onInput(event) {
  scheduleTextCapture(event.target);
}

function onKeyUp(event) {
  scheduleTextCapture(event.target);
}

function onPaste(event) {
  scheduleTextCapture(event.target);
}

function onCut(event) {
  scheduleTextCapture(event.target);
}

function onMouseDown(event) {
  const clickable = RecorderDom.findClickableTarget(event.target);
  if (!clickable) {
    return;
  }

  const relatedForm = RecorderDom.getAssociatedForm(clickable);
  if (relatedForm) {
    flushFormState(relatedForm);
  }

  if (!RecorderDom.anchorTriggersNavigation(clickable) && !RecorderDom.isSubmitControl(clickable) && !relatedForm) {
    return;
  }

  const locator = RecorderDom.buildLocatorBundle(clickable);
  if (!locator) {
    return;
  }

  send({
    command: "click",
    target: locator.primary,
    targets: locator.targets,
    value: "",
    expectsNavigation: RecorderDom.anchorTriggersNavigation(clickable) || RecorderDom.isSubmitControl(clickable)
  });
}

function onChange(event) {
  const element = event.target;
  if (RecorderDom.isTextInput(element)) {
    scheduleTextCapture(element);
    return;
  }

  const locator = RecorderDom.buildLocatorBundle(element);

  if (!locator) {
    return;
  }

  if (RecorderDom.isCheckable(element)) {
    send({
      command: element.checked ? "check" : "uncheck",
      target: locator.primary,
      targets: locator.targets,
      value: ""
    });
    return;
  }

  if (RecorderDom.isSelect(element)) {
    const selectedValue = RecorderDom.getSelectedOptionLocator(element);
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
}

function onClick(event) {
  const clickable = RecorderDom.findClickableTarget(event.target);
  if (!clickable) {
    return;
  }

  if (RecorderDom.isCheckable(clickable) || RecorderDom.isTextInput(clickable) || RecorderDom.isSelect(clickable)) {
    return;
  }

  const locator = RecorderDom.buildLocatorBundle(clickable);
  if (!locator) {
    return;
  }

  if (RecorderDom.isSubmitControl(clickable)) {
    const relatedForm = RecorderDom.getAssociatedForm(clickable);
    if (relatedForm) {
      const formLocator = RecorderDom.buildLocatorBundle(relatedForm);
      recentSubmit.formTarget = formLocator ? formLocator.primary : "";
      recentSubmit.at = Date.now();
    }
  }

  send({
    command: "click",
    target: locator.primary,
    targets: locator.targets,
    value: "",
    expectsNavigation: RecorderDom.anchorTriggersNavigation(clickable) || RecorderDom.isSubmitControl(clickable)
  });
}

function onSubmit(event) {
  const form = event.target;
  flushFormState(form);
  const locator = RecorderDom.buildLocatorBundle(form);

  if (!locator) {
    return;
  }

  if (recentSubmit.formTarget === locator.primary && Date.now() - recentSubmit.at < 1500) {
    return;
  }

  send({
    command: "submit",
    target: locator.primary,
    targets: locator.targets,
    value: "",
    expectsNavigation: true
  });
}

ipcRenderer.on("recorder-control", (_event, message) => {
  if (message && message.type === "set-recording") {
    isRecording = !!message.enabled;
  }
});

if (window.top === window.self && RecorderDom.isHtmlPage()) {
  document.addEventListener("blur", onBlur, true);
  document.addEventListener("input", onInput, true);
  document.addEventListener("keyup", onKeyUp, true);
  document.addEventListener("paste", onPaste, true);
  document.addEventListener("cut", onCut, true);
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("change", onChange, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("submit", onSubmit, true);
}
