export const MAX_TRANSLATION_ITEMS = 600
export const MAX_TRANSLATION_ITEM_CHARS = 1_200
export const MAX_TRANSLATION_TOTAL_CHARS = 60_000

export function isValidTranslationItems(
  value: unknown,
): value is Array<{ id: string; text: string }> {
  if (!Array.isArray(value) || value.length === 0) return false
  if (value.length > MAX_TRANSLATION_ITEMS) return false

  let totalChars = 0
  for (const item of value) {
    if (!item || typeof item.id !== "string" || typeof item.text !== "string") {
      return false
    }
    if (
      item.text.length === 0 ||
      item.text.length > MAX_TRANSLATION_ITEM_CHARS
    ) {
      return false
    }
    totalChars += item.text.length
    if (totalChars > MAX_TRANSLATION_TOTAL_CHARS) return false
  }

  return true
}
