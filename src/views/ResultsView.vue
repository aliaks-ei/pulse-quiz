<script setup lang="ts">
import { computed, ref } from "vue"
import { useI18n } from "vue-i18n"
import { useRouter } from "vue-router"

import FinalResultsPanel from "@/components/play/FinalResultsPanel.vue"
import Button from "@/components/ui/Button.vue"
import SurfacePanel from "@/components/ui/SurfacePanel.vue"
import { useSessionLifecycle } from "@/composables/useSessionLifecycle"
import { localizedText } from "@/i18n"
import { getCanonicalSessionRoute } from "@/lib/sessionHelpers"
import { gameService } from "@/services/gameService"

const { sessionStore } = useSessionLifecycle()
const router = useRouter()
const isRestarting = ref(false)

const leaderboardEntries = computed(() => sessionStore.leaderboard)
const isHost = computed(() => sessionStore.viewerRole === "host")
const localizedGameTitle = computed(() => {
  const game = sessionStore.game
  if (!game) return ""
  return localizedText(game.title, game.titleI18n, game.primaryLocale)
})
const { t } = useI18n()

async function playAgain() {
  if (!sessionStore.game || isRestarting.value) return

  isRestarting.value = true

  try {
    const session = await gameService.startSession(sessionStore.game.id)
    await router.push(getCanonicalSessionRoute(session.sessionId, "lobby"))
  } finally {
    isRestarting.value = false
  }
}
</script>

<template>
  <div>
    <SurfacePanel
      v-if="sessionStore.error"
      role="alert"
      class="mx-auto mt-8 max-w-3xl text-sm text-error"
    >
      {{ sessionStore.error }}
    </SurfacePanel>

    <FinalResultsPanel
      :title="localizedGameTitle"
      :leaderboard-entries="leaderboardEntries"
    >
      <template #actions>
        <div class="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            v-if="isHost"
            size="lg"
            :disabled="isRestarting"
            @click="playAgain"
          >
            {{
              isRestarting
                ? t("resultsView.starting")
                : t("resultsView.playAgain")
            }}
          </Button>
          <Button to="/" size="lg" :variant="isHost ? 'secondary' : 'primary'">
            {{ t("common.home") }}
          </Button>
          <Button
            v-if="isHost && sessionStore.game"
            :to="`/games/${sessionStore.game.id}`"
            size="lg"
            variant="secondary"
          >
            {{ t("common.openQuiz") }}
          </Button>
        </div>
      </template>

      <p
        v-if="sessionStore.realtimeStatus !== 'connected'"
        role="status"
        class="mt-5 text-sm text-primary"
      >
        {{ t("common.reconnecting") }}
      </p>
    </FinalResultsPanel>
  </div>
</template>
