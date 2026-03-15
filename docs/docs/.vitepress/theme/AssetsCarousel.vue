<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const cards = [
    {
        href: '/packages/typescript/quick-start',
        title: 'TypeScript Types',
        status: 'Available today',
        tone: 'today',
        desc: 'Interfaces, enums, and generics generated straight from your .as definitions. Full autocompletion, zero manual typing.',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none"><g clip-path="url(#SVGXv8lpc2Y)"><path fill="currentColor" d="M23.429 0H.57A.57.57 0 0 0 0 .571V23.43a.57.57 0 0 0 .571.571H23.43a.57.57 0 0 0 .571-.571V.57a.57.57 0 0 0-.572-.57m-9.143 12.826h-2.857v8.888H9.143v-8.888H6.286v-1.969h8zm.64 8.38v-2.375s1.298.978 2.855.978s1.497-1.018 1.497-1.158c0-1.477-4.412-1.477-4.412-4.751c0-4.452 6.429-2.695 6.429-2.695l-.08 2.116s-1.078-.719-2.296-.719s-1.657.58-1.657 1.198c0 1.597 4.452 1.438 4.452 4.652c0 4.95-6.788 2.755-6.788 2.755"/></g><defs><clipPath id="SVGXv8lpc2Y"><path fill="#fff" d="M0 0h24v24H0z"/></clipPath></defs></g></svg>`,
    },
    {
        href: '/packages/typescript/primitives',
        title: 'Validators',
        status: 'Available today',
        tone: 'today',
        desc: 'Every type carries its own constraints. Emails, URLs, ranges — validated at runtime, no extra schemas needed.',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m4.5 12.75 6 6 9-13.5"/></svg>`,
    },
    {
        href: '/db/guide/',
        title: 'Database Tables',
        status: 'Available today',
        tone: 'today',
        desc: 'Foreign keys, indexes, cascades, and views declared as annotations, then synced with your database integrations.',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375"/></svg>`,
    },
    {
        href: '/db/guide/http-crud',
        title: 'REST API',
        status: 'Available today',
        tone: 'today',
        desc: 'Expose CRUD and REST integrations from the same model with filtering, pagination, and validation in the workflow.',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="m37 22l-3 3l-11-11l3-3c1.5-1.5 7-4 11 0s1.5 9.5 0 11m5-16l-5 5M11 26l3-3l11 11l-3 3c-1.5 1.5-7 4-11 0s-1.5-9.5 0-11m12 6l4-4M6 42l5-5m5-12l4-4"/></svg>`,
    },
    {
        href: '/packages/typescript/json-schema',
        title: 'JSON Schema',
        status: 'Available today',
        tone: 'today',
        desc: 'Feed OpenAPI docs and other JSON Schema-aware tooling straight from your model.',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"/></svg>`,
    },
    {
        href: null,
        title: 'UI Forms',
        status: 'Planned',
        tone: 'planned',
        desc: 'Use labels, field types, and validation rules from the model to automate forms. Planned as part of the full data flow.',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25z"/></svg>`,
    },
    {
        href: null,
        title: 'Table Views',
        status: 'Planned',
        tone: 'planned',
        desc: 'Build table and list UIs from the same model instead of maintaining separate view configuration by hand.',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 6.75h16.5m-16.5 5.25h16.5m-16.5 5.25h16.5M8.25 4.5v15m7.5-15v15"/></svg>`,
    },
]

const active = ref(0)
const stopped = ref(false)
let timer = null
let touchStartX = 0
let touchStartY = 0
let touchDeltaX = 0
let swiping = false
const swipeThreshold = 40
const autoInterval = 4000

const count = cards.length

function next() { active.value = (active.value + 1) % count }
function prev() { active.value = (active.value - 1 + count) % count }

function goTo(i) {
    active.value = i
    stopPermanently()
}

function stopPermanently() {
    stopTimer()
    stopped.value = true
}

function startTimer() {
    if (stopped.value) { return }
    stopTimer()
    timer = setTimeout(() => { next(); startTimer() }, autoInterval)
}

function stopTimer() {
    if (timer) { clearTimeout(timer); timer = null }
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
        if (touchDeltaX < -swipeThreshold) { next(); stopPermanently() }
        else if (touchDeltaX > swipeThreshold) { prev(); stopPermanently() }
        else { startTimer() }
    } else {
        startTimer()
    }
    touchDeltaX = 0
    swiping = false
}

function getPosition(index) {
    const diff = (index - active.value + count) % count
    if (diff === 0) { return 'center' }
    if (diff === 1 || (diff === count - 1 && count <= 2)) { return 'right' }
    if (diff === count - 1) { return 'left' }
    if (diff === 2 || (diff === count - 2 && count <= 3)) { return 'far-right' }
    if (diff === count - 2) { return 'far-left' }
    return 'hidden'
}

const positionedCards = computed(() =>
    cards.map((card, i) => ({ ...card, index: i, position: getPosition(i) }))
)

onMounted(startTimer)
onUnmounted(stopTimer)
</script>

<template>
    <div
        class="assets-carousel"
        @mouseenter="stopTimer"
        @mouseleave="startTimer"
        @touchstart.passive="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
    >
        <div class="ac-track">
            <component
                v-for="card in positionedCards"
                :key="card.index"
                :is="card.href ? 'a' : 'div'"
                :href="card.href || undefined"
                class="ac-card"
                :class="[`ac-${card.position}`, { 'ac-planned': card.tone === 'planned' }]"
                @click="card.position === 'center' ? undefined : (card.position === 'left' ? (prev(), stopPermanently()) : card.position === 'right' ? (next(), stopPermanently()) : undefined)"
            >
                <div class="ac-card-icon">
                    <div class="ac-icon-inner" v-html="card.icon" />
                </div>
                <div class="ac-card-body">
                    <div class="ac-card-status" :class="`ac-status-${card.tone}`">{{ card.status }}</div>
                    <div class="ac-card-title">{{ card.title }}</div>
                    <div class="ac-card-desc">{{ card.desc }}</div>
                </div>
            </component>
        </div>
        <div class="ac-dots">
            <button
                v-for="(card, i) in cards"
                :key="i"
                class="ac-dot"
                :class="{ active: i === active, running: i === active && !stopped }"
                :aria-label="`Go to: ${card.title}`"
                @click="goTo(i)"
            >
                <span class="ac-dot-progress" />
            </button>
        </div>
    </div>
</template>

<style scoped>
.assets-carousel {
    display: flex;
    flex-direction: column;
    gap: 20px;
    touch-action: pan-y;
    -webkit-user-select: none;
    user-select: none;
}

.ac-track {
    position: relative;
    height: 340px;
    perspective: 800px;
}

@media (min-width: 640px) {
    .ac-track { height: 380px; }
}

/* Card base */
.ac-card {
    position: absolute;
    top: 0;
    left: 50%;
    width: 250px;
    height: 320px;
    display: flex;
    flex-direction: column;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid var(--vp-c-divider);
    background: var(--vp-c-bg);
    text-decoration: none;
    color: inherit;
    transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1),
                opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1),
                filter 0.5s cubic-bezier(0.4, 0, 0.2, 1),
                box-shadow 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    will-change: transform, opacity;
    cursor: pointer;
}

@media (min-width: 640px) {
    .ac-card {
        width: 280px;
        height: 360px;
    }
}

/* Positions */
.ac-center {
    transform: translateX(-50%) translateZ(0) scale(1);
    opacity: 1;
    z-index: 3;
    box-shadow: 0 8px 32px rgba(71, 26, 236, 0.12);
}

:global(.dark) .ac-center {
    box-shadow: 0 8px 32px rgba(174, 153, 252, 0.15);
}

.ac-center:hover {
    border-color: var(--vp-c-brand-1);
}

.ac-left {
    transform: translateX(calc(-50% - 160px)) translateZ(-80px) scale(0.85);
    opacity: 0.6;
    z-index: 2;
    filter: blur(1px);
}

@media (min-width: 640px) {
    .ac-left {
        transform: translateX(calc(-50% - 180px)) translateZ(-80px) scale(0.85);
    }
}

.ac-right {
    transform: translateX(calc(-50% + 160px)) translateZ(-80px) scale(0.85);
    opacity: 0.6;
    z-index: 2;
    filter: blur(1px);
}

@media (min-width: 640px) {
    .ac-right {
        transform: translateX(calc(-50% + 180px)) translateZ(-80px) scale(0.85);
    }
}

.ac-far-left {
    transform: translateX(calc(-50% - 280px)) translateZ(-160px) scale(0.7);
    opacity: 0;
    z-index: 1;
    pointer-events: none;
}

.ac-far-right {
    transform: translateX(calc(-50% + 280px)) translateZ(-160px) scale(0.7);
    opacity: 0;
    z-index: 1;
    pointer-events: none;
}

.ac-hidden {
    transform: translateX(-50%) translateZ(-200px) scale(0.6);
    opacity: 0;
    z-index: 0;
    pointer-events: none;
}

/* Card icon area - top half */
.ac-card-icon {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(71, 26, 236, 0.06);
    border-bottom: 1px solid var(--vp-c-divider);
}

:global(.dark) .ac-card-icon {
    background: rgba(174, 153, 252, 0.08);
}

.ac-icon-inner {
    width: 56px;
    height: 56px;
    color: var(--vp-c-brand-1);
}

@media (min-width: 640px) {
    .ac-icon-inner {
        width: 64px;
        height: 64px;
    }
}

.ac-icon-inner :deep(svg) {
    width: 100%;
    height: 100%;
}

/* Card body - bottom half */
.ac-card-body {
    padding: 18px 20px;
    text-align: left;
}

.ac-card-status {
    display: inline-flex;
    align-self: flex-start;
    margin-bottom: 10px;
    padding: 4px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.ac-status-today {
    background: rgba(43, 170, 196, 0.12);
    color: #127791;
}

.ac-status-planned {
    background: rgba(217, 119, 6, 0.12);
    color: #9a4b00;
}

:global(.dark) .ac-status-today {
    background: rgba(43, 170, 196, 0.18);
    color: #7ddff2;
}

:global(.dark) .ac-status-planned {
    background: rgba(245, 158, 11, 0.18);
    color: #f6c46b;
}

.ac-card-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--vp-c-text-1);
    margin-bottom: 6px;
}

.ac-card-desc {
    font-size: 14px;
    color: var(--vp-c-text-2);
    line-height: 1.5;
    text-align: justify;
}

/* Coming soon */
.ac-planned {
    cursor: default;
}

.ac-planned .ac-card-icon {
    background: rgba(245, 158, 11, 0.06);
}

:global(.dark) .ac-planned .ac-card-icon {
    background: rgba(245, 158, 11, 0.12);
}

/* Dots */
.ac-dots {
    display: flex;
    justify-content: center;
    gap: 8px;
}

.ac-dot {
    position: relative;
    width: 32px;
    height: 32px;
    border: none;
    padding: 0;
    cursor: pointer;
    background: transparent;
}

.ac-dot::before {
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

.ac-dot:hover::before {
    background: rgba(71, 26, 236, 0.2);
}

:global(.dark) .ac-dot:hover::before {
    background: rgba(174, 153, 252, 0.25);
}

.ac-dot.active::before {
    background: rgba(71, 26, 236, 0.15);
}

:global(.dark) .ac-dot.active::before {
    background: rgba(174, 153, 252, 0.2);
}

.ac-dot-progress {
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

.ac-dot.active .ac-dot-progress {
    width: 100%;
    transition: width 0.3s ease;
}

.ac-dot.running .ac-dot-progress {
    transition: width 4000ms linear;
}
</style>
