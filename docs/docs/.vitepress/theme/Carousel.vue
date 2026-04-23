<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'

const props = defineProps({
  count: { type: Number, required: true },
  interval: { type: Number, default: 5000 },
  intervals: { type: Array, default: () => [] },
  labels: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:active'])

const active = ref(0)
const stopped = ref(false)
let timer = null
let touchStartX = 0
let touchStartY = 0
let touchDeltaX = 0
let swiping = false

const swipeThreshold = 40

function next() {
  active.value = (active.value + 1) % props.count
  emit('update:active', active.value)
}

function prev() {
  active.value = (active.value - 1 + props.count) % props.count
  emit('update:active', active.value)
}

function goTo(i) {
  active.value = i
  emit('update:active', active.value)
  stopPermanently()
}

function getInterval(index) {
  return props.intervals[index] ?? props.interval
}

function stopPermanently() {
  stopTimer()
  stopped.value = true
}

function startTimer() {
  if (stopped.value) {
    return
  }
  stopTimer()
  const dur = getInterval(active.value)
  if (dur > 0) {
    timer = setTimeout(() => {
      next()
      startTimer()
    }, dur)
  }
}

function stopTimer() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

function onTouchStart(e) {
  stopTimer()
  const touch = e.touches[0]
  touchStartX = touch.clientX
  touchStartY = touch.clientY
  touchDeltaX = 0
  swiping = false
}

function onTouchMove(e) {
  const touch = e.touches[0]
  const dx = touch.clientX - touchStartX
  const dy = touch.clientY - touchStartY

  if (!swiping && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
    swiping = true
  }

  if (swiping) {
    e.preventDefault()
    touchDeltaX = dx
  }
}

function onTouchEnd() {
  if (swiping) {
    if (touchDeltaX < -swipeThreshold) {
      next()
      stopPermanently()
    } else if (touchDeltaX > swipeThreshold) {
      prev()
      stopPermanently()
    } else {
      startTimer()
    }
  } else {
    startTimer()
  }
  touchDeltaX = 0
  swiping = false
}

const progressDuration = computed(() => `${getInterval(active.value)}ms`)

onMounted(startTimer)
onUnmounted(stopTimer)

defineExpose({ active, stopped, goTo, next, prev })
</script>

<template>
  <div
    class="carousel"
    @mouseenter="stopTimer"
    @mouseleave="startTimer"
    @touchstart.passive="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
  >
    <div class="carousel-viewport">
      <Transition name="carousel-fade" mode="out-in">
        <div class="carousel-slide" :key="active">
          <slot :index="active" />
        </div>
      </Transition>
    </div>
    <div class="carousel-dots">
      <button
        v-for="i in count"
        :key="i - 1"
        class="carousel-dot"
        :class="{ active: i - 1 === active, running: i - 1 === active && !stopped }"
        :aria-label="labels[i - 1] ? `Go to: ${labels[i - 1]}` : `Go to slide ${i}`"
        @click="goTo(i - 1)"
      >
        <span class="dot-progress" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.carousel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  touch-action: pan-y;
  -webkit-user-select: none;
  user-select: none;
}

.carousel-viewport {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.carousel-slide {
  height: 100%;
}

/* Dots */
.carousel-dots {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.carousel-dot {
  position: relative;
  width: 32px;
  height: 32px;
  border: none;
  padding: 0;
  cursor: pointer;
  background: transparent;
}

.carousel-dot::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--vp-c-divider);
  transition: background 0.3s ease;
}

.carousel-dot:hover::before {
  background: rgba(71, 26, 236, 0.2);
}

:global(.dark) .carousel-dot:hover::before {
  background: rgba(174, 153, 252, 0.25);
}

.carousel-dot.active::before {
  background: rgba(71, 26, 236, 0.15);
}

:global(.dark) .carousel-dot.active::before {
  background: rgba(174, 153, 252, 0.2);
}

.dot-progress {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  left: 0;
  height: 4px;
  width: 0;
  background: var(--vp-c-brand-1);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.carousel-dot.active .dot-progress {
  width: 100%;
  transition: width 0.3s ease;
}

.carousel-dot.running .dot-progress {
  transition: width v-bind(progressDuration) linear;
}

/* Slide transitions */
.carousel-fade-enter-active {
  transition:
    opacity 0.35s ease,
    transform 0.35s ease;
}

.carousel-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.carousel-fade-enter-from {
  opacity: 0;
  transform: translateX(16px);
}

.carousel-fade-leave-to {
  opacity: 0;
  transform: translateX(-16px);
}
</style>
