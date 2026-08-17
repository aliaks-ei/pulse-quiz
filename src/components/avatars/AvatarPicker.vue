<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue"
import type { Swiper as SwiperInstance } from "swiper"
import { A11y, Keyboard, Pagination } from "swiper/modules"
import { Swiper, SwiperSlide } from "swiper/vue"
import "swiper/css"
import "swiper/css/pagination"

import {
  getAvatarPresetLabel,
  avatarPresetSources,
} from "@/components/avatars/avatarPresets"
import { cn } from "@/lib/utils"
import { AVATAR_KEYS, type AvatarKey } from "@/types/domain"

const model = defineModel<AvatarKey>({ required: true })

const swiperInstance = ref<SwiperInstance | null>(null)

const initialSlide = computed(() =>
  Math.max(AVATAR_KEYS.indexOf(model.value), 0),
)
const swiperModules = [Pagination, Keyboard, A11y]

function setSwiper(swiper: SwiperInstance) {
  swiperInstance.value = swiper
}

function handleSlideChange(swiper: SwiperInstance) {
  const nextAvatarKey = AVATAR_KEYS[swiper.activeIndex]

  if (nextAvatarKey && nextAvatarKey !== model.value) {
    model.value = nextAvatarKey
  }
}

function selectAvatar(avatarKey: AvatarKey) {
  model.value = avatarKey
}

function isAdjacentSlide(index: number) {
  const activeIndex = AVATAR_KEYS.indexOf(model.value)
  return Math.abs(index - activeIndex) === 1
}

function slideClass(avatarKey: AvatarKey, index: number) {
  const isActive = model.value === avatarKey

  return cn(
    "avatar-slide flex w-[min(68vw,42svh,19.5rem)] justify-center",
    isActive ? "is-active" : "",
    isAdjacentSlide(index) ? "is-adjacent" : "",
  )
}

function buttonClass(avatarKey: AvatarKey) {
  const isActive = model.value === avatarKey

  return cn(
    "group relative block aspect-square w-full overflow-hidden rounded-[1.45rem] border bg-[rgba(255,255,255,0.04)] p-0 transition duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(161,220,255,0.72)] md:rounded-[1.65rem]",
    isActive
      ? "border-[rgba(161,220,255,0.9)] shadow-[0_0_0_1px_rgba(255,255,255,0.24),0_0_70px_rgba(102,202,255,0.56),0_28px_68px_rgba(9,18,26,0.34)]"
      : "border-white/10 opacity-58 shadow-[0_18px_42px_rgba(7,10,12,0.3)] hover:opacity-82",
    isActive && "ring-1 ring-[rgba(161,220,255,0.44)]",
  )
}

watch(
  () => model.value,
  async (avatarKey) => {
    const swiper = swiperInstance.value
    if (!swiper) return

    const nextIndex = AVATAR_KEYS.indexOf(avatarKey)
    if (nextIndex < 0 || swiper.activeIndex === nextIndex) return

    await nextTick()
    swiper.slideTo(nextIndex)
  },
)
</script>

<template>
  <div
    class="avatar-picker"
    role="radiogroup"
    :aria-label="$t('avatars.choose')"
  >
    <Swiper
      class="avatar-swiper"
      :modules="swiperModules"
      :initial-slide="initialSlide"
      :slides-per-view="'auto'"
      :space-between="22"
      :centered-slides="true"
      :slide-to-clicked-slide="true"
      :grab-cursor="true"
      :speed="520"
      :threshold="6"
      :pagination="{ clickable: true }"
      :keyboard="{ enabled: true }"
      :a11y="{
        enabled: true,
        prevSlideMessage: $t('avatars.previous'),
        nextSlideMessage: $t('avatars.next'),
      }"
      @swiper="setSwiper"
      @slide-change="handleSlideChange"
    >
      <SwiperSlide
        v-for="(avatarKey, index) in AVATAR_KEYS"
        :key="avatarKey"
        :class="slideClass(avatarKey, index)"
      >
        <button
          type="button"
          role="radio"
          :aria-checked="model === avatarKey"
          :tabindex="model === avatarKey ? 0 : -1"
          :class="buttonClass(avatarKey)"
          @click="selectAvatar(avatarKey)"
        >
          <span class="sr-only">{{ getAvatarPresetLabel(avatarKey) }}</span>
          <span
            class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.22),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(4,10,14,0.22))]"
            aria-hidden="true"
          ></span>
          <img
            :src="avatarPresetSources[avatarKey]"
            :alt="getAvatarPresetLabel(avatarKey)"
            class="relative block size-full object-cover object-top transition duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)] data-[active=true]:scale-[1.02]"
            :data-active="model === avatarKey ? 'true' : null"
            loading="lazy"
            decoding="async"
          />
        </button>
      </SwiperSlide>
    </Swiper>
  </div>
</template>

<style scoped>
.avatar-picker {
  --swiper-pagination-color: rgba(232, 241, 246, 0.92);
  --swiper-pagination-bullet-inactive-color: rgba(232, 241, 246, 0.5);
  --swiper-pagination-bullet-inactive-opacity: 0.56;
  position: relative;
  width: 100%;
  min-width: 0;
}

.avatar-swiper {
  overflow: visible;
  padding-block: clamp(0.75rem, 2svh, 1.35rem) clamp(2.25rem, 4svh, 3rem);
}

.avatar-slide {
  margin-bottom: 0.45rem;
  transform: scale(0.72);
  opacity: 0.48;
  transition:
    transform 520ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 520ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 520ms cubic-bezier(0.22, 1, 0.36, 1);
  filter: saturate(0.74);
}

.avatar-slide.is-adjacent {
  opacity: 0.66;
}

.avatar-slide.is-active {
  transform: scale(1);
  opacity: 1;
  filter: saturate(1.05);
  z-index: 2;
}

:deep(.swiper-pagination) {
  bottom: 0.5rem;
}

:deep(.swiper-pagination-bullet) {
  width: 0.52rem;
  height: 0.52rem;
  transition:
    transform 220ms ease,
    opacity 220ms ease,
    background 220ms ease;
}

:deep(.swiper-pagination-bullet-active) {
  transform: scale(1.18);
}

@media (prefers-reduced-motion: reduce) {
  .avatar-slide,
  :deep(.swiper-pagination-bullet) {
    transition-duration: 1ms;
  }
}
</style>
