<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import { useRouter } from "vue-router"

import PageShell from "@/components/layout/PageShell.vue"
import Badge from "@/components/ui/Badge.vue"
import Button from "@/components/ui/Button.vue"
import Input from "@/components/ui/Input.vue"
import Kicker from "@/components/ui/Kicker.vue"
import PaperCard from "@/components/ui/PaperCard.vue"
import SurfacePanel from "@/components/ui/SurfacePanel.vue"
import { gameService, isInvalidInviteError } from "@/services/gameService"

const router = useRouter()
const roomCode = ref("")
const isOpeningRoom = ref(false)
const error = ref<string | null>(null)
const { t } = useI18n()

const normalizedRoomCode = computed(() =>
  roomCode.value.trim().replace(/\s+/g, "").toUpperCase(),
)

watch(roomCode, () => {
  error.value = null
})

async function openRoom() {
  if (!normalizedRoomCode.value) return

  isOpeningRoom.value = true
  error.value = null

  try {
    await gameService.getInviteSessionSummary(normalizedRoomCode.value)
    await router.push(`/join/${normalizedRoomCode.value}`)
  } catch (openRoomError) {
    error.value = isInvalidInviteError(openRoomError)
      ? t("joinLandingView.invalidCode")
      : t("joinView.openRoomError")
  } finally {
    isOpeningRoom.value = false
  }
}
</script>

<template>
  <PageShell class="flex min-h-[calc(100svh-7rem)] items-center py-8 md:py-10">
    <section
      class="family-stage grid w-full gap-6 p-[var(--space-surface-tablet)] md:p-[var(--space-surface-large)] lg:grid-cols-[0.95fr_1.05fr]"
    >
      <SurfacePanel strong padded="lg">
        <Badge tone="accent">{{ t("joinLandingView.badge") }}</Badge>
        <h1
          class="app-title mt-6 max-w-xl font-display font-semibold text-foreground"
        >
          {{ t("joinLandingView.title") }}
        </h1>
        <p
          class="mt-4 max-w-xl text-sm leading-6 text-[color:var(--text-muted)]"
        >
          {{ t("joinLandingView.body") }}
        </p>

        <div class="mt-8 grid gap-3">
          <PaperCard class="px-5 py-4">
            <Kicker>{{ t("joinLandingView.codeKicker") }}</Kicker>
            <p class="mt-3 text-lg font-semibold text-foreground">
              {{ t("joinLandingView.codeTitle") }}
            </p>
            <p class="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
              {{ t("joinLandingView.codeBody") }}
            </p>
          </PaperCard>
        </div>
      </SurfacePanel>

      <form @submit.prevent="openRoom">
        <SurfacePanel padded="lg">
          <Kicker>{{ t("joinLandingView.panelKicker") }}</Kicker>
          <h2
            class="mt-3 text-[1.9rem] font-semibold tracking-[-0.05em] text-foreground"
          >
            {{ t("joinLandingView.panelTitle") }}
          </h2>
          <p class="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
            {{ t("joinLandingView.panelBody") }}
          </p>

          <div class="mt-8 space-y-3">
            <label
              for="room-code"
              class="text-chip font-semibold uppercase tracking-[0.28em] text-[color:var(--text-subtle)]"
            >
              {{ t("joinLandingView.codeLabel") }}
            </label>
            <Input
              id="room-code"
              v-model="roomCode"
              :placeholder="t('joinLandingView.codePlaceholder')"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
            />
          </div>

          <p v-if="error" role="alert" class="mt-4 text-sm text-error">
            {{ error }}
          </p>

          <div class="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              type="submit"
              :disabled="!normalizedRoomCode || isOpeningRoom"
              size="lg"
            >
              {{
                isOpeningRoom
                  ? t("joinLandingView.openingRoom")
                  : t("joinLandingView.continueToRoom")
              }}
            </Button>
            <Button to="/" size="lg" variant="secondary">
              {{ t("common.home") }}
            </Button>
          </div>
        </SurfacePanel>
      </form>
    </section>
  </PageShell>
</template>
