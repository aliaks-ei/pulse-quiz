import type { MessagesSchema } from "../en"
import { beCoreMessages } from "./core"
import { beMarketingMessages } from "./marketing"
import { beGameplayMessages } from "./gameplay"
import { beManagementMessages } from "./management"

export const beMessages: MessagesSchema = {
  ...beCoreMessages,
  ...beMarketingMessages,
  ...beGameplayMessages,
  ...beManagementMessages,
}
