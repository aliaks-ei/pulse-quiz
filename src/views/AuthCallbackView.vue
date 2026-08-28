<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import { useRoute, useRouter } from "vue-router"

import PageShell from "@/components/layout/PageShell.vue"
import Button from "@/components/ui/Button.vue"
import Kicker from "@/components/ui/Kicker.vue"
import { normalizeNextPath } from "@/lib/utils"
import { useAuthStore } from "@/stores/auth"

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const error = ref<string | null>(null)
const { t } = useI18n()

const nextPath = computed(() =>
  normalizeNextPath(
    route.query.next as string | string[] | undefined,
    "/library",
  ),
)

onMounted(() => {
  void finishSignIn()
})

async function finishSignIn() {
  error.value = null

  try {
    await authStore.restoreSession()
    await authStore.waitForHostSession(8000)
    await router.replace(nextPath.value)
  } catch (authError) {
    error.value =
      authError instanceof Error
        ? authError.message
        : t("authCallbackView.fallbackError")
  }
}
</script>

<template>
  <PageShell
    class="flex min-h-[calc(100svh-7rem)] max-w-[42rem] items-center py-8 md:py-10"
  >
    <section
      class="family-stage w-full p-[var(--space-surface-tablet)] text-center md:p-[var(--space-surface-large)]"
    >
      <Kicker class="text-inverse-muted">
        {{ t("authCallbackView.kicker") }}
      </Kicker>
      <h1 class="app-title mt-4 font-display font-semibold text-white">
        {{
          error
            ? t("authCallbackView.errorTitle")
            : t("authCallbackView.pendingTitle")
        }}
      </h1>
      <p class="mt-4 text-sm leading-6 text-inverse-body">
        {{ error ? error : t("authCallbackView.pendingBody") }}
      </p>

      <div class="mt-8 flex justify-center gap-3">
        <Button v-if="error" :to="{ path: '/auth', query: { next: nextPath } }">
          {{ t("common.backToSignIn") }}
        </Button>
        <Button v-if="error" variant="secondary" @click="finishSignIn">
          {{ t("common.tryAgain") }}
        </Button>
      </div>
    </section>
  </PageShell>
</template>
