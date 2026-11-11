# Налаштування доступу до Google (OAuth Client ID)

Розширенню потрібен **OAuth Client ID**: реєстрація програми в Google, без якої вона не може працювати з Gmail, Диском і Таблицями. Реєстрацію робить один раз власник Cloud-проєкту. Працювати з розширенням потім може будь-який користувач під своїм акаунтом.

Займає 15–20 хвилин.

## Дані для налаштування

| Параметр | Значення |
| --- | --- |
| ID розширення | `eglfhdbhakanbgheiobecjhjjdbjninp` |
| Authorized redirect URI | `https://eglfhdbhakanbgheiobecjhjjdbjninp.chromiumapp.org/` |
| Scopes | `https://www.googleapis.com/auth/gmail.readonly`<br>`https://www.googleapis.com/auth/drive`<br>`https://www.googleapis.com/auth/spreadsheets` |
| API | Gmail API, Google Drive API, Google Sheets API |

ID розширення закріплено полем `key` у `public/manifest.json` і однаковий на всіх комп’ютерах.

## Перед початком

- Працюйте під **кафедральним акаунтом `@nuwm.edu.ua`**. Щоб не переплутати акаунти, відкрийте окреме вікно в режимі інкогніто (Ctrl+Shift+N) і увійдіть лише в нього.
- Якщо кафедральна пошта на `@gmail.com`, Internal-клієнт неможливий — див. розділ «Тестовий варіант».

## 1. Створити проєкт

1. Відкрийте <https://console.cloud.google.com>, прийміть умови, якщо попросить.
2. Угорі натисніть на вибір проєкту → **New project**.
3. **Project name:** `Docflow кафедри`.
4. **Organization / Location:** має бути `nuwm.edu.ua`. Якщо там «No organization» або створення заборонено — зупиніться й див. розділ «Якщо щось не виходить».
5. **Create**, потім переконайтеся, що вгорі обрано саме цей проєкт.

## 2. Увімкнути API

Меню ☰ → **APIs & Services** → **Library**. Знайдіть і натисніть **Enable** для кожного:

- Gmail API
- Google Drive API
- Google Sheets API

## 3. Екран згоди

Меню ☰ → **Google Auth Platform** (у старому інтерфейсі — **APIs & Services → OAuth consent screen**) → **Get started**.

1. **App name:** `Вхідна документація кафедри`.
2. **User support email:** кафедральна пошта.
3. **Audience:** **Internal**.
4. **Contact information:** кафедральна пошта.
5. Погодьтеся з умовами → **Create**.

Потім розділ **Data Access** → **Add or remove scopes** → унизу поле «Manually add scopes» → вставте три scopes з таблиці вище (кожен з нового рядка) → **Add to table** → **Update** → **Save**.

## 4. Створити Client ID

Розділ **Clients** (або **APIs & Services → Credentials → Create credentials → OAuth client ID**):

1. **Application type:** **Web application**.
   Саме Web application, не «Chrome Extension»: розширення входить під акаунтом, відкритим у вкладці Gmail, через `chrome.identity.launchWebAuthFlow`, а цей механізм працює лише з Web-клієнтом.
2. **Name:** `Docflow Chrome extension`.
3. **Authorized JavaScript origins:** нічого не додавайте.
4. **Authorized redirect URIs** → **Add URI** → `https://eglfhdbhakanbgheiobecjhjjdbjninp.chromiumapp.org/` (зі скісною рискою в кінці).
5. **Create**.

З’явиться вікно з **Client ID** (вигляду `123456789-abc….apps.googleusercontent.com`) і **Client secret**.

- **Client ID** скопіюйте — його вписують у `public/manifest.json`. Він не секретний.
- **Client secret** розширенню не потрібен. Нікому його не надсилайте й не комітьте.

## 5. Додати запасних власників

Меню ☰ → **IAM & Admin** → **IAM** → **Grant access**:

- завкафедри — роль **Owner**;
- розробник — роль **Editor**.

Так проєкт не залежатиме від однієї пошти.

## Якщо щось не виходить

| Що бачите | Що це означає | Що робити |
| --- | --- | --- |
| Не можна створити проєкт / немає організації `nuwm.edu.ua` | Адміністратор Workspace заборонив створювати проєкти | Попросити адміністратора створити проєкт і дати кафедральному акаунту роль Owner |
| Немає варіанта **Internal** | Проєкт створено поза організацією | Створити проєкт заново з Organization = `nuwm.edu.ua` |
| Під час входу в розширенні: «Доступ заблоковано адміністратором» | Workspace блокує сторонні програми | Адміністратор: Admin console → Security → Access and data control → API controls → Manage third-party app access → додати програму за Client ID і позначити **Trusted** |

## Тестовий варіант (без організації)

Для розробки, поки немає Internal-клієнта, проєкт можна створити на будь-якій пошті:

- на кроці 3 оберіть **Audience: External**, програму залиште в режимі **Testing**;
- в **Audience → Test users** додайте пошти, з яких тестуватимете (до 100);
- решта кроків — так само.

Обмеження: працюють лише додані тестові пошти; Google показує «Ця програма не перевірена» (натиснути «Додатково → Перейти»); вхід доводиться повторювати раз на 7 днів.

Щоб перейти на робочий клієнт, достатньо замінити Client ID у `manifest.json` — код не змінюється.

## Публікація в Chrome Web Store

Після публікації магазин видає розширенню власний ID. Тоді в цьому ж клієнті (крок 4) треба **додати** ще один redirect URI `https://<новий-ID>.chromiumapp.org/`. Старий можна лишити для розробки.

## Приватний ключ розширення

Файл `department-docflow.pem` (зберігається поза репозиторієм, у `C:\Plagin\keys\`) — приватна частина ключа, від якого обчислено ID. Він потрібен лише для ручного пакування `.crx`. Не комітьте його й не пересилайте; зробіть резервну копію в надійному місці.
