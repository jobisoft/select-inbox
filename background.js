let tabCreateEvents = {};
let lastEventAt = null;

const TABDELAY = 400;
const IDLETIME = 1000;


async function selectInbox (windowId) {
  tabCreateEvents[windowId].pending = false;
  
  // Switch to mailTab if there is one in this window.
  let activeTabs = await messenger.tabs.query({active:true, mailTab: true, windowId});
  let inactiveTabs = await messenger.tabs.query({active:false, mailTab: true, windowId});
  if (activeTabs.length == 0 && inactiveTabs.length > 0) {
    browser.tabs.update(inactiveTabs[0].id, {active:true});
  }
  
  // If there is a mailTab, switch to the inbox.
  if (activeTabs.length + inactiveTabs.length > 0) {
    let mailTab = await messenger.mailTabs.query({windowId});
    let account = await messenger.accounts.getDefault();
    let inbox = account.folders.find(folder => folder.type == "inbox");
    if (inbox) {
      messenger.mailTabs.update(mailTab.id, {
        displayedFolder: inbox
      });
    }
  }
}

/**
 * The collapseTabCreateEvents function checks for each window, if the
 * tab-create-event occurred within the allowed TABDELAY time (delay between two
 * tabs being created). If so, the event will reschedule the "select inbox" action.
 */
function collapseTabCreateEvents (windowId) {
  // Keep track of tabCreateEvents for this window.
  if (!tabCreateEvents.hasOwnProperty(windowId)) {
    tabCreateEvents[windowId] = {
      pending: true,
      timeout: null,
    };
  }
  // Re-arm the timer for the "select inbox" action of this window, if it is still
  // pending.
  if (tabCreateEvents[windowId].pending) {
    lastEventAt = Date.now();
    if (tabCreateEvents[windowId].timeout) {
      window.clearTimeout(tabCreateEvents[windowId].timeout);
    }
    tabCreateEvents[windowId].timeout = window.setTimeout(() => selectInbox(windowId), TABDELAY);
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
    lastEventAt = Date.now();
    
    // Add listener for new tabs. Remove it again, if there has not been any
    // tab-create-event for more than IDLETIME. CollapseTabCreateEvents will
    // schedule the actual "select inbox" action for the given tab, but will be
    // rescheduled with each new tabs-create-event, thus collapsing them.
    function listener(tab) {
      if (Date.now() - lastEventAt > IDLETIME) {
        browser.tabs.onCreated.removeListener(listener);
      } else {
        collapseTabCreateEvents(tab.windowId);
      }
    }
    browser.tabs.onCreated.addListener(listener);
  }
}

load();
