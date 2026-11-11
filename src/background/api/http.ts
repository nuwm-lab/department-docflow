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
      return `Немає доступу: ${googleMessage}`;
    case 404:
      return 'Не знайдено (можливо, немає доступу або об’єкт видалено).';
    case 429:
      return 'Забагато запитів до Google. Спробуйте за хвилину.';
    default:
      return status >= 500
        ? 'Тимчасова помилка на боці Google. Спробуйте ще раз.'
        : `Помилка Google API (${status}): ${googleMessage}`;
  }
}

/**
 * fetch з токеном пошти email. На 401 один раз оновлює токен (тихо) і повторює.
 * Повертає відповідь лише якщо res.ok, інакше кидає ApiError.
 */
export async function googleFetch(email: string, url: string, init: RequestInit = {}): Promise<Response> {
  const send = async (token: string) =>
    fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    });

  let res: Response;
  try {
    res = await send(await getToken(email));
    if (res.status === 401) {
      await clearCachedToken(email);
      res = await send(await getToken(email));
    }
  } catch (err) {
    if (err instanceof TypeError) {
      throw new ApiError(0, 'Немає з’єднання з інтернетом або Google недоступний.');
    }
    throw err;
  }

  if (!res.ok) {
    let googleMessage = res.statusText;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      googleMessage = body.error?.message ?? googleMessage;
    } catch {
      /* тіло не JSON */
    }
    throw new ApiError(res.status, describeStatus(res.status, googleMessage));
  }
  return res;
}
