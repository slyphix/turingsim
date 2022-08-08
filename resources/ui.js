"use strict";

$(document).ready(() => {

  //////////////////////////////////////////////////////////////////////////////////////////////
  // CONSTANTS
  //////////////////////////////////////////////////////////////////////////////////////////////

  const REM_TO_PIXELS = 100 / $("#rem-converter").width();
  const SPEED_DELAYS = [1500, 1000, 300, 50];
  const PERSIST_FORMAT = /^#T([0-9]+)([+-][0-9]+)!(.*)$/;
  const GRAPHEME_SPLITTER = new GraphemeSplitter();
  const URL_PARAMS = new URL(location.href).searchParams;
  const UI_ELEMENTS = {
    buttonResetSetup: $("#control-reset-setup"),
    buttonPlayPause: $("#control-start-halt"),
    buttonStep: $("#control-step"),
    buttonSkip: $("#control-skip"),

    displayState: $("#statistics-state"),
    displayTransitions: $("#statistics-transitions"),
    displayDone: $("#statistics-done"),
    displayAccept: $("#statistics-accept"),
    displayStatus: $("#status-panel"),

    buttonSpeed: [
      $("#control-speed-slower"),
      $("#control-speed-slow"),
      $("#control-speed-fast"),
      $("#control-speed-faster")],

    textFieldProgram: $("#program"),
    indicatorCodeChanged: $("#code-changed-indicator"),
    overlayExamples: $("#example-selection-overlay"),
    overlayHelp: $("#help-overlay"),

    tapeContainer: $("#tapes"),
    tapeTemplate: $("#tape-template"),
    halfTape: 0,
    tapeElements: [],
  };

  const UIMode = Object.freeze({
    Halted: "Halted",
    Paused: "Paused",
    Running: "Running",
    Skipping: "Skipping",
    Uninitialized: "Uninitialized",
  });

  //////////////////////////////////////////////////////////////////////////////////////////////
  // GENERAL UTILITIES
  //////////////////////////////////////////////////////////////////////////////////////////////

  function isNumeric(input) {
    return /^[+-]?\d+$/.test(input);
  }

  function splitIntoGraphemeClusters(s, maxLength) {
    if (Number.isFinite(maxLength)) {
      let itr = GRAPHEME_SPLITTER.iterateGraphemes(s);
      let result = [];
      let counter = 0;
      for (let c of itr) {
        if (counter >= maxLength) break;
        result[result.length] = c;
        counter++;
      }
      return result;
    } else {
      return GRAPHEME_SPLITTER.splitGraphemes(s);
    }
  }

  function b64encode(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  function b64decode(b64) {
    return decodeURIComponent(escape(atob(b64)));
  }

  //////////////////////////////////////////////////////////////////////////////////////////////
  // UI UTILITIES
  //////////////////////////////////////////////////////////////////////////////////////////////

  function runningAsPWA() {
    return matchMedia('(display-mode: standalone)').matches;
  }

  function showMessage(message) {
    function unify(num) {
      return (num < 10) ? "0" + num : num;
    }
    let now = new Date();
    let timestamp = "[" + unify(now.getHours()) + ":" + unify(now.getMinutes()) + ":" + unify(now.getSeconds()) + "]";
    let fullMessage = timestamp + " " + message;
    UI_ELEMENTS.displayStatus.text(fullMessage);
    UI_ELEMENTS.displayStatus.addClass("highlight");
  }

  function showError(message) {
    showMessage("ERROR: " + message);
  }

  function showHaltMessage() {
    if (UI_STATE.tm.isMissingTransition()) {
      showMessage("TM halted due to missing transition.");
    } else {
      showMessage("TM halted due to reaching a halt state.");
    }
  }

  function updateURL() {
    let params = URL_PARAMS.toString();
    let full = params.length === 0 ? location.pathname : `${location.pathname}?${URL_PARAMS.toString()}`;
    history.replaceState({}, "", full);
  }

  function updateTapesFull() {
    // UPDATE STATS
    UI_ELEMENTS.displayState.text(UI_STATE.tm.getCurrentState());
    UI_ELEMENTS.displayTransitions.text(UI_STATE.tm.getTotalTransitions());
    UI_ELEMENTS.displayDone.text(UI_STATE.tm.isHalted() ? "YES" : "NO");
    UI_ELEMENTS.displayAccept.text(UI_STATE.tm.isAccepting() ? "YES" : "NO");
    for (let tape = 0; tape < UI_STATE.tapeCount; ++tape) {
      UI_ELEMENTS.tapeElements[tape].displayTransitions.text(UI_STATE.tm.getTapeTransitions(tape));
      UI_ELEMENTS.tapeElements[tape].displayNonBlankSymbols.text(UI_STATE.tm.getTapeSymbols(tape));
      UI_ELEMENTS.tapeElements[tape].displayHeadPosition.text(UI_STATE.tm.getTapePosition(tape));
      UI_ELEMENTS.tapeElements[tape].indicatorLeft.toggleClass("active", UI_STATE.tm.getTapeLastDirection(tape) === Move.Right);
      UI_ELEMENTS.tapeElements[tape].indicatorRight.toggleClass("active", UI_STATE.tm.getTapeLastDirection(tape) === Move.Left);
    }

    // UPDATE TAPES
    let maxOffset = UI_STATE.halfTape;
    for (let tape = 0; tape < UI_STATE.tapeCount; ++tape) {
      let center = getFocus(tape);
      let positionOffset = center - UI_STATE.halfTape;
      let elementsToUpdate = UI_ELEMENTS.tapeElements[tape].tapeEntries.length;
      for (let index = 0; index < elementsToUpdate; ++index) {
        let text = UI_STATE.tm.getTapeEntry(tape, index + positionOffset);
        let firstCharacter = splitIntoGraphemeClusters(text, 1).join("");
        let positionText = ((index + positionOffset) % 1000 + 1000) % 1000;
        UI_ELEMENTS.tapeElements[tape].tapeEntries[index].field.innerText = firstCharacter;
        UI_ELEMENTS.tapeElements[tape].tapeEntries[index].field.title = text;
        UI_ELEMENTS.tapeElements[tape].tapeEntries[index].label.innerText = String(positionText).padStart(3, '0');
      }

      if (!hasMovingTape(tape)) {
        let newPosition = Math.max(-maxOffset, Math.min(maxOffset, UI_STATE.tm.getTapePosition(tape) - center));
        UI_ELEMENTS.tapeElements[tape].tapeHeadAlign.css("left", newPosition * 100 + "rem");
      } else {
        UI_ELEMENTS.tapeElements[tape].tapeHeadAlign.css("left", 0);
      }
    }
  }

  function forceCancelAnimation() {
    for (let tape = 0; tape < UI_STATE.tapeCount; ++tape) {
      const target = hasMovingTape(tape) ? UI_ELEMENTS.tapeElements[tape].tape : UI_ELEMENTS.tapeElements[tape].tapeHead;
      target.trigger("animationend");
      // trigger rebuild
      target.width();
    }
  }

  function cancelNextStepTimeout() {
    if (!UI_STATE.nextStepTimeout) return;
    clearTimeout(UI_STATE.nextStepTimeout);
    UI_STATE.nextStepTimeout = null;
  }

  function cancelSkip() {
    if (UI_STATE.worker === null) return;
    UI_STATE.worker.postMessage(new TuringControlMessage("stop", true));
  }

  function cancelSkipWithoutResult() {
    if (UI_STATE.worker === null) return;
    UI_STATE.worker.postMessage(new TuringControlMessage("stop", false));
  }

  function selectSpeed(speed) {
    UI_ELEMENTS.buttonSpeed[UI_STATE.selectedSpeed].addClass("active");
    UI_STATE.selectedSpeed = speed;
    UI_ELEMENTS.buttonSpeed[UI_STATE.selectedSpeed].removeClass("active");
  }

  function canResetAndSetup() {
    return UI_STATE.mode !== UIMode.Uninitialized;
  }

  function canPlayPause() {
    return UI_STATE.mode !== UIMode.Halted && UI_STATE.mode !== UIMode.Uninitialized;
  }

  function canStep() {
    return UI_STATE.mode === UIMode.Paused;
  }

  function canSkip() {
    return UI_STATE.mode === UIMode.Paused && typeof(Worker) !== "undefined" && location.protocol !== "file:";
  }

  function setMode(newMode) {
    UI_STATE.mode = newMode;
    UI_ELEMENTS.buttonResetSetup.toggleClass("active", canResetAndSetup());
    UI_ELEMENTS.buttonPlayPause.toggleClass("active", canPlayPause());
    UI_ELEMENTS.buttonStep.toggleClass("active", canStep());
    UI_ELEMENTS.buttonSkip.toggleClass("active", canSkip());
  }

  function addAsComment(text) {
    UI_ELEMENTS.textFieldProgram.val("#" + text + "\n" + UI_ELEMENTS.textFieldProgram.val());
  }

  function hasMovingTape(tape) {
    return UI_STATE.tapeFocus[tape] === null;
  }

  function getFocus(tape) {
    return hasMovingTape(tape) ? UI_STATE.tm.getTapePosition(tape) : UI_STATE.tapeFocus[tape];
  }

  function setFocus(tape, position) {
    UI_STATE.tapeFocus[tape] = position || 0;
    UI_ELEMENTS.tapeElements[tape].textFieldPosition.val(position);
    updateTapesFull();
  }

  function resetFocus(tape) {
    UI_STATE.tapeFocus[tape] = null;
    UI_ELEMENTS.tapeElements[tape].textFieldPosition.val("");
    updateTapesFull();
  }

  function moveFocus(tape, offset) {
    setFocus(tape, getFocus(tape) + offset);
  }

  function embed() {
    if (runningAsPWA()) {
      (async () => await navigator.clipboard.writeText(UI_ELEMENTS.textFieldProgram.val()))();
      showMessage("Program copied to clipboard!");
    } else {
      if (UI_ELEMENTS.textFieldProgram.val().length === 0) {
        URL_PARAMS.delete("code");
        URL_PARAMS.delete("install");
      } else {
        URL_PARAMS.delete("code");
        URL_PARAMS.delete("install");
        URL_PARAMS.set("code", b64encode(UI_ELEMENTS.textFieldProgram.val()));
        showMessage("Copy the URL to share your program!");
      }
      updateURL();
    }
  }

  function fillTapes() {
    for (let tape = 0; tape < UI_STATE.tapeCount; ++tape) {
      let characters = splitIntoGraphemeClusters(UI_ELEMENTS.tapeElements[tape].textFieldInitialContent.val());
      let offsetString = UI_ELEMENTS.tapeElements[tape].textFieldInitialOffset.val();
      let offset = 0;
      if (offsetString.length > 0) {
        if (!isNumeric(offsetString)) {
          showError("Non-numeric offset input for tape " + (tape + 1));
          return;
        }
        offset = Number(offsetString);
      }
      for (let index = 0; index < characters.length; ++index) {
        if (characters[index] === " ") continue;
        UI_STATE.tm.setTapeEntry(tape, index + offset, characters[index]);
      }
    }
  }

  function resetInitialContents() {
    for (let tape = 0; tape < UI_STATE.tapeCount; ++tape) {
      UI_ELEMENTS.tapeElements[tape].textFieldInitialContent.val("");
      UI_ELEMENTS.tapeElements[tape].textFieldInitialOffset.val("");
    }
  }

  //////////////////////////////////////////////////////////////////////////////////////////////
  // TRANSPORT
  //////////////////////////////////////////////////////////////////////////////////////////////

  function performStep() {
    UI_STATE.tm.advance();

    if (UI_STATE.tm.isHalted()) {
      setMode(UIMode.Halted);
      cancelNextStepTimeout();
      showHaltMessage();
    }

    updateTapesFull();

    let delay = SPEED_DELAYS[UI_STATE.selectedSpeed] * 0.75;
    let delayText = delay + "ms";

    for (let tape = 0; tape < UI_STATE.tapeCount; ++tape) {
      let direction = UI_STATE.tm.getTapeLastDirection(tape);
      if (direction === Move.None) continue;
      if (UI_STATE.selectedSpeed === SPEED_DELAYS.length - 1) continue;

      if (hasMovingTape(tape)) {
        let target = UI_ELEMENTS.tapeElements[tape].tape;
        let tapeClass = direction === Move.Left ? "offset-left" : "offset-right";
        target.css("animation-duration", delayText);
        target.addClass(tapeClass);
      } else {
        let target = UI_ELEMENTS.tapeElements[tape].tapeHead;
        let headClass = direction === Move.Right ? "offset-left" : "offset-right";
        target.css("animation-duration", delayText);
        target.addClass(headClass);
      }
    }
  }

  function triggerResetAndSetup() {
    if (!canResetAndSetup())
      return;
    forceCancelAnimation();
    cancelNextStepTimeout();
    cancelSkipWithoutResult();

    UI_STATE.tm.reset();
    fillTapes();
    setMode(UIMode.Paused);
    updateTapesFull();
    showMessage("Initialized successfully.");
  }

  function triggerPlayPause() {
    if (!canPlayPause())
      return;

    function schedule() {
      UI_STATE.nextStepTimeout = setTimeout(schedule, SPEED_DELAYS[UI_STATE.selectedSpeed]);
      performStep();
    }

    switch (UI_STATE.mode) {
      case UIMode.Paused:
        setMode(UIMode.Running);
        forceCancelAnimation();
        setTimeout(schedule, 0);
        break;
      case UIMode.Running:
        setMode(UIMode.Paused);
        cancelNextStepTimeout();
        break;
      case UIMode.Skipping:
        cancelSkip();
        break;
    }
  }

  function triggerStep() {
    if (!canStep())
      return;
    forceCancelAnimation();
    performStep();
  }

  function triggerSkip() {
    if (!canSkip())
      return;

    UI_STATE.worker = new Worker("./resources/worker.js");
    UI_STATE.worker.addEventListener("message", event => {
      let msg = event.data;

      UI_STATE.worker = null;

      if (msg.type === "error") {
        UI_STATE.mode = UIMode.Halted;
        showError(msg.data);
        return;
      }

      UI_STATE.tm = TuringMachine.deserialize(msg.data);

      switch (msg.type) {
        case "interrupt":
          setMode(UIMode.Paused);
          showMessage("Skip interrupted");
          break;
        case "done":
          setMode(UIMode.Halted);
          showHaltMessage();
          break;
        case "timeout":
          setMode(UIMode.Paused);
          showMessage("Skip timed out");
          break;
      }
      updateTapesFull();
    });
    setMode(UIMode.Skipping);
    UI_STATE.worker.postMessage(new TuringControlMessage("start", UI_STATE.tm.serialize()));
  }

  //////////////////////////////////////////////////////////////////////////////////////////////
  // INSTALLATION AND TAPE BUILDING
  //////////////////////////////////////////////////////////////////////////////////////////////

  function install() {
    forceCancelAnimation();
    cancelNextStepTimeout();
    cancelSkipWithoutResult();

    let programText = UI_ELEMENTS.textFieldProgram.val();

    try {
      let program = Program.make(programText);
      UI_STATE.tm = TuringMachine.make(program);
    } catch (e) {
      if (e instanceof ProgrammingError) {
        showMessage(`ERROR IN LINE ${e.line}: ${e.message}`);
      } else {
        showError(e.message);
      }
      return;
    }

    UI_ELEMENTS.indicatorCodeChanged.addClass("hidden");
    UI_STATE.tapeCount = UI_STATE.tm.getTapeCount();
    setupTapes();

    // import persisted tapes
    for (let line of programText.split("\n")) {
      let match = line.match(PERSIST_FORMAT);
      if (match) {
        let tape = Number(match[1]) - 1;
        let offset = Number(match[2]);
        let contents = match[3];
        if (tape >= 0 && tape < UI_STATE.tapeCount) {
          UI_ELEMENTS.tapeElements[tape].textFieldInitialContent.val(contents);
          UI_ELEMENTS.tapeElements[tape].textFieldInitialOffset.val(offset);
        }
      }
    }

    fillTapes();
    setMode(UIMode.Paused);
    updateTapesFull();
    showMessage("Installed successfully.");
  }

  function resizeTapes() {
    if (UI_STATE.tm === null) return;

    let tapeEntryWidth = REM_TO_PIXELS * 50;
    let tapeContainerWidth = UI_ELEMENTS.tapeContainer.outerWidth();
    UI_STATE.halfTape = Math.ceil(tapeContainerWidth / tapeEntryWidth / 2) + 2;
    let newElementCount = UI_STATE.halfTape * 2 + 1;

    for (let i = 0; i < UI_STATE.tapeCount; ++i) {
      let currentElementCount = UI_ELEMENTS.tapeElements[i].tapeEntries.length;
      if (newElementCount === currentElementCount) continue;

      UI_ELEMENTS.tapeElements[i].tapeEntries = [];
      UI_ELEMENTS.tapeElements[i].tape.empty();
      for (let j = 0; j < newElementCount; ++j) {
        let newTapeEntry = document.createElement("div");
        let newTapeField = document.createElement("div");
        let newTapeLabel = document.createElement("div");
        newTapeEntry.className = "tape-entry";
        newTapeField.className = "tape-field";
        newTapeLabel.className = "tape-label";
        newTapeEntry.appendChild(newTapeField);
        newTapeEntry.appendChild(newTapeLabel);
        UI_ELEMENTS.tapeElements[i].tape.append(newTapeEntry);
        UI_ELEMENTS.tapeElements[i].tapeEntries[j] = {
          field: newTapeField,
          label: newTapeLabel
        };
      }
    }
    updateTapesFull();
  }

  function setupTapes() {
    if (UI_STATE.tapeCount === UI_ELEMENTS.tapeElements.length) return;

    UI_ELEMENTS.tapeContainer.empty();
    UI_ELEMENTS.tapeElements = [];
    for (let i = 0; i < UI_STATE.tapeCount; ++i) {
      const newTape = UI_ELEMENTS.tapeTemplate.clone();
      newTape.prop("id", "");

      UI_ELEMENTS.tapeElements[i] = {
        textFieldPosition: newTape.find(".js-input-position"),

        displayTransitions: newTape.find(".js-output-transitions"),
        displayNonBlankSymbols: newTape.find(".js-output-symbols"),
        displayHeadPosition: newTape.find(".js-output-head"),

        indicatorLeft: newTape.find(".tape-head-left-indicator"),
        indicatorRight: newTape.find(".tape-head-right-indicator"),

        textFieldInitialContent: newTape.find(".js-input-content"),
        textFieldInitialOffset: newTape.find(".js-input-offset"),

        tapeHead: newTape.find(".tape-head"),
        tapeHeadAlign: newTape.find(".tape-head-align"),
        tape: newTape.find(".tape"),

        tapeEntries: [],
      };

      UI_ELEMENTS.tapeElements[i].tape.on("animationend", () => {
        UI_ELEMENTS.tapeElements[i].tape.removeClass("offset-left");
        UI_ELEMENTS.tapeElements[i].tape.removeClass("offset-right");
      });

      UI_ELEMENTS.tapeElements[i].tapeHead.on("animationend", () => {
        UI_ELEMENTS.tapeElements[i].tapeHead.removeClass("offset-left");
        UI_ELEMENTS.tapeElements[i].tapeHead.removeClass("offset-right");
      });

      const confirmButton = newTape.find(".js-button-set");
      UI_ELEMENTS.tapeElements[i].textFieldPosition.on("keyup", e => {
        if (e.which === 13) confirmButton.click();
      });
      UI_ELEMENTS.tapeElements[i].textFieldInitialContent.on("keyup", e => {
        if (e.which === 13) triggerResetAndSetup();
      });
      UI_ELEMENTS.tapeElements[i].textFieldInitialOffset.on("keyup", e => {
        if (e.which === 13) triggerResetAndSetup();
      });

      newTape.find(".js-output-number").text(i + 1);

      confirmButton.on("click", () => {
        const input = UI_ELEMENTS.tapeElements[i].textFieldPosition.val();
        if (input.length === 0) {
          resetFocus(i);
        } else if (isNumeric(input)) {
          setFocus(i, Number(input));
        } else {
          showMessage("ERROR: Non-numeric focus input for tape " + (i + 1));
        }
      });
      newTape.find(".js-button-reset").on("click", () => resetFocus(i));
      newTape.find(".js-button-first").on("click", () => setFocus(i, UI_STATE.tm.getTapeMin(i)));
      newTape.find(".js-button-last").on("click", () => setFocus(i, UI_STATE.tm.getTapeMax(i)));

      newTape.find(".js-button-left").on("click", () => moveFocus(i, -3));
      newTape.find(".js-button-left-fast").on("click", () => moveFocus(i, -30));
      newTape.find(".js-button-right").on("click", () => moveFocus(i, 3));
      newTape.find(".js-button-right-fast").on("click", () => moveFocus(i, 30));

      newTape.find(".js-button-raw").on("click", () => {
        let text = UI_STATE.tm.getTapeDense(i)
          .map(text => splitIntoGraphemeClusters(text, 1).join(""))
          .map(text => text.length === 0 ? " " : text)
          .join("");
        addAsComment(text);
      });
      newTape.find(".js-button-csv").on("click", () => {
        let text = UI_STATE.tm.getTapeDense(i)
          .map(e => "\"" + e.replace("\"", "\\\"") + "\"")
          .join(",");
        addAsComment(text);
      });
      newTape.find(".js-button-json").on("click", () => {
        let text = JSON.stringify(Object.fromEntries(UI_STATE.tm.getTapeSparse(i)));
        addAsComment(text);
      });
      newTape.find(".js-button-tape-init").on("click", () => triggerResetAndSetup());
      newTape.find(".js-button-tape-reset").on("click", () => resetInitialContents());

      UI_ELEMENTS.tapeContainer.append(newTape);
    }
    UI_STATE.tapeFocus = new Array(UI_STATE.tapeCount).fill( null);
    resizeTapes();
  }

  //////////////////////////////////////////////////////////////////////////////////////////////
  // INITIAL SETUP
  //////////////////////////////////////////////////////////////////////////////////////////////

  const UI_STATE = {
    mode: UIMode.Uninitialized,
    selectedSpeed: 2,
    tapeFocus: [],
    worker: null,
    nextStepTimeout: null,
    tm: null,
    tapeCount: 0
  };
  setMode(UIMode.Uninitialized);
  selectSpeed(2);

  UI_ELEMENTS.buttonResetSetup.on("click", triggerResetAndSetup);
  UI_ELEMENTS.buttonPlayPause.on("click", triggerPlayPause);
  UI_ELEMENTS.buttonStep.on("click", triggerStep);
  UI_ELEMENTS.buttonSkip.on("click", triggerSkip);
  UI_ELEMENTS.buttonSpeed.forEach((button, i) => button.on("click", () => selectSpeed(i)));
  UI_ELEMENTS.textFieldProgram.on("input", () => UI_ELEMENTS.indicatorCodeChanged.removeClass("hidden"));
  UI_ELEMENTS.displayStatus.on("animationend", () => UI_ELEMENTS.displayStatus.removeClass("highlight"));

  $(document).on("keypress", e => {
    if (e.target.closest("textarea, input")) return;
    let newSpeed = [49, 50, 51, 52].indexOf(e.which);
    if (newSpeed >= 0) selectSpeed(newSpeed);
    if (e.which === 32) triggerStep();
  });
  $(window).on("resize", resizeTapes);

  for (let [desc, code] of Object.entries(examples)) {
    let button = document.createElement("div");
    button.className = "inverted-button";
    button.innerText = desc;
    button.addEventListener("click", () => {
      UI_ELEMENTS.textFieldProgram.val(code);
      UI_ELEMENTS.overlayExamples.removeClass("visible");
      UI_ELEMENTS.indicatorCodeChanged.removeClass("hidden");
    });
    $("#example-list").append(button);
  }

  $("#examples-button").on("click", () => UI_ELEMENTS.overlayExamples.toggleClass("visible"));
  $("#example-close-button").on("click", () => UI_ELEMENTS.overlayExamples.removeClass("visible"));
  $("#help-button").on("click", () => UI_ELEMENTS.overlayHelp.addClass("visible"));
  $("#help-close-button").on("click", () => UI_ELEMENTS.overlayHelp.removeClass("visible"));
  $("#embed-button").on("click", () => embed());
  $("#install-button").on("click", () => install());

  if (URL_PARAMS.has("code")) {
    UI_ELEMENTS.textFieldProgram.val(b64decode(URL_PARAMS.get("code")));
    showMessage("Code successfully imported from URL!");
    URL_PARAMS.delete("code");
    updateURL();
  } if (URL_PARAMS.has("install")) {
    UI_ELEMENTS.textFieldProgram.val(b64decode(URL_PARAMS.get("install")));
    install();
    URL_PARAMS.delete("install");
    updateURL();
  } else {
    showMessage("Welcome to TMS! Select an example below!");
  }

  if (URL_PARAMS.has("help")) {
    UI_ELEMENTS.overlayHelp.addClass("visible");
    URL_PARAMS.delete("help");
    updateURL();
  }

  if (URL_PARAMS.has("examples")) {
    UI_ELEMENTS.overlayExamples.addClass("visible");
    URL_PARAMS.delete("examples");
    updateURL();
  }
});

//////////////////////////////////////////////////////////////////////////////////////////////
// PWA
//////////////////////////////////////////////////////////////////////////////////////////////

addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  let invitation = $("#pwa-invitation");
  invitation.removeClass("hidden");
  invitation.one("click", () => e.prompt());
  return false;
});

if ("serviceWorker" in navigator) {
  $(window).on("load", () => {
    navigator.serviceWorker.register("sw.js").catch(reason => console.log("Could not register service worker."));
  });
}
