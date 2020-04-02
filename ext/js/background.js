var connectionListener = (function () { 
  var openPorts = 0;
  chrome.runtime.onConnect.addListener(function(port) {
    openPorts += 1;
    console.log('Port connected', port, openPorts, chrome.runtime.lastError);
    port.onDisconnect.addListener(function () {
      openPorts -= 1;
      console.log('Port disconnected', openPorts);
      if (openPorts == 0)
        setIcon('disconnected');
    });
  });
})();

chrome.commands.onCommand.addListener((command) => {
  if (command == "switch_back")
    getGoogleMeetTabs().then(tabs => { if (tabs.length) {
      chrome.windows.update(tabs[0].windowId, {focused: true});
      chrome.tabs.update(tabs[0].id, {active: true});
    }});
  else
    handleInTabCommand(command)
})

chrome.runtime.onMessage.addListener(
  (request, sender, sendResponse) => {
    if (request.hasOwnProperty('mute')) {
      setIcon(request.mute)
    }
  })

chrome.browserAction.onClicked.addListener((tab) => {
  handleInTabCommand('toggle_mute')
})

// For any existing Google Meet tabs on reload inject the script 
getGoogleMeetTabs().then(tabs => {
  tabs.forEach(tab => {
    chrome.tabs.executeScript(tab.id, {file: '/js/meetmute.js'});
  });
}); 

function handleInTabCommand(command) {
  getGoogleMeetTabs().then(tabs => { if (tabs.length) processCommand(command, tabs) });
}

function getGoogleMeetTabs(windowList) {
  return new Promise(accept => chrome.tabs.query({url: "https://meet.google.com/*"}, accept));
}

function processCommand(command, googleMeetTabs) {
  googleMeetTabs.forEach((tab) => {
    chrome.tabs.sendMessage(tab.id, { command: command }, response => {
      if (response)
        setIcon(response.mute)
    })
  })
}

function setIcon(status) {
  let iconType = ''
  if (status === 'muted' || status === 'unmuted') {
    iconType = '_' + status
  }
  let title = status.charAt(0).toUpperCase() + status.substr(1)
  chrome.browserAction.setIcon({
    path: {
      "16": `icons/icon16${ iconType }.png`,
      "48": `icons/icon48${ iconType }.png`
    }
  })
  chrome.browserAction.setTitle({
    title: title
  })
}
