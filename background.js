// Service worker: opens the side panel and forwards context-menu captures to it.

const PENDING_KEY = 'pendingContext';

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'send-selection',
    title: 'Send selection to LLM panel',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'send-page',
    title: 'Send this page to LLM panel',
    contexts: ['page'],
  });
});

chrome.runtime.onStartup?.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const payload = {
    kind: info.menuItemId === 'send-selection' ? 'selection' : 'page',
    text: info.selectionText || '',
    title: tab?.title || '',
    url: tab?.url || info.pageUrl || '',
    ts: Date.now(),
  };

  await chrome.storage.session.set({ [PENDING_KEY]: payload });

  if (tab?.id != null) {
    // The context-menu click counts as the user gesture sidePanel.open requires.
    await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  }
  chrome.runtime.sendMessage({ type: 'pending-context' }).catch(() => {});
});
