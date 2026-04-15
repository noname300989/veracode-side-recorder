(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RecorderDom = factory();
  }
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  function cssEscape(value) {
    if (typeof CSS !== "undefined" && CSS.escape) {
      return CSS.escape(value);
    }

    return String(value).replace(/[^a-zA-Z0-9_\u00A0-\uFFFF-]/g, function (character) {
      return "\\" + character;
    });
  }

  function stringValue(value) {
    return String(value == null ? "" : value).trim();
  }

  function isHtmlElement(element) {
    return !!(element && element.nodeType === Node.ELEMENT_NODE);
  }

  function isHtmlPage() {
    if (!document || !document.documentElement) {
      return false;
    }

    var contentType = document.contentType || "";
    return !contentType || contentType.indexOf("html") >= 0;
  }

  function uniqueSelector(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch (_error) {
      return false;
    }
  }

  function hasUsefulAttribute(element, attributeName) {
    var value = stringValue(element.getAttribute(attributeName));
    return value && value.length <= 200;
  }

  function buildCssSelector(element) {
    if (!isHtmlElement(element)) {
      return "";
    }

    if (element.id) {
      return "#" + cssEscape(element.id);
    }

    var directAttributes = ["data-testid", "data-test", "data-qa", "aria-label", "name"];
    for (var attributeIndex = 0; attributeIndex < directAttributes.length; attributeIndex += 1) {
      var attributeName = directAttributes[attributeIndex];
      if (hasUsefulAttribute(element, attributeName)) {
        var selector = element.tagName.toLowerCase() + "[" + attributeName + "=\"" + element.getAttribute(attributeName).replace(/"/g, "\\\"") + "\"]";
        if (uniqueSelector(selector)) {
          return selector;
        }
      }
    }

    var parts = [];
    var current = element;
    while (current && current !== document.body && current.nodeType === Node.ELEMENT_NODE) {
      var part = current.tagName.toLowerCase();

      if (current.id) {
        part += "#" + cssEscape(current.id);
        parts.unshift(part);
        break;
      }

      var siblings = current.parentElement
        ? Array.prototype.filter.call(current.parentElement.children, function (child) {
            return child.tagName === current.tagName;
          })
        : [];

      if (siblings.length > 1) {
        part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
      }

      parts.unshift(part);
      current = current.parentElement;

      var selectorCandidate = parts.join(" > ");
      if (selectorCandidate && uniqueSelector(selectorCandidate)) {
        return selectorCandidate;
      }
    }

    return parts.join(" > ");
  }

  function buildLocatorBundle(element) {
    if (!isHtmlElement(element)) {
      return null;
    }

    var targets = [];
    var primary = "";

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

    ["data-testid", "data-test", "data-qa", "aria-label", "placeholder", "title", "alt"].forEach(function (attributeName) {
      if (hasUsefulAttribute(element, attributeName)) {
        var locator = "css=" + element.tagName.toLowerCase() + "[" + attributeName + "=\"" + element.getAttribute(attributeName).replace(/"/g, "\\\"") + "\"]";
        if (!targets.some(function (candidate) { return candidate[0] === locator; })) {
          targets.push([locator, "css"]);
          if (!primary) {
            primary = locator;
          }
        }
      }
    });

    var cssSelector = buildCssSelector(element);
    if (cssSelector) {
      var cssLocator = "css=" + cssSelector;
      if (!targets.some(function (candidate) { return candidate[0] === cssLocator; })) {
        targets.push([cssLocator, "css"]);
        if (!primary) {
          primary = cssLocator;
        }
      }
    }

    if (!primary) {
      return null;
    }

    return {
      primary: primary,
      targets: targets
    };
  }

  function isTextInput(element) {
    if (!isHtmlElement(element)) {
      return false;
    }

    if (element.tagName === "TEXTAREA") {
      return true;
    }

    if (element.tagName !== "INPUT") {
      return false;
    }

    var type = stringValue(element.type).toLowerCase();
    return [
      "",
      "color",
      "date",
      "datetime-local",
      "email",
      "month",
      "number",
      "password",
      "search",
      "tel",
      "text",
      "time",
      "url",
      "week"
    ].indexOf(type) >= 0;
  }

  function isCheckable(element) {
    return isHtmlElement(element) && element.tagName === "INPUT" && ["checkbox", "radio"].indexOf(stringValue(element.type).toLowerCase()) >= 0;
  }

  function isSelect(element) {
    return isHtmlElement(element) && element.tagName === "SELECT";
  }

  function isSubmitControl(element) {
    if (!isHtmlElement(element)) {
      return false;
    }

    if (element.tagName === "BUTTON") {
      var buttonType = stringValue(element.type).toLowerCase();
      return !buttonType || buttonType === "submit";
    }

    if (element.tagName === "INPUT") {
      return ["submit", "image"].indexOf(stringValue(element.type).toLowerCase()) >= 0;
    }

    return false;
  }

  function getAssociatedForm(element) {
    if (!isHtmlElement(element)) {
      return null;
    }

    return element.form || element.closest("form");
  }

  function isNativeClickElement(element) {
    if (!isHtmlElement(element)) {
      return false;
    }

    if (["A", "BUTTON", "SUMMARY"].indexOf(element.tagName) >= 0) {
      return true;
    }

    if (element.tagName === "INPUT") {
      var type = stringValue(element.type).toLowerCase();
      return ["button", "image", "reset", "submit"].indexOf(type) >= 0;
    }

    if (element.getAttribute("role") === "button") {
      return true;
    }

    return false;
  }

  function findClickableTarget(startNode) {
    if (!startNode) {
      return null;
    }

    var element = startNode.nodeType === Node.TEXT_NODE ? startNode.parentElement : startNode;
    var originalElement = element;

    while (element && element !== document.body) {
      if (isNativeClickElement(element)) {
        return element;
      }
      element = element.parentElement;
    }

    return originalElement;
  }

  function anchorTriggersNavigation(anchor) {
    if (!isHtmlElement(anchor) || anchor.tagName !== "A") {
      return false;
    }

    var href = stringValue(anchor.getAttribute("href"));
    if (!href || href === "#" || href.toLowerCase().indexOf("javascript:") === 0) {
      return false;
    }

    return anchor.target !== "_blank";
  }

  function getSelectedOptionLocator(selectElement) {
    if (!isSelect(selectElement)) {
      return "";
    }

    var option = selectElement.options[selectElement.selectedIndex];
    if (!option) {
      return "";
    }

    var optionValue = stringValue(option.value);
    if (optionValue) {
      return "value=" + optionValue;
    }

    return "label=" + stringValue(option.textContent);
  }

  return {
    isHtmlPage: isHtmlPage,
    buildLocatorBundle: buildLocatorBundle,
    isTextInput: isTextInput,
    isCheckable: isCheckable,
    isSelect: isSelect,
    isSubmitControl: isSubmitControl,
    getAssociatedForm: getAssociatedForm,
    findClickableTarget: findClickableTarget,
    anchorTriggersNavigation: anchorTriggersNavigation,
    getSelectedOptionLocator: getSelectedOptionLocator
  };
});
