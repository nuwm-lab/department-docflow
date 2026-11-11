// Google Drive API v3. Усі запити з supportsAllDrives — папка кафедри може бути
// на Спільному диску (Shared Drive), а не в «Моєму диску».
import { googleFetch } from './http';

const BASE = 'https://www.googleapis.com/drive/v3';

export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  trashed?: boolean;
  driveId?: string;
  capabilities?: { canAddChildren?: boolean; canEdit?: boolean };
}

const FILE_FIELDS = 'id,name,mimeType,modifiedTime,webViewLink,trashed,driveId';

/** Екранування значення для рядка в запиті q Drive API. */
export function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function url(path: string, params: Record<string, string> = {}): string {
  const u = new URL(BASE + path);
  u.searchParams.set('supportsAllDrives', 'true');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.href;
}

export async function getFile(email: string, fileId: string): Promise<DriveFile> {
  const res = await googleFetch(
    email,
    url(`/files/${encodeURIComponent(fileId)}`, {
      fields: `${FILE_FIELDS},capabilities(canAddChildren,canEdit)`,
    }),
  );
  return (await res.json()) as DriveFile;
}

/**
 * Файли/папки з точною назвою name у папці parentId (не в кошику),
 * від найновішого до найстарішого.
 */
export async function findChildren(
  email: string,
  parentId: string,
  name: string,
  mimeType?: string,
): Promise<DriveFile[]> {
  const q = [`'${escapeQuery(parentId)}' in parents`, `name = '${escapeQuery(name)}'`, 'trashed = false'];
  if (mimeType) q.push(`mimeType = '${mimeType}'`);
  const res = await googleFetch(
    email,
    url('/files', {
      q: q.join(' and '),
      corpora: 'allDrives',
      includeItemsFromAllDrives: 'true',
      orderBy: 'modifiedTime desc',
      pageSize: '10',
      fields: `files(${FILE_FIELDS})`,
    }),
  );
  return ((await res.json()) as { files: DriveFile[] }).files;
}

export async function createFolder(email: string, parentId: string, name: string): Promise<DriveFile> {
  const res = await googleFetch(email, url('/files', { fields: FILE_FIELDS }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  return (await res.json()) as DriveFile;
}

/** Текстовий вміст файлу. Google-документ експортується як простий текст. */
export async function downloadText(email: string, file: DriveFile): Promise<string> {
  const target = file.mimeType.startsWith('application/vnd.google-apps.')
    ? url(`/files/${encodeURIComponent(file.id)}/export`, { mimeType: 'text/plain' })
    : url(`/files/${encodeURIComponent(file.id)}`, { alt: 'media' });
  const res = await googleFetch(email, target);
  return res.text();
}

/** Посилання на папку для користувача. */
export const folderLink = (id: string) => `https://drive.google.com/drive/folders/${id}`;
