<script setup lang="ts">
import { useI18n } from "vue-i18n"

import PaperCard from "@/components/ui/PaperCard.vue"
import Skeleton from "@/components/ui/Skeleton.vue"
import SurfacePanel from "@/components/ui/SurfacePanel.vue"

const { t } = useI18n()
const STAT_CARDS = 4
const CONTENT_PANELS = 2
const QUESTION_ROWS = 3
</script>

<template>
  <div
    role="status"
    :aria-label="t('common.loading')"
    class="flex flex-col gap-[var(--space-section-mobile)] md:gap-[var(--space-section-desktop)]"
  >
    <section
      class="family-stage p-[var(--space-surface-tablet)] md:p-[var(--space-surface-large)]"
    >
      <div class="flex flex-wrap items-center gap-3">
        <Skeleton tone="dark" width="5rem" height="1.5rem" rounded="full" />
        <Skeleton tone="dark" width="6rem" height="1.5rem" rounded="full" />
      </div>
      <Skeleton tone="dark" class="mt-6" width="60%" height="2.5rem" />
      <Skeleton tone="dark" class="mt-4" width="80%" height="1rem" />
      <Skeleton tone="dark" class="mt-2" width="55%" height="1rem" />

      <div class="mt-8 grid gap-4 md:grid-cols-4">
        <PaperCard
          v-for="(_, index) in STAT_CARDS"
          :key="index"
          class="px-4 py-4"
        >
          <Skeleton width="4rem" height="0.75rem" />
          <Skeleton class="mt-3" width="60%" height="2rem" />
        </PaperCard>
      </div>
    </section>

    <section class="grid gap-6 xl:grid-cols-2">
      <SurfacePanel
        v-for="(_, index) in CONTENT_PANELS"
        :key="index"
        strong
        padded="lg"
      >
        <Skeleton width="4rem" height="0.75rem" />
        <Skeleton class="mt-4" width="70%" height="2rem" />
        <Skeleton class="mt-3" width="90%" height="1rem" />
        <div class="mt-6 flex flex-wrap gap-3">
          <Skeleton width="6rem" height="2.25rem" rounded="full" />
          <Skeleton width="7rem" height="2.25rem" rounded="full" />
          <Skeleton width="5rem" height="2.25rem" rounded="full" />
        </div>
      </SurfacePanel>
    </section>

    <SurfacePanel padded="none" class="overflow-hidden">
      <div
        v-for="(_, index) in QUESTION_ROWS"
        :key="index"
        class="px-5 py-6 md:px-6"
        :class="index !== QUESTION_ROWS - 1 ? 'surface-line' : ''"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <Skeleton width="4rem" height="1.25rem" rounded="full" />
          <Skeleton width="3rem" height="1rem" />
        </div>
        <Skeleton class="mt-3" width="85%" height="1.5rem" />
        <Skeleton class="mt-2" width="60%" height="1.5rem" />
      </div>
    </SurfacePanel>
  </div>
</template>
