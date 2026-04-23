<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const inputValue = ref('')
const errorMessage = ref('')
const isValid = ref(false)
const showCheckmark = ref(false)
const cursorVisible = ref(true)

let animationTimer = null
let cursorTimer = null
let aborted = false

const ERROR_MESSAGE = 'Invalid email format.'

const TYPING_SPEED = 150
const ERROR_PAUSE = 1600
const ERASE_SPEED = 65
const VALID_PAUSE = 2400
const RESET_PAUSE = 2800

const badInput = 'john@'
const goodInput = 'john@mail.com'

function sleep(ms) {
  if (aborted) {
    throw new Error('aborted')
  }
  return new Promise(resolve => {
    animationTimer = setTimeout(resolve, ms)
  })
}

async function typeText(text) {
  for (let i = 1; i <= text.length; i++) {
    inputValue.value = text.slice(0, i)
    await sleep(TYPING_SPEED)
  }
}

async function eraseText() {
  const text = inputValue.value
  for (let i = text.length - 1; i >= 0; i--) {
    inputValue.value = text.slice(0, i)
    await sleep(ERASE_SPEED)
  }
}

// badInput: 5 chars × 150 = 750
// show error + pause: 1600
// erase: 5 × 65 = 325
// gap: 400
// goodInput: 13 chars × 150 = 1950
// hide error + valid: 200
// checkmark show + pause: 2400
// reset fade: 200
// reset pause: 2800
// total ≈ 10625ms

async function runAnimation() {
  try {
    // Phase 1: Type bad input, error appears on first char
    errorMessage.value = ERROR_MESSAGE
    await typeText(badInput)
    await sleep(ERROR_PAUSE)

    // Phase 2: Erase
    await eraseText()
    errorMessage.value = ''
    await sleep(400)

    // Phase 3: Type good input (error reappears during typing)
    errorMessage.value = ERROR_MESSAGE
    await typeText(goodInput)

    // Phase 4: Valid state
    errorMessage.value = ''
    isValid.value = true
    await sleep(200)
    showCheckmark.value = true
    await sleep(VALID_PAUSE)

    // Phase 5: Reset
    showCheckmark.value = false
    isValid.value = false
    await sleep(200)
    inputValue.value = ''
    await sleep(RESET_PAUSE)

    runAnimation()
  } catch {
    // Animation aborted on unmount
  }
}

onMounted(() => {
  cursorTimer = setInterval(() => {
    cursorVisible.value = !cursorVisible.value
  }, 530)
  runAnimation()
})

onUnmounted(() => {
  aborted = true
  clearTimeout(animationTimer)
  clearInterval(cursorTimer)
})
</script>

<template>
  <div class="validation-perspective">
    <div class="validation-demo">
      <div class="field-label">Email</div>
      <div class="input-wrapper" :class="{ valid: isValid, invalid: !!errorMessage }">
        <div class="fake-input">
          <span class="input-text">{{ inputValue }}</span>
          <span class="cursor" :class="{ hidden: !cursorVisible }" />
        </div>
        <transition name="checkmark">
          <div v-if="showCheckmark" class="checkmark">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </transition>
      </div>
      <div class="error-slot">
        <transition name="error">
          <div v-if="errorMessage" class="error-message">
            <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
              <path
                d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.75 3.75a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5zM8 11a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"
              />
            </svg>
            {{ errorMessage }}
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.validation-perspective {
  perspective: 400px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.validation-demo {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 20px 24px;
  min-width: 280px;
  user-select: none;
}

.field-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.fake-input {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1.5px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  font-size: 14px;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-1);
  min-height: 42px;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.input-wrapper.invalid .fake-input {
  border-color: #e53e3e;
  box-shadow: 0 0 0 3px rgba(229, 62, 62, 0.1);
}

.input-wrapper.valid .fake-input {
  border-color: #38a169;
  box-shadow: 0 0 0 3px rgba(56, 161, 105, 0.1);
}

:global(.dark) .input-wrapper.invalid .fake-input {
  border-color: #fc8181;
  box-shadow: 0 0 0 3px rgba(252, 129, 129, 0.1);
}

:global(.dark) .input-wrapper.valid .fake-input {
  border-color: #68d391;
  box-shadow: 0 0 0 3px rgba(104, 211, 145, 0.1);
}

.input-text {
  white-space: pre;
}

.cursor {
  display: inline-block;
  width: 2px;
  height: 18px;
  background: var(--vp-c-brand-1);
  margin-left: 1px;
  border-radius: 1px;
  transition: opacity 0.1s;
}

.cursor.hidden {
  opacity: 0;
}

.checkmark {
  position: absolute;
  right: 12px;
  width: 22px;
  height: 22px;
  color: #38a169;
  display: flex;
  align-items: center;
  justify-content: center;
}

:global(.dark) .checkmark {
  color: #68d391;
}

.checkmark svg {
  width: 100%;
  height: 100%;
}

.checkmark-enter-active {
  animation: pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.checkmark-leave-active {
  transition: opacity 0.15s ease;
}

.checkmark-leave-to {
  opacity: 0;
}

@keyframes pop {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  60% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.error-slot {
  height: 20px;
  position: relative;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #e53e3e;
  padding-left: 2px;
  position: absolute;
  top: 0;
  left: 0;
  white-space: nowrap;
}

:global(.dark) .error-message {
  color: #fc8181;
}

.error-enter-active {
  transition: opacity 0.2s ease;
}

.error-leave-active {
  transition: opacity 0.15s ease;
}

.error-enter-from,
.error-leave-to {
  opacity: 0;
}
</style>
