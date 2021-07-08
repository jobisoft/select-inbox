let tabCreateEvents = {};

// Allowed delays between tabs opening in the same window, which is still considered as startup action.
const TAB_DELAY = 1000;
// Allowed delays between windows opening, which is still considered as startup action.
const WINDOW_DELAY = 5000;
let lastNewWindowEvent = null;

const debug = false;
function log(...args) {
  if (debug) console.log(...args);
}

async function selectInbox (windowId, timeoutReached = false) {
  log("selectInbox", windowId, tabCreateEvents[windowId].pending);
  if (tabCreateEvents[windowId].pending) {
    if (timeoutReached) tabCreateEvents[windowId].pending = false;
    
    // Switch to mailTab if there is one in this window.
    let activeTabs = await messenger.tabs.query({active:true, mailTab: true, windowId});
    let inactiveTabs = await messenger.tabs.query({active:false, mailTab: true, windowId});
    if (activeTabs.length == 0 && inactiveTabs.length > 0) {
      browser.tabs.update(inactiveTabs[0].id, {active:true});
    }
    log({activeTabs, inactiveTabs})

    // If there is a mailTab, switch to the inbox.
    if (activeTabs.length + inactiveTabs.length > 0 && !tabCreateEvents[windowId].selected) {
      tabCreateEvents[windowId].selected = true;
      let mailTab = await messenger.mailTabs.query({windowId});
      log({mailTab})
      let account = await messenger.accounts.getDefault();
      let inbox = account.folders.find(folder => folder.type == "inbox");
      log({inbox})
      if (inbox) {
        messenger.mailTabs.update(mailTab.id, {
          displayedFolder: inbox
        });
      }
      log("Done");
    }
  }
}

/**
 * The collapseTabCreateEvents function checks for each window, if the
 * tab-create-event occurred within the allowed TAB_DELAY time (delay between two
 * tabs being created). If so, the event will reschedule the "select inbox" action.
 */
function collapseTabCreateEvents (windowId) {
  // Re-arm the timer for the "select inbox" action of this window, if it is still
  // pending.
  log("COLLAPSING?", windowId)
  if (tabCreateEvents[windowId].pending) {
    selectInbox(windowId);
    log("COLLAPSING!", windowId);
    if (tabCreateEvents[windowId].timeout) {
      window.clearTimeout(tabCreateEvents[windowId].timeout);
    }
    tabCreateEvents[windowId].timeout = window.setTimeout(() => selectInbox(windowId, true), TAB_DELAY);
  }
}

/**
 * Listen for tabs being opened during startup sequence. If any window is already
 * open while load is called, we assume this is an add-on install and not an
 * application startup.
 * 
 * tabs.query is currently not waiting till startup has finished, so we need to
 * look at the created tabs and decide, wether those are created during startup,
 * or later.
 */
async function load() {
  // If there has been a window open during add-on startup, most probably this
  // was an install. Do not add any listeners.
  let windows = await browser.windows.getAll({windowTypes:["normal"]});
  if (windows.length == 0) {
    lastNewWindowEvent = Date.now();
    
    // Add listener for new tabs. Remove it again, if there has not been any
    // new window created for more than WINDOW_DELAY. CollapseTabCreateEvents will
    // schedule the actual "select inbox" action for the given tab, but will be
    // rescheduled with each new tabs-create-event, thus collapsing them.
    function listener(tab) {
      log("CREATED", tab.windowId, tab.id);
      let windowId = tab.windowId;
      let windowIsNew = !tabCreateEvents.hasOwnProperty(windowId);
      
      if (windowIsNew && Date.now() - lastNewWindowEvent > WINDOW_DELAY) {
        log("STOP LISTENING");
        browser.tabs.onCreated.removeListener(listener);
        return;
      }

      if (windowIsNew) {
        tabCreateEvents[windowId] = {
          pending: true,
          timeout: null,
        };
      }
      collapseTabCreateEvents(windowId);
    }
    browser.tabs.onCreated.addListener(listener);
  }
}

load();
