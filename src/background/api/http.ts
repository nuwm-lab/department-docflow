// Запити до Google API від імені пошти email з автоматичним оновленням токена.
import { clearCachedToken, getToken } from '../auth';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Зрозуміле українське пояснення для типових HTTP-статусів Google API. */
function describeStatus(status: number, googleMessage: string): string {
  switch (status) {
    case 401:
      return 'Сплив термін авторизації. Увійдіть у Google ще раз.';
    case 403:
      return /insufficient|permission|forbidden/i.test(googleMessage)
        ? 'Немає прав на цю дію. Попросіть завкафедри надати права редагування папки.'
        : `Немає доступу: ${googleMessage}`;
    case 404:
      return 'Не знайдено (можливо, немає доступу або об’єкт видалено).';
    case 413:
      return 'Файл завеликий для завантаження.';
    case 429:
      return 'Забагато запитів до Google. Спробуйте за хвилину.';
    default:
      return status >= 500
        ? 'Тимчасова помилка на боці Google. Спробуйте ще раз.'
        : `Помилка Google API (${status}): ${googleMessage}`;
  }
}

/** ApiError з відповіді, що не є успішною. */
export async function toApiError(res: Response): Promise<ApiError> {
  let googleMessage = res.statusText;
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    googleMessage = body.error?.message ?? googleMessage;
  } catch {
    /* тіло не JSON */
  }
  return new ApiError(res.status, describeStatus(res.status, googleMessage));
}

/**
 * fetch з токеном пошти email; на 401 один раз тихо оновлює токен і повторює.
 * Повертає будь-яку відповідь сервера (не перевіряє res.ok) — для resumable upload з 308.
 */
export async function authorizedFetch(email: string, url: string, init: RequestInit = {}): Promise<Response> {
  const send = async (token: string) => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...init, headers });
  };
  try {
    let res = await send(await getToken(email));
    if (res.status === 401) {
      await clearCachedToken(email);
      res = await send(await getToken(email));
    }
    return res;
  } catch (err) {
    if (err instanceof TypeError) {
      throw new ApiError(0, 'Немає з’єднання з інтернетом або Google недоступний.');
    }
    throw err;
  }
}

/** Як authorizedFetch, але кидає ApiError, якщо відповідь не успішна. */
export async function googleFetch(email: string, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await authorizedFetch(email, url, init);
  if (!res.ok) throw await toApiError(res);
  return res;
}
