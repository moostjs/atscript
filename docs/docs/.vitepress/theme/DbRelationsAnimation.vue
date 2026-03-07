<script setup>
import { onMounted, onUnmounted, ref } from 'vue'

const dot1Offset = ref(0)
const dot2Offset = ref(0)
const dot1Reverse = ref(false)
const dot2Reverse = ref(false)
const sceneOpacity = ref(0)
const sceneScale = ref(0.92)

let raf = null
let startTime = 0

const DURATION_1 = 2400
const DURATION_2 = 1800

// Breathing cycle: fade-in 0.8s, scale 8.7s total (fade-in + visible + fade-out), fade-out 0.8s, pause 0.4s
const FADE_IN = 800
const VISIBLE = 7500
const FADE_OUT = 800
const PAUSE = 400
const CYCLE = FADE_IN + VISIBLE + FADE_OUT + PAUSE
// Scale runs uniformly across all visible phases (fade-in + visible + fade-out)
const SCALE_DURATION = FADE_IN + VISIBLE + FADE_OUT
const SCALE_START = 0.92
const SCALE_END = 1.09

function animate(ts) {
    if (!startTime) { startTime = ts }
    const elapsed = ts - startTime

    // Dot signals
    const t1 = (elapsed % (DURATION_1 * 2)) / DURATION_1
    dot1Reverse.value = t1 > 1
    dot1Offset.value = t1 > 1 ? 2 - t1 : t1

    const t2 = ((elapsed + 600) % (DURATION_2 * 2)) / DURATION_2
    dot2Reverse.value = t2 > 1
    dot2Offset.value = t2 > 1 ? 2 - t2 : t2

    // Breathing scale + fade
    const ct = elapsed % CYCLE
    // Scale runs at constant speed across entire visible duration
    const scaleP = Math.min(ct / SCALE_DURATION, 1)
    sceneScale.value = SCALE_START + (SCALE_END - SCALE_START) * scaleP

    if (ct < FADE_IN) {
        sceneOpacity.value = ct / FADE_IN
    } else if (ct < FADE_IN + VISIBLE) {
        sceneOpacity.value = 1
    } else if (ct < FADE_IN + VISIBLE + FADE_OUT) {
        sceneOpacity.value = 1 - (ct - FADE_IN - VISIBLE) / FADE_OUT
    } else {
        sceneOpacity.value = 0
        sceneScale.value = SCALE_START
    }

    raf = requestAnimationFrame(animate)
}

onMounted(() => {
    startTime = 0
    raf = requestAnimationFrame(animate)
})

onUnmounted(() => {
    if (raf) { cancelAnimationFrame(raf) }
})

// Lerp helper for positioning dots along paths
function lerp(a, b, t) {
    return a + (b - a) * t
}

function getDot1Pos(t) {
    // Path: right edge of User Profile table → bend down → right to Comment
    // Segments: (94, 60) → (124, 60) bend → (124, 195) → (150, 195)
    const segments = [
        { x1: 94, y1: 60, x2: 124, y2: 60, len: 30 },
        { x1: 124, y1: 60, x2: 124, y2: 195, len: 135 },
        { x1: 124, y1: 195, x2: 150, y2: 195, len: 26 },
    ]
    const totalLen = segments.reduce((s, seg) => s + seg.len, 0)
    let dist = t * totalLen
    for (const seg of segments) {
        if (dist <= seg.len) {
            const st = dist / seg.len
            return { x: lerp(seg.x1, seg.x2, st), y: lerp(seg.y1, seg.y2, st) }
        }
        dist -= seg.len
    }
    return { x: 150, y: 195 }
}

function getDot2Pos(t) {
    // Path: bottom of Post table → top of Comment table
    // (198, 103) → (198, 154)
    return { x: 198, y: lerp(103, 154, t) }
}
</script>

<template>
    <div class="db-relations-perspective">
        <div
            class="db-relations-animation"
            :style="{ opacity: sceneOpacity, transform: `rotateY(-12deg) rotateX(14deg) rotateZ(3deg) scale(${sceneScale})` }"
        >
        <svg viewBox="0 0 250 245" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Relation lines (drawn first, behind tables) -->
            <!-- User Profile → Comment -->
            <path
                d="M94 60H116C123 60 124 66 124 69V186C124 192 129 195 132 195H150"
                class="relation-line"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
            />
            <!-- Arrow: User Profile → Comment -->
            <path d="M144 189L151 195L144 201" class="relation-line" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />

            <!-- Post → Comment -->
            <path
                d="M198 103V154"
                class="relation-line"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
            />
            <!-- Arrow: Post → Comment -->
            <path d="M192 147L198 155L204 147" class="relation-line" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />

            <!-- User Profile table -->
            <g class="table-group">
                <rect x="7" y="14" width="87" height="88" rx="4" class="table-bg" />
                <rect x="7" y="14" width="87" height="88" rx="4" class="table-border" fill="none" stroke-width="2.5" />
                <line x1="7" y1="38" x2="94" y2="38" class="table-border" stroke-width="2" />
                <line x1="37" y1="38" x2="37" y2="102" class="table-border" stroke-width="1.5" />
                <line x1="7" y1="62" x2="94" y2="62" class="table-border" stroke-width="1.5" />
                <!-- Header text -->
                <text x="50" y="30" text-anchor="middle" class="table-header">User Profile</text>
                <!-- Key icon (simplified) -->
                <circle cx="22" cy="50" r="4" class="key-icon" fill="none" stroke-width="1.5" />
                <line x1="25" y1="53" x2="30" y2="57" class="key-icon" stroke-width="1.5" />
                <!-- id label -->
                <text x="46" y="54" class="table-field">id</text>
                <!-- Empty rows hint -->
                <rect x="10" y="66" width="22" height="5" rx="2" class="row-hint" />
                <rect x="40" y="66" width="35" height="5" rx="2" class="row-hint" />
                <rect x="10" y="78" width="22" height="5" rx="2" class="row-hint" />
                <rect x="40" y="78" width="28" height="5" rx="2" class="row-hint" />
                <rect x="10" y="90" width="22" height="5" rx="2" class="row-hint" />
                <rect x="40" y="90" width="42" height="5" rx="2" class="row-hint" />
            </g>

            <!-- Post table -->
            <g class="table-group">
                <rect x="155" y="14" width="87" height="88" rx="4" class="table-bg" />
                <rect x="155" y="14" width="87" height="88" rx="4" class="table-border" fill="none" stroke-width="2.5" />
                <line x1="155" y1="38" x2="242" y2="38" class="table-border" stroke-width="2" />
                <line x1="180" y1="38" x2="180" y2="102" class="table-border" stroke-width="1.5" />
                <line x1="155" y1="62" x2="242" y2="62" class="table-border" stroke-width="1.5" />
                <!-- Header -->
                <text x="198" y="30" text-anchor="middle" class="table-header">Post</text>
                <!-- Key icon -->
                <circle cx="167" cy="50" r="4" class="key-icon" fill="none" stroke-width="1.5" />
                <line x1="170" y1="53" x2="175" y2="57" class="key-icon" stroke-width="1.5" />
                <!-- id -->
                <text x="190" y="54" class="table-field">id</text>
                <!-- Rows -->
                <rect x="158" y="66" width="18" height="5" rx="2" class="row-hint" />
                <rect x="183" y="66" width="40" height="5" rx="2" class="row-hint" />
                <rect x="158" y="78" width="18" height="5" rx="2" class="row-hint" />
                <rect x="183" y="78" width="30" height="5" rx="2" class="row-hint" />
                <rect x="158" y="90" width="18" height="5" rx="2" class="row-hint" />
                <rect x="183" y="90" width="48" height="5" rx="2" class="row-hint" />
            </g>

            <!-- Comment table -->
            <g class="table-group">
                <rect x="155" y="157" width="87" height="78" rx="4" class="table-bg" />
                <rect x="155" y="157" width="87" height="78" rx="4" class="table-border" fill="none" stroke-width="2.5" />
                <line x1="155" y1="181" x2="242" y2="181" class="table-border" stroke-width="2" />
                <line x1="180" y1="181" x2="180" y2="235" class="table-border" stroke-width="1.5" />
                <line x1="155" y1="204" x2="242" y2="204" class="table-border" stroke-width="1.5" />
                <!-- Header -->
                <text x="198" y="173" text-anchor="middle" class="table-header">Comment</text>
                <!-- Key icon -->
                <circle cx="167" cy="193" r="4" class="key-icon" fill="none" stroke-width="1.5" />
                <line x1="170" y1="196" x2="175" y2="200" class="key-icon" stroke-width="1.5" />
                <!-- id -->
                <text x="190" y="197" class="table-field">id</text>
                <!-- Rows -->
                <rect x="158" y="209" width="18" height="5" rx="2" class="row-hint" />
                <rect x="183" y="209" width="36" height="5" rx="2" class="row-hint" />
                <rect x="158" y="221" width="18" height="5" rx="2" class="row-hint" />
                <rect x="183" y="221" width="44" height="5" rx="2" class="row-hint" />
            </g>

            <!-- Animated signal dots -->
            <circle
                :cx="getDot1Pos(dot1Offset).x"
                :cy="getDot1Pos(dot1Offset).y"
                r="4"
                class="signal-dot"
                :class="{ reverse: dot1Reverse }"
            />
            <circle
                :cx="getDot1Pos(dot1Offset).x"
                :cy="getDot1Pos(dot1Offset).y"
                r="8"
                class="signal-glow"
                :class="{ reverse: dot1Reverse }"
            />

            <circle
                :cx="getDot2Pos(dot2Offset).x"
                :cy="getDot2Pos(dot2Offset).y"
                r="4"
                class="signal-dot dot2"
                :class="{ reverse: dot2Reverse }"
            />
            <circle
                :cx="getDot2Pos(dot2Offset).x"
                :cy="getDot2Pos(dot2Offset).y"
                r="8"
                class="signal-glow dot2"
                :class="{ reverse: dot2Reverse }"
            />
        </svg>
        </div>
        <div class="fade-edge fade-top" />
        <div class="fade-edge fade-bottom" />
        <div class="fade-edge fade-left" />
        <div class="fade-edge fade-right" />
    </div>
</template>

<style scoped>
.db-relations-perspective {
    perspective: 400px;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
}

.fade-edge {
    position: absolute;
    pointer-events: none;
    z-index: 1;
}

.fade-top {
    top: 0;
    left: 0;
    right: 0;
    height: 24px;
    background: linear-gradient(to bottom, var(--vp-c-bg), transparent);
}

.fade-bottom {
    bottom: 0;
    left: 0;
    right: 0;
    height: 24px;
    background: linear-gradient(to top, var(--vp-c-bg), transparent);
}

.fade-left {
    top: 0;
    bottom: 0;
    left: 0;
    width: 24px;
    background: linear-gradient(to right, var(--vp-c-bg), transparent);
}

.fade-right {
    top: 0;
    bottom: 0;
    right: 0;
    width: 24px;
    background: linear-gradient(to left, var(--vp-c-bg), transparent);
}

.db-relations-animation {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 8px;
    transform-origin: center center;
    will-change: opacity, transform;
}

.db-relations-animation svg {
    width: 100%;
    max-width: 260px;
    height: auto;
}

/* Table styles */
.table-bg {
    fill: var(--vp-c-bg);
}

.table-border {
    stroke: var(--vp-c-text-3);
}

.table-header {
    font-size: 11px;
    font-weight: 700;
    fill: var(--vp-c-text-1);
    font-family: var(--vp-font-family-base);
}

.table-field {
    font-size: 10px;
    font-weight: 500;
    fill: var(--vp-c-text-2);
    font-family: var(--vp-font-family-mono);
}

.key-icon {
    stroke: var(--vp-c-text-3);
}

.row-hint {
    fill: var(--vp-c-divider);
    opacity: 0.5;
}

/* Relation lines */
.relation-line {
    stroke: var(--vp-c-text-3);
    opacity: 0.6;
}

/* Signal dots */
.signal-dot {
    fill: var(--vp-c-brand-1);
    opacity: 0.9;
}

.signal-glow {
    fill: var(--vp-c-brand-1);
    opacity: 0.2;
}

.signal-dot.reverse {
    fill: #38a169;
}

.signal-glow.reverse {
    fill: #38a169;
}

:global(.dark) .signal-dot.reverse {
    fill: #68d391;
}

:global(.dark) .signal-glow.reverse {
    fill: #68d391;
}

.signal-dot.dot2 {
    fill: var(--vp-c-brand-2);
}

.signal-glow.dot2 {
    fill: var(--vp-c-brand-2);
}

.signal-dot.dot2.reverse {
    fill: #d69e2e;
}

.signal-glow.dot2.reverse {
    fill: #d69e2e;
}

:global(.dark) .signal-dot.dot2.reverse {
    fill: #f6e05e;
}

:global(.dark) .signal-glow.dot2.reverse {
    fill: #f6e05e;
}
</style>
