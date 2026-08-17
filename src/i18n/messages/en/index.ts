import { enCoreMessages } from "./core"
import { enMarketingMessages } from "./marketing"
import { enGameplayMessages } from "./gameplay"
import { enManagementMessages } from "./management"

export const enMessages = {
  ...enCoreMessages,
  ...enMarketingMessages,
  ...enGameplayMessages,
  ...enManagementMessages,
} as const

type WidenMessageLeaves<T> = {
  [Key in keyof T]: T[Key] extends string
    ? string
    : T[Key] extends Record<string, unknown>
      ? WidenMessageLeaves<T[Key]>
      : T[Key]
}

export type MessagesSchema = WidenMessageLeaves<typeof enMessages>
