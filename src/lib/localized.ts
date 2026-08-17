import type { AppLocale } from "@/i18n/locale"
import type { I18nMap } from "@/types/domain"

export function pickLocalized(
  primary: string,
  i18n: I18nMap,
  viewerLocale: AppLocale,
  primaryLocale: AppLocale,
): { text: string; isFallback: boolean } {
  if (viewerLocale === primaryLocale) {
    return { text: primary, isFallback: false }
  }

  const entry = i18n[viewerLocale]
  if (entry && entry.text.length > 0) {
    return { text: entry.text, isFallback: false }
  }

  return { text: primary, isFallback: true }
}

export function computeSourceHash(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}
