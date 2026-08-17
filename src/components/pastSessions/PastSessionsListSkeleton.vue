<script setup lang="ts">
import { useI18n } from "vue-i18n"

import Skeleton from "@/components/ui/Skeleton.vue"
import SurfacePanel from "@/components/ui/SurfacePanel.vue"

const { t } = useI18n()
const ROWS = 8
</script>

<template>
  <div role="status" :aria-label="t('common.loading')" class="grid gap-3">
    <SurfacePanel
      v-for="(_, index) in ROWS"
      :key="index"
      padded="none"
      class="grid items-center gap-5 px-5 py-5 md:grid-cols-[minmax(16rem,1fr)_minmax(7rem,auto)_minmax(10rem,auto)_auto] md:px-6"
    >
      <div class="min-w-0">
        <Skeleton width="65%" height="1.75rem" />
        <div class="mt-2 flex flex-wrap items-center gap-2.5">
          <Skeleton width="10rem" height="1rem" />
          <Skeleton width="4.5rem" height="1.25rem" rounded="full" />
          <Skeleton width="6.5rem" height="1.25rem" rounded="full" />
        </div>
      </div>

      <div>
        <Skeleton width="3.25rem" height="0.75rem" />
        <Skeleton class="mt-1" width="2rem" height="1.25rem" />
      </div>

      <div>
        <Skeleton width="4.25rem" height="0.75rem" />
        <Skeleton class="mt-1" width="8rem" height="1.25rem" />
      </div>

      <div class="flex flex-wrap gap-3 md:justify-end">
        <Skeleton width="6.75rem" height="2.5rem" rounded="full" />
        <Skeleton width="5rem" height="2.25rem" rounded="full" />
        <Skeleton width="6.25rem" height="2.5rem" rounded="full" />
      </div>
    </SurfacePanel>
  </div>
</template>
