import type { MessagesSchema } from "../en"
import { ruCoreMessages } from "./core"
import { ruMarketingMessages } from "./marketing"
import { ruGameplayMessages } from "./gameplay"
import { ruManagementMessages } from "./management"

export const ruMessages: MessagesSchema = {
  ...ruCoreMessages,
  ...ruMarketingMessages,
  ...ruGameplayMessages,
  ...ruManagementMessages,
}
