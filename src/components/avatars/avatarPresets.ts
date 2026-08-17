import { translate } from "@/i18n"
import { supabase } from "@/services/supabase"
import type { AvatarKey } from "@/types/domain"

const AVATAR_PRESETS_BUCKET = "avatar-presets"

const avatarPresetPaths: Record<AvatarKey, string> = {
  "avatar-01": "v1/robot.webp",
  "avatar-02": "v1/mushroom.webp",
  "avatar-03": "v1/fox.webp",
  "avatar-04": "v1/owl.webp",
  "avatar-05": "v1/astronaut-cat.webp",
  "avatar-06": "v1/octopus.webp",
}

function getPresetPublicUrl(path: string) {
  return supabase.storage.from(AVATAR_PRESETS_BUCKET).getPublicUrl(path).data
    .publicUrl
}

export const avatarPresetSources: Record<AvatarKey, string> = {
  "avatar-01": getPresetPublicUrl(avatarPresetPaths["avatar-01"]),
  "avatar-02": getPresetPublicUrl(avatarPresetPaths["avatar-02"]),
  "avatar-03": getPresetPublicUrl(avatarPresetPaths["avatar-03"]),
  "avatar-04": getPresetPublicUrl(avatarPresetPaths["avatar-04"]),
  "avatar-05": getPresetPublicUrl(avatarPresetPaths["avatar-05"]),
  "avatar-06": getPresetPublicUrl(avatarPresetPaths["avatar-06"]),
}

const avatarPresetIndexes: Record<AvatarKey, number> = {
  "avatar-01": 1,
  "avatar-02": 2,
  "avatar-03": 3,
  "avatar-04": 4,
  "avatar-05": 5,
  "avatar-06": 6,
}

export function getAvatarPresetLabel(avatarKey: AvatarKey) {
  return translate("avatars.preset", { index: avatarPresetIndexes[avatarKey] })
}
