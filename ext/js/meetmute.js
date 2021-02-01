console.log("Meet mute loading");

const MUTE_BUTTON = 'div[role="button"][aria-label*="microphone"][data-is-muted]';
const CAMERA_BUTTON = 'div[role="button"][aria-label*="camera"][data-is-muted]';
const muteToggleKeyDownEvent = new KeyboardEvent('keydown', {
  "key": "d",
  "code": "KeyD",
  "metaKey": true,
  "charCode": 100,
  "keyCode": 100,
  "which": 100
})
const cameraToggleKeyDownEvent = new KeyboardEvent('keydown', {
  "key": "e",
  "code": "KeyE",
  "metaKey": true,
  "charCode": 69,
  "keyCode": 69,
  "which": 69
})

// const debugLog = (...arg) => console.log(...arg);
const debugLog = () => { return };

const waitUntilElementExists = (DOMSelector, MAX_TIME = 5000) => {
  let timeout = 0

  const waitForContainerElement = (resolve, reject) => {
    const container = document.querySelector(DOMSelector)
    timeout += 100

    if (timeout >= MAX_TIME) reject('Element not found')

    if (!container || container.length === 0) {
      setTimeout(waitForContainerElement.bind(this, resolve, reject), 100)
    } else {
      resolve(container)
    }
  }

  return new Promise((resolve, reject) => {
    waitForContainerElement(resolve, reject);
  })
}

var bodyClassListener = (function () {
  var callbacks = [];
  var bodyClassObserver;

  function registerListener() {
    bodyClassObserver = new MutationObserver((mutations) => {
      let newClass = mutations[0].target.getAttribute('class')
      if (mutations[0].oldValue != newClass) 
        callbacks.forEach(fn => fn());
    })

    bodyClassObserver.observe(document.querySelector('body'), {
      attributes: true, 
      attributeFilter: ['class'],
      attributeOldValue: true
    })
    debugLog("Loaded body class mutation observer");
  }

  function addCallback(fn) {
    callbacks.push(fn);
    if (callbacks.length == 1)
      registerListener();
    return;
  }

  function removeCallback(find_fn) {
    callbacks = callbacks.filter((fn, id) => fn != find_fn);
    debugLog("Remove callback", find_fn, callbacks.length, callbacks);
    if (callbacks.length == 0 && bodyClassObserver) {
      debugLog("Disconnecting from body class listening");
      bodyClassObserver.disconnect();
    }
  }

  return {addCallback: addCallback, removeCallback: removeCallback};
})();

var buttonWatcher = function (selector, type, keyToggle) {
  var waitingForButton = false
  var muted = false
  var isMutedObserver

  function watchIsMuted(el) {
    if (isMutedObserver) {
      isMutedObserver.disconnect()
    }
    isMutedObserver = new MutationObserver((mutations) => {
      let newValue = mutations[0].target.getAttribute('data-is-muted') == 'true'

      if (newValue != muted) {
        updateMuted(newValue)
      }
    })
    isMutedObserver.observe(el, {
      attributes: true, 
      attributeFilter: ['data-is-muted']
    })
    debugLog("Mutation observer", el);
  }

  function disconnect() {
    if (isMutedObserver)
      isMutedObserver.disconnect();
    debugLog("Dropping message listener");
    chrome.runtime.onMessage.removeListener(messageListener);
  }

  function updateMuted(newValue) {
    muted = newValue || isMuted()
    debugLog("Muted now", muted, type);
    if (type == 'mute')
      chrome.extension.sendMessage({ mute: muted ? 'muted' : 'unmuted' })
  }

  function isMuted() {
    let dataIsMuted = document.querySelector(selector)
        .getAttribute('data-is-muted')
    return dataIsMuted == 'true'
  }

  function sendKeyboardCommand() {
    document.dispatchEvent(keyToggle)
  }

  function waitFor() {
    debugLog("Trying to wait for button");
    if (waitingForButton) {
      return
    }
    waitingForButton = true
    debugLog("Waiting for button");
    waitUntilElementExists(selector)
      .then((el) => {
        debugLog("Found button", el);
        waitingForButton = false
        updateMuted()
        watchIsMuted(el)
      })
      .catch((error) => {
        debugLog("Error watching button", error);
        chrome.extension.sendMessage({ message: 'disconnected' })
      })
  }
  
  function messageListener(request, sender, sendResponse) {
    debugLog("Got message", request, type);
    muted = isMuted()
    if (request && request.command && request.command === 'toggle_' + type) {
      muted = !muted
      sendKeyboardCommand()
    } else if (request && request.command && request.command === type) {
      if (!muted) {
        muted = !muted
        sendKeyboardCommand()
      }
    } else if (request && request.command && request.command === 'un' + type) {
      if (muted) {
        muted = !muted
        sendKeyboardCommand()
      }
    }

    if (type == 'mute')
      sendResponse({ mute: muted ? 'muted' : 'unmuted' });
  }

  debugLog("Listening for messages", type);
  chrome.runtime.onMessage.addListener(messageListener);

  waitFor();
  return {waitFor: waitFor, disconnect: disconnect};
};

window.onbeforeunload = (event) => {
  try {
    chrome.extension.sendMessage({ message: 'disconnected' })
  } catch (e) {
    /* The extension context is often invalidated by the time this event 
     * fires */
    debugLog("Cannot send final disconnect message", e);
  }
}

var mainProcess = (function () {
  var watchers = [buttonWatcher(MUTE_BUTTON, "mute", muteToggleKeyDownEvent), 
                  buttonWatcher(CAMERA_BUTTON, "video", cameraToggleKeyDownEvent)];
  var bodyListeners = watchers.map(watcher => { var fn = () => watcher.waitFor(); bodyClassListener.addCallback(fn); return fn; });

  function disconnect() {
    debugLog("Disconnecting");
    bodyListeners.forEach(listener => bodyClassListener.removeCallback(listener));
    watchers.forEach(watcher => watcher.disconnect());
    watchers = [];
    chrome.runtime.onMessage.removeListener(disconnectAndHangupListener);
  }

  function disconnectAndHangupListener(request, sender, sendResponse) {
    if (request.command == "disconnect") 
      disconnect();
    else if (request.command == "hangup") {
      var hangup = document.querySelector("[aria-label='Leave call']")
      if (hangup)
        hangup.dispatchEvent(new MouseEvent("click", {view: window, bubbles: true, cancelable: true}))
    }
  }

  debugLog("Listening for disconnects");
  chrome.extension.onMessage.addListener(disconnectAndHangupListener);
  chrome.runtime.connect().onDisconnect.addListener(function() {
    // Clean up when content script gets disconnected
    debugLog("Parent extension gone, disconnecting", chrome.runtime.lastError);
    disconnect();
  })
  return {watchers: watchers};
})();

