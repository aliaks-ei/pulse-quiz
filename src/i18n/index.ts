import { ref } from "vue"
import { createI18n } from "vue-i18n"

import { localeMessages } from "@/i18n/messages/index"
import {
  defaultAppLocale,
  persistAppLocale,
  resolveInitialAppLocale,
  type AppLocale,
} from "@/i18n/locale"
import { pickLocalized } from "@/lib/localized"
import type { I18nMap } from "@/types/domain"

type MessageSchema = typeof localeMessages.en
const initialLocale = resolveInitialAppLocale()

export const currentAppLocale = ref<AppLocale>(initialLocale)

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: defaultAppLocale,
  globalInjection: true,
  messages: localeMessages as Record<AppLocale, MessageSchema>,
})

function applyAppLocale(locale: AppLocale) {
  const localeTarget = i18n.global.locale as unknown
  if (
    localeTarget &&
    typeof localeTarget === "object" &&
    "value" in localeTarget
  ) {
    ;(localeTarget as { value: AppLocale }).value = locale
  } else {
    ;(i18n.global as unknown as { locale: AppLocale }).locale = locale
  }
  persistAppLocale(locale)

  if (typeof document !== "undefined") {
    document.documentElement.lang = locale
  }
}

applyAppLocale(initialLocale)

export function getAppLocale() {
  return currentAppLocale.value
}

export function setAppLocale(locale: AppLocale) {
  currentAppLocale.value = locale
  applyAppLocale(locale)
}

export function translate(key: string, params?: Record<string, unknown>) {
  // Reactivity hook: re-run callers when the active locale changes.
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  currentAppLocale.value
  return i18n.global.t(key, params ?? {})
}

export function localizedText(
  primary: string,
  i18nMap: I18nMap,
  primaryLocale: AppLocale,
): string {
  return pickLocalized(primary, i18nMap, currentAppLocale.value, primaryLocale)
    .text
}

export function formatLocaleDate(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions,
) {
  // Reactivity hook: re-run callers when the active locale changes.
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  currentAppLocale.value
  return new Intl.DateTimeFormat(getAppLocale(), options).format(
    new Date(value),
  )
}
