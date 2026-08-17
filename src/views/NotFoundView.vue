<script setup lang="ts">
import { useI18n } from "vue-i18n"

import PageShell from "@/components/layout/PageShell.vue"
import Badge from "@/components/ui/Badge.vue"
import Button from "@/components/ui/Button.vue"
import Kicker from "@/components/ui/Kicker.vue"
import PaperCard from "@/components/ui/PaperCard.vue"
import SurfacePanel from "@/components/ui/SurfacePanel.vue"

const { t } = useI18n()
</script>

<template>
  <PageShell class="flex min-h-[calc(100svh-7rem)] items-center py-8 md:py-10">
    <section
      class="family-stage grid w-full gap-6 p-[var(--space-surface-tablet)] md:p-[var(--space-surface-large)] lg:grid-cols-[0.95fr_1.05fr]"
    >
      <SurfacePanel strong padded="lg">
        <Badge tone="accent">{{ t("notFoundView.badge") }}</Badge>
        <h1
          class="app-title mt-6 max-w-xl font-display font-semibold text-foreground"
        >
          {{ t("notFoundView.title") }}
        </h1>
        <p
          class="mt-4 max-w-xl text-sm leading-6 text-[color:var(--text-muted)]"
        >
          {{ t("notFoundView.body") }}
        </p>

        <div class="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button to="/" size="lg">{{ t("common.home") }}</Button>
          <Button to="/join" size="lg" variant="secondary">
            {{ t("notFoundView.joinAction") }}
          </Button>
        </div>
      </SurfacePanel>

      <SurfacePanel padded="lg">
        <Kicker>{{ t("notFoundView.panelKicker") }}</Kicker>
        <div class="mt-5 grid gap-3">
          <PaperCard class="px-5 py-4">
            <p class="text-lg font-semibold text-foreground">
              {{ t("notFoundView.libraryTitle") }}
            </p>
            <p class="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
              {{ t("notFoundView.libraryBody") }}
            </p>
          </PaperCard>

          <PaperCard class="px-5 py-4">
            <p class="text-lg font-semibold text-foreground">
              {{ t("notFoundView.roomTitle") }}
            </p>
            <p class="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
              {{ t("notFoundView.roomBody") }}
            </p>
          </PaperCard>
        </div>
      </SurfacePanel>
    </section>
  </PageShell>
</template>
