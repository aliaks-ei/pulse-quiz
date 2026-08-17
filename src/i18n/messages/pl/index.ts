import type { MessagesSchema } from "../en"
import { plCoreMessages } from "./core"
import { plMarketingMessages } from "./marketing"
import { plGameplayMessages } from "./gameplay"
import { plManagementMessages } from "./management"

export const plMessages: MessagesSchema = {
  ...plCoreMessages,
  ...plMarketingMessages,
  ...plGameplayMessages,
  ...plManagementMessages,
}
