import {
  DEFAULT_AVATAR_KEY,
  isAvatarKey,
  type ResumeMetadata,
} from "@/types/domain"

const RESUME_STORAGE_KEY = "pulse-quiz:resume"

function readResumeList() {
  const raw = localStorage.getItem(RESUME_STORAGE_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as ResumeMetadata[]
    if (!Array.isArray(parsed)) return []

    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return []
      if (
        typeof entry.inviteCode !== "string" ||
        typeof entry.sessionId !== "string"
      )
        return []
      if (
        typeof entry.playerId !== "string" ||
        typeof entry.displayName !== "string"
      )
        return []
      if (entry.role !== "host" && entry.role !== "player") return []

      return [
        {
          ...entry,
          avatarKey: isAvatarKey(entry.avatarKey)
            ? entry.avatarKey
            : DEFAULT_AVATAR_KEY,
          avatarAssetId:
            typeof entry.avatarAssetId === "string"
              ? entry.avatarAssetId
              : null,
          avatarAssetPath:
            typeof entry.avatarAssetPath === "string"
              ? entry.avatarAssetPath
              : null,
        },
      ]
    })
  } catch {
    return []
  }
}

export function loadResumeMetadata(inviteCode: string) {
  return (
    readResumeList().find((entry) => entry.inviteCode === inviteCode) ?? null
  )
}

export function loadResumeMetadataBySession(sessionId: string) {
  return readResumeList().find((entry) => entry.sessionId === sessionId) ?? null
}

export function upsertResumeMetadata(metadata: ResumeMetadata) {
  const normalized = {
    ...metadata,
    avatarAssetId: metadata.avatarAssetId ?? null,
    avatarAssetPath: metadata.avatarAssetPath ?? null,
  }
  const filtered = readResumeList().filter(
    (entry) =>
      entry.inviteCode !== normalized.inviteCode &&
      entry.sessionId !== normalized.sessionId,
  )

  filtered.unshift(normalized)
  localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(filtered.slice(0, 8)))
}

export function getRecentResumeMetadata() {
  return readResumeList()
}
