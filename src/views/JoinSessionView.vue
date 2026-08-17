<script setup lang="ts">
import { DoorClosed, ImagePlus, RotateCcw, X } from "lucide-vue-next"
import { motion } from "motion-v"
import { computed, onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import { useRoute, useRouter } from "vue-router"

import AvatarPicker from "@/components/avatars/AvatarPicker.vue"
import AvatarPortrait from "@/components/avatars/AvatarPortrait.vue"
import PageShell from "@/components/layout/PageShell.vue"
import Badge from "@/components/ui/Badge.vue"
import Button from "@/components/ui/Button.vue"
import Kicker from "@/components/ui/Kicker.vue"
import LanguageSwitcher from "@/components/ui/LanguageSwitcher.vue"
import Skeleton from "@/components/ui/Skeleton.vue"
import { useMotionPreferences } from "@/composables/useMotionPreferences"
import { getCanonicalSessionRoute } from "@/lib/sessionHelpers"
import {
  gameService,
  isInvalidInviteError,
  type UploadedAvatarAsset,
} from "@/services/gameService"
import { useAuthStore } from "@/stores/auth"
import { usePlayerStore } from "@/stores/player"
import type { InviteSessionSummary } from "@/types/domain"

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const playerStore = usePlayerStore()
const isJoining = ref(false)
const isLoadingInvite = ref(true)
const error = ref<string | null>(null)
const isInviteUnavailable = ref(false)
const inviteSummary = ref<InviteSessionSummary | null>(null)
const avatarInput = ref<HTMLInputElement | null>(null)
const isUploadingAvatar = ref(false)
const avatarUploadError = ref<string | null>(null)
const uploadedAvatars = ref<UploadedAvatarAsset[]>([])
const { t } = useI18n()
const motionPreferences = useMotionPreferences()

const inviteCode = computed(() => route.params.inviteCode as string)
const canAttemptJoin = computed(() => {
  if (!playerStore.displayName.trim() || !inviteSummary.value) return false
  return inviteSummary.value.isJoinable || Boolean(playerStore.currentResume)
})
// Hide the resume hint once the user is joining: syncFromSnapshot populates
// currentResume before router.push completes, which would otherwise flash the
// "Previous connection found" pill on a brand-new join.
const showResumeHint = computed(
  () => Boolean(playerStore.currentResume) && !isJoining.value,
)

onMounted(async () => {
  await authStore.bootstrap()
  playerStore.hydrateForInvite(inviteCode.value)
  await loadPlayerAvatars()
  isLoadingInvite.value = true
  error.value = null
  isInviteUnavailable.value = false

  try {
    inviteSummary.value = await gameService.getInviteSessionSummary(
      inviteCode.value,
    )
  } catch (inviteError) {
    if (isInvalidInviteError(inviteError)) {
      inviteSummary.value = null
      isInviteUnavailable.value = true
      return
    }

    error.value =
      inviteError instanceof Error
        ? inviteError.message
        : t("joinView.openRoomError")
  } finally {
    isLoadingInvite.value = false
  }
})

async function joinSession() {
  if (!canAttemptJoin.value || isJoining.value || isLoadingInvite.value) return

  isJoining.value = true
  error.value = null

  try {
    const snapshot = await gameService.joinSession({
      inviteCode: inviteCode.value,
      displayName: playerStore.displayName || t("joinView.guestName"),
      avatarKey: playerStore.avatarKey,
      avatarAssetId: playerStore.avatarAssetId,
      resumePlayerId: playerStore.currentResume?.playerId,
    })

    playerStore.syncFromSnapshot(snapshot)

    await router.push(
      getCanonicalSessionRoute(snapshot.session.id, snapshot.session.phase),
    )
  } catch (joinError) {
    error.value =
      joinError instanceof Error
        ? joinError.message
        : t("joinView.joinRoomError")
  } finally {
    isJoining.value = false
  }
}

function openAvatarPicker() {
  avatarInput.value?.click()
}

function usePresetAvatar() {
  playerStore.clearAvatarUpload()
  avatarUploadError.value = null
}

async function loadPlayerAvatars() {
  try {
    uploadedAvatars.value = await gameService.listPlayerAvatars()
  } catch {
    // Avatar selection remains usable even when the optional library cannot load.
  }
}

function selectUploadedAvatar(asset: UploadedAvatarAsset) {
  playerStore.setAvatarUpload(asset, null)
  avatarUploadError.value = null
}

async function handleAvatarInput(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ""
  if (!file || isUploadingAvatar.value) return

  isUploadingAvatar.value = true
  avatarUploadError.value = null
  const previewUrl = URL.createObjectURL(file)

  try {
    const asset = await gameService.uploadPlayerAvatar(file)
    playerStore.setAvatarUpload(asset, previewUrl)
    uploadedAvatars.value = [
      asset,
      ...uploadedAvatars.value.filter((existing) => existing.id !== asset.id),
    ].slice(0, 10)
  } catch (uploadError) {
    URL.revokeObjectURL(previewUrl)
    avatarUploadError.value =
      uploadError instanceof Error
        ? uploadError.message
        : t("avatars.uploadFailed")
  } finally {
    isUploadingAvatar.value = false
  }
}
</script>

<template>
  <PageShell
    class="relative flex h-svh max-h-svh !w-full items-stretch justify-center overflow-hidden !px-0 py-0"
  >
    <div class="absolute right-5 top-5 z-30 sm:right-6 sm:top-6">
      <LanguageSwitcher inverted />
    </div>

    <section
      v-if="isLoadingInvite"
      class="relative flex w-full max-w-[48rem] flex-col items-center overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_50%_39%,rgba(122,205,255,0.28),transparent_30%),linear-gradient(180deg,rgba(46,35,31,0.96),rgba(35,28,25,0.96))] px-5 py-16 text-center text-white shadow-[0_30px_90px_rgba(18,12,9,0.28)] sm:px-8 md:py-20"
      aria-busy="true"
      aria-live="polite"
    >
      <Skeleton tone="dark" width="12.5rem" height="2.5rem" rounded="full" />
      <Skeleton
        tone="dark"
        class="mt-20"
        width="min(74vw,21rem)"
        height="min(74vw,21rem)"
        rounded="lg"
      />
      <Skeleton tone="dark" class="mt-9" width="8rem" height="0.75rem" />
      <Skeleton
        tone="dark"
        class="mt-4"
        width="min(82vw,37rem)"
        height="4.9rem"
        rounded="full"
      />
      <Skeleton
        tone="dark"
        class="mt-7"
        width="min(82vw,37rem)"
        height="4.9rem"
        rounded="full"
      />
    </section>

    <section
      v-else-if="isInviteUnavailable"
      class="relative flex min-h-[34rem] w-full max-w-[58rem] flex-col items-center justify-center overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_50%_30%,rgba(122,205,255,0.14),transparent_32%),linear-gradient(180deg,rgba(49,37,33,0.96),rgba(34,27,24,0.96))] px-5 py-12 text-center text-[var(--color-text-inverse-strong)] shadow-[0_30px_90px_rgba(18,12,9,0.28)] sm:px-8 md:px-10"
      aria-labelledby="invite-unavailable-title"
    >
      <motion.div
        class="relative z-10 mx-auto flex w-full max-w-2xl flex-col items-center"
        v-bind="motionPreferences.enter(0, 18)"
      >
        <Badge tone="accent">
          {{ t("joinView.unavailableBadge") }}
        </Badge>

        <div
          class="mt-12 flex aspect-square w-[min(16rem,68vw)] items-center justify-center rounded-full border border-white/12 bg-white/8 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_28px_70px_rgba(19,13,10,0.22)] backdrop-blur-md"
        >
          <DoorClosed
            class="size-20 text-[color:var(--color-text-inverse-strong)] md:size-24"
            stroke-width="1.35"
            aria-hidden="true"
          />
        </div>

        <Kicker class="mt-10 text-inverse-muted">
          {{ t("joinView.inviteLabel", { code: inviteCode }) }}
        </Kicker>
        <h1
          id="invite-unavailable-title"
          class="app-title mt-4 max-w-[34rem] font-display font-semibold text-white"
        >
          {{ t("joinView.unavailableTitle") }}
        </h1>
        <p class="mt-4 max-w-[30rem] text-sm leading-6 text-inverse-body">
          {{ t("joinView.unavailableBody") }}
        </p>

        <div class="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button to="/join" size="lg">
            <RotateCcw class="size-4" aria-hidden="true" />
            {{ t("joinView.tryAnotherCode") }}
          </Button>
          <Button to="/" size="lg" variant="secondary">
            {{ t("common.home") }}
          </Button>
        </div>
      </motion.div>
    </section>

    <section
      v-else
      class="relative flex h-full w-full max-w-[46rem] flex-col overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_50%_34%,rgba(122,205,255,0.34),transparent_26%),radial-gradient(circle_at_50%_72%,rgba(207,123,82,0.14),transparent_24%),linear-gradient(180deg,rgba(49,37,33,0.98),rgba(35,28,25,0.98))] text-[var(--color-text-inverse-strong)] shadow-[0_30px_90px_rgba(18,12,9,0.3)] sm:rounded-[2rem]"
    >
      <motion.div
        class="relative z-10 flex h-full min-h-0 w-full flex-col items-stretch"
        v-bind="motionPreferences.enter(0, 16)"
      >
        <div
          class="flex min-h-0 w-full flex-1 items-end px-5 pt-[clamp(3.9rem,10svh,5.6rem)] sm:px-8"
        >
          <div class="w-full">
            <AvatarPicker
              v-model="playerStore.avatarKey"
              @update:model-value="usePresetAvatar"
            />

            <input
              ref="avatarInput"
              class="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              @change="handleAvatarInput"
            />
            <div
              class="mx-auto mt-5 flex w-full max-w-[25rem] items-center gap-3 rounded-[1.1rem] border border-white/14 bg-white/8 p-2.5 text-left backdrop-blur-sm"
            >
              <img
                v-if="playerStore.avatarAssetId && playerStore.avatarPreviewUrl"
                :src="playerStore.avatarPreviewUrl"
                :alt="t('avatars.uploadedPreview')"
                class="size-12 rounded-[0.8rem] object-cover"
              />
              <AvatarPortrait
                v-else
                :avatar-key="playerStore.avatarKey"
                :avatar-asset-path="playerStore.avatarAssetPath"
                size="sm"
                class="shrink-0"
              />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-white">
                  {{
                    playerStore.avatarAssetId
                      ? t("avatars.uploaded")
                      : t("avatars.uploadPrompt")
                  }}
                </p>
                <p class="mt-0.5 text-xs leading-5 text-white/62">
                  {{ t("avatars.uploadHint") }}
                </p>
              </div>
              <Button
                v-if="playerStore.avatarAssetId"
                type="button"
                size="sm"
                variant="ghost"
                class="!border-white/16 !text-white hover:!bg-white/10"
                :aria-label="t('avatars.usePreset')"
                @click="usePresetAvatar"
              >
                <X class="size-4" aria-hidden="true" />
              </Button>
              <Button
                v-else
                type="button"
                size="sm"
                variant="ghost"
                class="!border-white/16 !text-white hover:!bg-white/10"
                :disabled="isUploadingAvatar"
                @click="openAvatarPicker"
              >
                <ImagePlus class="size-4" aria-hidden="true" />
                {{
                  isUploadingAvatar
                    ? t("avatars.uploading")
                    : t("avatars.upload")
                }}
              </Button>
            </div>
            <p
              v-if="avatarUploadError"
              role="alert"
              class="mx-auto mt-2 max-w-[25rem] text-center text-xs text-[#ffd6d6]"
            >
              {{ avatarUploadError }}
            </p>
            <div
              v-if="uploadedAvatars.length"
              class="mx-auto mt-3 w-full max-w-[25rem]"
            >
              <p class="text-center text-xs font-medium text-white/60">
                {{ t("avatars.savedUploads") }}
              </p>
              <div class="mt-2 flex flex-wrap justify-center gap-2">
                <button
                  v-for="asset in uploadedAvatars"
                  :key="asset.id"
                  type="button"
                  class="rounded-[1.1rem] outline-none ring-offset-2 ring-offset-[#2e231f] transition focus-visible:ring-2 focus-visible:ring-white/80"
                  :aria-label="t('avatars.selectSaved')"
                  @click="selectUploadedAvatar(asset)"
                >
                  <AvatarPortrait
                    :avatar-key="playerStore.avatarKey"
                    :avatar-asset-path="asset.objectPath"
                    size="sm"
                    :selected="playerStore.avatarAssetId === asset.id"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        <form
          class="mx-auto flex w-full max-w-[38rem] shrink-0 flex-col px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-8 sm:pb-[calc(1.75rem+env(safe-area-inset-bottom))]"
          @submit.prevent="joinSession"
        >
          <label
            for="display-name"
            class="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-white/88 sm:text-[0.78rem]"
          >
            {{ t("joinView.nameLabel") }}
          </label>
          <input
            id="display-name"
            v-model="playerStore.displayName"
            type="text"
            autocomplete="name"
            :placeholder="t('joinView.namePlaceholder')"
            class="mt-2.5 h-14 w-full rounded-[1.25rem] border border-white/56 bg-[rgba(255,253,248,0.96)] px-5 text-[1.02rem] font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76),0_18px_46px_rgba(6,8,10,0.22)] outline-none transition placeholder:text-[color:var(--text-subtle)] focus:border-[rgba(161,220,255,0.78)] focus:ring-4 focus:ring-[rgba(122,205,255,0.18)] sm:h-16 sm:px-6 sm:text-[1.12rem]"
          />

          <p
            v-if="showResumeHint && playerStore.currentResume"
            class="mt-4 text-sm font-semibold text-[rgba(255,224,204,0.94)]"
          >
            {{
              t("joinView.welcomeBackName", {
                name: playerStore.currentResume.displayName,
              })
            }}
          </p>

          <p v-if="error" role="alert" class="mt-4 text-sm text-[#ffd6d6]">
            {{ error }}
          </p>

          <Button
            class="mt-5 h-14 text-[1.02rem] sm:h-16 sm:text-[1.1rem]"
            :disabled="!canAttemptJoin || isJoining || isLoadingInvite"
            size="lg"
            block
            type="submit"
          >
            {{
              isJoining
                ? t("joinView.joining")
                : playerStore.currentResume
                  ? t("joinView.rejoinRoom")
                  : t("joinView.joinRoom")
            }}
          </Button>

          <p
            v-if="inviteSummary && !inviteSummary.isJoinable"
            class="mt-5 text-center text-sm leading-6 text-inverse-body"
          >
            {{ t("joinView.newPlayersLocked") }}
          </p>
        </form>
      </motion.div>
    </section>
  </PageShell>
</template>
