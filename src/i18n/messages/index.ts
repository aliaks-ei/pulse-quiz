import type { MessagesSchema } from "./en"
import { enMessages } from "./en"
import { ruMessages } from "./ru"
import { beMessages } from "./be"
import { plMessages } from "./pl"

export { enMessages } from "./en"
export { ruMessages } from "./ru"
export { beMessages } from "./be"
export { plMessages } from "./pl"

export const localeMessages: Record<"en" | "ru" | "be" | "pl", MessagesSchema> =
  {
    en: enMessages,
    ru: ruMessages,
    be: beMessages,
    pl: plMessages,
  }
