<script setup lang="ts">
import { useI18n } from "vue-i18n"

import Skeleton from "@/components/ui/Skeleton.vue"

const { t } = useI18n()
const TILES = 4
</script>

<template>
  <div
    role="status"
    :aria-label="t('common.loading')"
    class="mt-4 grid gap-3 sm:grid-cols-2 md:mt-8 xl:grid-cols-3"
  >
    <div
      v-for="(_, index) in TILES"
      :key="index"
      class="relative flex items-center gap-3 rounded-[1.25rem] border border-white/10 bg-white/10 p-3 pr-20 backdrop-blur-md md:gap-4 md:rounded-[1.4rem] md:p-4"
    >
      <Skeleton tone="dark" rounded="full" width="3.5rem" height="3.5rem" />
      <div class="min-w-0 flex-1">
        <Skeleton tone="dark" width="60%" height="1.25rem" />
        <Skeleton tone="dark" class="mt-2" width="40%" height="0.75rem" />
      </div>
      <Skeleton
        tone="dark"
        rounded="full"
        width="3rem"
        height="1.5rem"
        class="absolute right-3 top-3 md:static md:mt-2"
      />
    </div>
  </div>
</template>
