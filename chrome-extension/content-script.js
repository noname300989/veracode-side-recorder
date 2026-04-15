(function () {
  "use strict";

  if (window.top !== window.self || !RecorderDom.isHtmlPage()) {
    return;
  }

  var recentSubmit = {
    at: 0,
    formTarget: ""
  };
  var pendingTextCaptures = new WeakMap();

  function sendCommand(payload) {
    chrome.runtime.sendMessage(
      Object.assign(
        {
          type: "record-command"
        },
        payload
      )
    );
  }

  function recordTextEntry(element) {
    if (!RecorderDom.isTextInput(element)) {
      return;
    }

    var locator = RecorderDom.buildLocatorBundle(element);
    if (!locator) {
      return;
    }

    sendCommand({
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

    var locator = RecorderDom.buildLocatorBundle(element);
    if (!locator) {
      return;
    }

    if (RecorderDom.isCheckable(element)) {
      sendCommand({
        command: element.checked ? "check" : "uncheck",
        target: locator.primary,
        targets: locator.targets,
        value: ""
      });
      return;
    }

    if (RecorderDom.isSelect(element)) {
      var selectedValue = RecorderDom.getSelectedOptionLocator(element);
      if (!selectedValue) {
        return;
      }

      sendCommand({
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

    Array.prototype.forEach.call(form.elements, function (element) {
      recordControlState(element);
    });
  }

  function scheduleTextCapture(element) {
    if (!RecorderDom.isTextInput(element)) {
      return;
    }

    var existingTimeout = pendingTextCaptures.get(element);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    var timeoutId = setTimeout(function () {
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
    var clickable = RecorderDom.findClickableTarget(event.target);
    if (!clickable) {
      return;
    }

    var relatedForm = RecorderDom.getAssociatedForm(clickable);
    if (relatedForm) {
      flushFormState(relatedForm);
    }

    if (!RecorderDom.anchorTriggersNavigation(clickable) && !RecorderDom.isSubmitControl(clickable) && !relatedForm) {
      return;
    }

    var locator = RecorderDom.buildLocatorBundle(clickable);
    if (!locator) {
      return;
    }

    sendCommand({
      command: "click",
      target: locator.primary,
      targets: locator.targets,
      value: "",
      expectsNavigation: RecorderDom.anchorTriggersNavigation(clickable) || RecorderDom.isSubmitControl(clickable)
    });
  }

  function onChange(event) {
    var element = event.target;
    if (RecorderDom.isTextInput(element)) {
      scheduleTextCapture(element);
      return;
    }

    var locator = RecorderDom.buildLocatorBundle(element);

    if (!locator) {
      return;
    }

    if (RecorderDom.isCheckable(element)) {
      sendCommand({
        command: element.checked ? "check" : "uncheck",
        target: locator.primary,
        targets: locator.targets,
        value: ""
      });
      return;
    }

    if (RecorderDom.isSelect(element)) {
      var selectedValue = RecorderDom.getSelectedOptionLocator(element);
      if (!selectedValue) {
        return;
      }

      sendCommand({
        command: "select",
        target: locator.primary,
        targets: locator.targets,
        value: selectedValue
      });
    }
  }

  function onClick(event) {
    var clickable = RecorderDom.findClickableTarget(event.target);
    if (!clickable) {
      return;
    }

    if (RecorderDom.isCheckable(clickable) || RecorderDom.isTextInput(clickable) || RecorderDom.isSelect(clickable)) {
      return;
    }

    var locator = RecorderDom.buildLocatorBundle(clickable);
    if (!locator) {
      return;
    }

    if (RecorderDom.isSubmitControl(clickable)) {
      var relatedForm = RecorderDom.getAssociatedForm(clickable);
      if (relatedForm) {
        var formLocator = RecorderDom.buildLocatorBundle(relatedForm);
        recentSubmit.formTarget = formLocator ? formLocator.primary : "";
        recentSubmit.at = Date.now();
      }
    }

    sendCommand({
      command: "click",
      target: locator.primary,
      targets: locator.targets,
      value: "",
      expectsNavigation: RecorderDom.anchorTriggersNavigation(clickable) || RecorderDom.isSubmitControl(clickable)
    });
  }

  function onSubmit(event) {
    var form = event.target;
    flushFormState(form);
    var locator = RecorderDom.buildLocatorBundle(form);

    if (!locator) {
      return;
    }

    if (recentSubmit.formTarget === locator.primary && Date.now() - recentSubmit.at < 1500) {
      return;
    }

    sendCommand({
      command: "submit",
      target: locator.primary,
      targets: locator.targets,
      value: "",
      expectsNavigation: true
    });
  }

  document.addEventListener("blur", onBlur, true);
  document.addEventListener("input", onInput, true);
  document.addEventListener("keyup", onKeyUp, true);
  document.addEventListener("paste", onPaste, true);
  document.addEventListener("cut", onCut, true);
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("change", onChange, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("submit", onSubmit, true);
})();
