<script setup lang="ts">
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import { useRoute } from "vue-router"

import PageShell from "@/components/layout/PageShell.vue"
import Badge from "@/components/ui/Badge.vue"
import Button from "@/components/ui/Button.vue"
import Kicker from "@/components/ui/Kicker.vue"
import SurfacePanel from "@/components/ui/SurfacePanel.vue"

const route = useRoute()
const { t } = useI18n()

const reason = computed(() => {
  const rawReason = route.query.reason

  if (typeof rawReason !== "string" || !rawReason.trim()) {
    return t("sessionUnavailableView.fallbackReason")
  }

  return rawReason
})
</script>

<template>
  <PageShell class="flex min-h-[calc(100svh-7rem)] items-center py-8 md:py-10">
    <section
      class="family-stage grid w-full gap-6 p-[var(--space-surface-tablet)] md:p-[var(--space-surface-large)] lg:grid-cols-[0.95fr_1.05fr]"
    >
      <SurfacePanel strong padded="lg">
        <Badge tone="accent">{{ t("sessionUnavailableView.badge") }}</Badge>
        <h1
          class="app-title mt-6 max-w-md font-display font-semibold text-foreground"
        >
          {{ t("sessionUnavailableView.title") }}
        </h1>
        <p
          class="mt-4 max-w-md text-sm leading-6 text-[color:var(--text-muted)]"
        >
          {{ t("sessionUnavailableView.body") }}
        </p>
      </SurfacePanel>

      <SurfacePanel padded="lg">
        <Kicker>{{ t("sessionUnavailableView.kicker") }}</Kicker>
        <p class="mt-4 text-base leading-7 text-[color:var(--text-muted)]">
          {{ reason }}
        </p>

        <div class="mt-8 flex flex-wrap gap-3">
          <Button to="/">{{ t("common.home") }}</Button>
          <Button to="/games/new" variant="secondary">
            {{ t("common.newQuiz") }}
          </Button>
        </div>
      </SurfacePanel>
    </section>
  </PageShell>
</template>
