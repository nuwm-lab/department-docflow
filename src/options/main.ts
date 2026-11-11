// Сторінка налаштувань: коренева папка «Вхідна документація».
// «Перевірити доступ» з’явиться разом з авторизацією Google (етап 1).
import { getSettings, parseFolderId, saveSettings } from '../shared/storage';

const input = document.getElementById('root-folder') as HTMLInputElement;
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;

function setStatus(text: string, kind: 'ok' | 'error' | '' = '') {
  statusEl.textContent = text;
  statusEl.className = kind;
}

async function init() {
  const { rootFolderId } = await getSettings();
  if (rootFolderId) input.value = `https://drive.google.com/drive/folders/${rootFolderId}`;

  saveBtn.addEventListener('click', async () => {
    const id = parseFolderId(input.value);
    if (!id) {
      setStatus('Не схоже на посилання на папку Google Диска', 'error');
      return;
    }
    await saveSettings({ rootFolderId: id });
    input.value = `https://drive.google.com/drive/folders/${id}`;
    setStatus('Збережено', 'ok');
  });
}

init().catch((err) => setStatus(`Помилка: ${String(err)}`, 'error'));
