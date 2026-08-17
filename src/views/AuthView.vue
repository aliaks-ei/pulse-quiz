<script setup lang="ts">
import { computed, ref } from "vue"
import { Mail, Sparkles } from "lucide-vue-next"
import { useI18n } from "vue-i18n"
import { useRoute } from "vue-router"

import PageShell from "@/components/layout/PageShell.vue"
import Badge from "@/components/ui/Badge.vue"
import Button from "@/components/ui/Button.vue"
import Input from "@/components/ui/Input.vue"
import Kicker from "@/components/ui/Kicker.vue"
import PaperCard from "@/components/ui/PaperCard.vue"
import SurfacePanel from "@/components/ui/SurfacePanel.vue"
import { normalizeNextPath } from "@/lib/utils"
import { useAuthStore } from "@/stores/auth"

const route = useRoute()
const authStore = useAuthStore()
const email = ref("")
const isSendingLink = ref(false)
const isStartingGoogle = ref(false)
const pendingEmail = ref<string | null>(null)
const error = ref<string | null>(
  (route.query.error as string | undefined) ?? null,
)
const { t } = useI18n()

const nextPath = computed(() =>
  normalizeNextPath(
    route.query.next as string | string[] | undefined,
    "/library",
  ),
)

async function sendMagicLink() {
  if (!email.value.trim()) return

  isSendingLink.value = true
  error.value = null

  try {
    await authStore.signInWithMagicLink(email.value, nextPath.value)
    pendingEmail.value = email.value.trim().toLowerCase()
  } catch (authError) {
    error.value =
      authError instanceof Error
        ? authError.message
        : t("authView.sendLinkError")
  } finally {
    isSendingLink.value = false
  }
}

async function continueWithGoogle() {
  isStartingGoogle.value = true
  error.value = null

  try {
    await authStore.signInWithGoogle(nextPath.value)
  } catch (authError) {
    error.value =
      authError instanceof Error ? authError.message : t("authView.googleError")
    isStartingGoogle.value = false
  }
}
</script>

<template>
  <PageShell class="flex min-h-[calc(100svh-7rem)] items-center py-8 md:py-10">
    <section
      class="family-stage grid w-full gap-6 p-[var(--space-surface-tablet)] md:p-[var(--space-surface-large)] lg:grid-cols-[0.98fr_1.02fr]"
    >
      <SurfacePanel strong padded="lg">
        <div class="flex flex-wrap items-center gap-3">
          <Badge tone="accent">{{ t("authView.hostsBadge") }}</Badge>
          <Badge tone="default">{{ t("authView.playersBadge") }}</Badge>
        </div>

        <Kicker class="mt-8">{{ t("authView.kicker") }}</Kicker>
        <h1
          class="app-title mt-4 max-w-xl font-display font-semibold text-foreground"
        >
          {{ t("authView.title") }}
        </h1>
        <p
          class="mt-4 max-w-xl text-sm leading-6 text-[color:var(--text-muted)]"
        >
          {{ t("authView.body") }}
        </p>

        <div class="mt-8 grid gap-3">
          <PaperCard class="px-5 py-4">
            <Kicker>{{ t("authView.emailLinkKicker") }}</Kicker>
            <p class="mt-3 text-lg font-semibold text-foreground">
              {{ t("authView.emailLinkTitle") }}
            </p>
          </PaperCard>
          <PaperCard class="px-5 py-4">
            <Kicker>{{ t("authView.googleKicker") }}</Kicker>
            <p class="mt-3 text-lg font-semibold text-foreground">
              {{ t("authView.googleTitle") }}
            </p>
          </PaperCard>
          <PaperCard class="px-5 py-4">
            <Kicker>{{ t("authView.playersKicker") }}</Kicker>
            <p class="mt-3 text-lg font-semibold text-foreground">
              {{ t("authView.playersTitle") }}
            </p>
          </PaperCard>
        </div>
      </SurfacePanel>

      <SurfacePanel padded="lg">
        <Kicker>{{ t("authView.panelKicker") }}</Kicker>
        <h2
          class="mt-3 text-[1.9rem] font-semibold tracking-[-0.05em] text-foreground"
        >
          {{ t("authView.panelTitle") }}
        </h2>
        <p class="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
          {{ t("authView.nextPathIntro") }}
          <span class="font-semibold text-foreground">{{ nextPath }}</span
          >.
        </p>

        <div class="mt-8 space-y-3">
          <label
            for="host-email"
            class="text-chip font-semibold uppercase tracking-[0.28em] text-[color:var(--text-subtle)]"
          >
            {{ t("authView.emailLabel") }}
          </label>
          <Input
            id="host-email"
            v-model="email"
            type="email"
            :placeholder="t('authView.emailPlaceholder')"
            autocomplete="email"
          />
        </div>

        <p
          v-if="pendingEmail"
          class="rounded-[1.1rem] border border-primary/14 bg-primary/8 px-4 py-3 text-sm font-medium leading-6 text-[color:var(--text-muted)]"
        >
          {{ t("authView.pendingEmail", { email: pendingEmail }) }}
        </p>

        <p v-if="error" role="alert" class="mt-4 text-sm text-error">
          {{ error }}
        </p>

        <div class="mt-8 flex flex-col gap-3">
          <Button
            :disabled="!email.trim() || isSendingLink || isStartingGoogle"
            block
            @click="sendMagicLink"
          >
            <Mail class="mr-2 size-4" />
            {{
              isSendingLink
                ? t("authView.sendingLink")
                : t("authView.sendEmailLink")
            }}
          </Button>
          <Button
            variant="secondary"
            :disabled="isSendingLink || isStartingGoogle"
            block
            @click="continueWithGoogle"
          >
            <Sparkles class="mr-2 size-4" />
            {{
              isStartingGoogle
                ? t("authView.openingGoogle")
                : t("authView.continueWithGoogle")
            }}
          </Button>
        </div>
      </SurfacePanel>
    </section>
  </PageShell>
</template>
