import { defineStore } from "pinia"
import { computed, ref } from "vue"

import {
  getRecentResumeMetadata,
  loadResumeMetadata,
  loadResumeMetadataBySession,
  upsertResumeMetadata,
} from "@/lib/localStorage"
import {
  DEFAULT_AVATAR_KEY,
  type ResumeMetadata,
  type SessionSnapshot,
} from "@/types/domain"

export const usePlayerStore = defineStore("player", () => {
  const displayName = ref("")
  const avatarKey = ref(DEFAULT_AVATAR_KEY)
  const avatarAssetId = ref<string | null>(null)
  const avatarAssetPath = ref<string | null>(null)
  const avatarPreviewUrl = ref<string | null>(null)
  const currentResume = ref<ResumeMetadata | null>(null)

  function hydrateForInvite(inviteCode: string) {
    clearAvatarPreview()
    currentResume.value = loadResumeMetadata(inviteCode)
    if (currentResume.value) {
      displayName.value = currentResume.value.displayName
      avatarKey.value = currentResume.value.avatarKey
      avatarAssetId.value = currentResume.value.avatarAssetId ?? null
      avatarAssetPath.value = currentResume.value.avatarAssetPath ?? null
      return
    }

    avatarKey.value = DEFAULT_AVATAR_KEY
    clearAvatarUpload()
  }

  function hydrateForSession(sessionId: string) {
    clearAvatarPreview()
    currentResume.value = loadResumeMetadataBySession(sessionId)
    if (currentResume.value) {
      displayName.value = currentResume.value.displayName
      avatarKey.value = currentResume.value.avatarKey
      avatarAssetId.value = currentResume.value.avatarAssetId ?? null
      avatarAssetPath.value = currentResume.value.avatarAssetPath ?? null
      return
    }

    avatarKey.value = DEFAULT_AVATAR_KEY
    clearAvatarUpload()
  }

  function saveResume(metadata: ResumeMetadata) {
    currentResume.value = metadata
    displayName.value = metadata.displayName
    avatarKey.value = metadata.avatarKey
    avatarAssetId.value = metadata.avatarAssetId ?? null
    avatarAssetPath.value = metadata.avatarAssetPath ?? null
    upsertResumeMetadata(metadata)
  }

  function setAvatarUpload(
    asset: { id: string; objectPath: string },
    previewUrl: string | null,
  ) {
    clearAvatarPreview()
    avatarAssetId.value = asset.id
    avatarAssetPath.value = asset.objectPath
    avatarPreviewUrl.value = previewUrl
  }

  function clearAvatarUpload() {
    clearAvatarPreview()
    avatarAssetId.value = null
    avatarAssetPath.value = null
  }

  function clearAvatarPreview() {
    if (avatarPreviewUrl.value && typeof URL !== "undefined") {
      URL.revokeObjectURL(avatarPreviewUrl.value)
    }
    avatarPreviewUrl.value = null
  }

  function syncFromSnapshot(snapshot: SessionSnapshot) {
    if (!snapshot.currentPlayerId) return

    const currentPlayer = snapshot.players.find(
      (player) => player.id === snapshot.currentPlayerId,
    )
    if (!currentPlayer) return

    saveResume({
      inviteCode: snapshot.session.inviteCode,
      sessionId: snapshot.session.id,
      playerId: currentPlayer.id,
      displayName: currentPlayer.displayName,
      avatarKey: currentPlayer.avatarKey,
      avatarAssetId: currentPlayer.avatarAssetId ?? null,
      avatarAssetPath: currentPlayer.avatarAssetPath ?? null,
      role: currentPlayer.role,
    })
  }

  const recentSessions = computed(() => getRecentResumeMetadata())

  return {
    displayName,
    avatarKey,
    avatarAssetId,
    avatarAssetPath,
    avatarPreviewUrl,
    currentResume,
    recentSessions,
    hydrateForInvite,
    hydrateForSession,
    saveResume,
    setAvatarUpload,
    clearAvatarUpload,
    syncFromSnapshot,
  }
})
