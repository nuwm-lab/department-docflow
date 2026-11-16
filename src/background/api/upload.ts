// Завантаження файлів на Google Диск: multipart до 5 МБ, resumable — понад 5 МБ (п. 5.4 ТЗ).
import type { DriveFile } from './drive';
import { ApiError, authorizedFetch, googleFetch, toApiError } from './http';

const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files';
const FIELDS = 'id,name,mimeType,webViewLink';
/** Поріг resumable upload. */
export const RESUMABLE_THRESHOLD = 5 * 1024 * 1024;
/** Розмір частини resumable upload (кратний 256 КБ). */
const CHUNK_SIZE = 8 * 1024 * 1024;

interface UploadParams {
  parentId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

/** Копія байтів у власному ArrayBuffer (для Blob, незалежно від походження Uint8Array). */
const toBlobPart = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer;

async function multipartUpload(email: string, p: UploadParams): Promise<DriveFile> {
  const boundary = `docflow-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name: p.name, parents: [p.parentId] });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${p.mimeType}\r\n\r\n`,
    toBlobPart(p.bytes),
    `\r\n--${boundary}--`,
  ]);
  const res = await googleFetch(
    email,
    `${UPLOAD_BASE}?uploadType=multipart&supportsAllDrives=true&fields=${FIELDS}`,
    { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
  );
  return (await res.json()) as DriveFile;
}

async function resumableUpload(email: string, p: UploadParams): Promise<DriveFile> {
  const start = await googleFetch(
    email,
    `${UPLOAD_BASE}?uploadType=resumable&supportsAllDrives=true&fields=${FIELDS}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': p.mimeType,
        'X-Upload-Content-Length': String(p.bytes.length),
      },
      body: JSON.stringify({ name: p.name, parents: [p.parentId] }),
    },
  );
  const session = start.headers.get('Location');
  if (!session) throw new ApiError(0, 'Google не повернув адресу сесії завантаження.');

  const total = p.bytes.length;
  let offset = 0;
  while (offset < total) {
    const end = Math.min(offset + CHUNK_SIZE, total);
    const res = await authorizedFetch(email, session, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${total}` },
      body: toBlobPart(p.bytes.subarray(offset, end)),
    });
    if (res.status === 308) {
      // Google повідомляє, скільки байтів уже прийнято: «Range: bytes=0-N».
      const range = res.headers.get('Range');
      offset = range ? Number(range.split('-')[1]) + 1 : end;
      continue;
    }
    if (!res.ok) throw await toApiError(res);
    return (await res.json()) as DriveFile;
  }
  throw new ApiError(0, 'Завантаження файлу перервалося.');
}

export function uploadFile(email: string, p: UploadParams): Promise<DriveFile> {
  return p.bytes.length > RESUMABLE_THRESHOLD ? resumableUpload(email, p) : multipartUpload(email, p);
}
