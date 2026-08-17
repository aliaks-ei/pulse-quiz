export type AppLocale = "en" | "ru" | "be" | "pl"

export type AppLocaleOption = {
  code: AppLocale
  shortLabel: Uppercase<AppLocale>
  nativeLabel: string
}

export const APP_LOCALE_STORAGE_KEY = "homebase-trivia:locale"

export const appLocaleOptions: AppLocaleOption[] = [
  { code: "en", shortLabel: "EN", nativeLabel: "English" },
  { code: "ru", shortLabel: "RU", nativeLabel: "Русский" },
  { code: "be", shortLabel: "BE", nativeLabel: "Беларуская" },
  { code: "pl", shortLabel: "PL", nativeLabel: "Polski" },
]

const supportedLocaleMap = new Map(
  appLocaleOptions.map((option) => [option.code, option]),
)

export const defaultAppLocale: AppLocale = "en"

export function normalizeAppLocale(
  value: string | null | undefined,
): AppLocale | null {
  if (!value) return null

  const normalized = value.trim().toLowerCase().split("-")[0]
  if (!supportedLocaleMap.has(normalized as AppLocale)) return null

  return normalized as AppLocale
}

export function readStoredAppLocale(
  storage: Storage | null | undefined = typeof window !== "undefined"
    ? window.localStorage
    : null,
) {
  const rawValue = storage?.getItem(APP_LOCALE_STORAGE_KEY) ?? null
  return normalizeAppLocale(rawValue)
}

export function persistAppLocale(
  locale: AppLocale,
  storage: Storage | null | undefined = typeof window !== "undefined"
    ? window.localStorage
    : null,
) {
  storage?.setItem(APP_LOCALE_STORAGE_KEY, locale)
}

export function resolveInitialAppLocale(
  input: {
    storage?: Storage | null
    browserLanguage?: string | null
  } = {},
) {
  const storedLocale = readStoredAppLocale(input.storage)
  if (storedLocale) return storedLocale

  const browserLocale = normalizeAppLocale(
    input.browserLanguage ??
      (typeof navigator !== "undefined" ? navigator.language : null),
  )

  return browserLocale ?? defaultAppLocale
}

export function getAppLocaleOption(locale: AppLocale) {
  return supportedLocaleMap.get(locale) ?? appLocaleOptions[0]
}
