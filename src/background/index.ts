// Service worker розширення.
// Тут будуть OAuth (chrome.identity) і запити до Gmail, Drive та Sheets API.
import type { PingResponse, Request } from '../shared/messages';
import { getSettings } from '../shared/storage';

chrome.runtime.onInstalled.addListener(async (details) => {
  // Після першого встановлення відкриваємо налаштування, якщо папку ще не задано.
  if (details.reason === 'install') {
    const { rootFolderId } = await getSettings();
    if (!rootFolderId) chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onMessage.addListener((msg: Request, _sender, sendResponse) => {
  if (msg.type === 'PING') {
    const res: PingResponse = { ok: true, version: chrome.runtime.getManifest().version };
    sendResponse(res);
  }
});
