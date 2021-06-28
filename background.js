/**
 * Startup check for tabs. Query is currently not waiting till startup has finished,
 * so we need to look at the created tabs and decide, wether those are created during
 * startup, or later.
 */

// We consider StartupDone if no more tabs are created within a defined time frame.
let startup = {};
let lastEventAt = null;

const TABDELAY = 400;
const IDLETIME = 1000;

async function setStartupDone (windowId) {
  startup[windowId].done = true;
  let activeTabs = await messenger.tabs.query({active:true, mailTab: true, windowId});
  let inactiveTabs = await messenger.tabs.query({active:false, mailTab: true, windowId});
  if (activeTabs.length == 0 && inactiveTabs.length > 0) {
    browser.tabs.update(inactiveTabs[0].id, {active:true});
  }
}

function startupCheck (windowId) {
  if (lastEventAt != null && Date.now() - lastEventAt > IDLETIME) {
    return false;
  }

  if (!startup.hasOwnProperty(windowId)) {
    startup[windowId] = {
      done: false,
      timeout: null,
    };
  }
  if (!startup[windowId].done) {
    if (startup[windowId].timeout) {
      window.clearTimeout(startup[windowId].timeout);
    }
    startup[windowId].timeout = window.setTimeout(() => setStartupDone(windowId), TABDELAY);
  }
  
  lastEventAt = Date.now();
  return true;
}

async function load() {
  function listener(tab) {
    if (!startupCheck(tab.windowId)) {
      browser.tabs.onCreated.removeListener(listener);
    }
  }
  browser.tabs.onCreated.addListener(listener);

  let windows = await browser.windows.getAll({windowTypes:["normal"]});
  if (windows.length > 0) {
    // There has been a window open during startup, most probably this was an install.
    lastEventAt = 0;
  }
}

load();
