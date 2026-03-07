<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import SnippetCode from './snippets/annotation-scroll.md'

const scrollEl = ref(null)
let animFrame = null
let scrollPos = 0

const SCROLL_SPEED = 0.35

function animate() {
    if (!scrollEl.value) { return }
    const maxScroll = scrollEl.value.scrollHeight - scrollEl.value.clientHeight
    if (maxScroll <= 0) {
        animFrame = requestAnimationFrame(animate)
        return
    }
    scrollPos += SCROLL_SPEED
    if (scrollPos >= maxScroll) {
        scrollPos = 0
    }
    scrollEl.value.scrollTop = scrollPos
    animFrame = requestAnimationFrame(animate)
}

onMounted(() => {
    animFrame = requestAnimationFrame(animate)
})

onUnmounted(() => {
    if (animFrame) { cancelAnimationFrame(animFrame) }
})
</script>

<template>
    <div class="scroll-viewport">
        <div class="scroll-perspective">
            <div ref="scrollEl" class="scroll-code">
                <SnippetCode />
                <SnippetCode />
            </div>
        </div>
        <div class="scroll-fade-top" />
        <div class="scroll-fade-bottom" />
    </div>
</template>

<style scoped>
.scroll-viewport {
    position: relative;
    width: 100%;
    height: 200px;
    overflow: clip;
    border-radius: 12px;
    user-select: none;
}

.scroll-perspective {
    width: 100%;
    height: 100%;
    perspective: 400px;
}

.scroll-code {
    position: absolute;
    width: 160%;
    height: 100%;
    overflow: hidden;
    transform: rotateY(15deg) rotateX(18deg) rotateZ(-5deg) translate(10%, -20%) scale(1.05);
    transform-origin: 70% center;
    scrollbar-width: none;
}

.scroll-code::-webkit-scrollbar {
    display: none;
}

/* Strip VitePress code block chrome */
.scroll-code :deep(div[class*="language-"]) {
    margin: 0 !important;
    border-radius: 0;
    background: var(--vp-c-bg) !important;
}

.scroll-code :deep(button.copy),
.scroll-code :deep(span.lang),
.scroll-code :deep(.line-numbers-wrapper) {
    display: none !important;
}

.scroll-code :deep(pre) {
    padding: 0 !important;
    margin: 0 !important;
    overflow-x: visible;
}

.scroll-code :deep(code) {
    display: block;
    width: fit-content;
    min-width: 100%;
    padding: 8px 20px;
    font-size: 13px;
}

/* Fade edges */
.scroll-fade-top,
.scroll-fade-bottom {
    position: absolute;
    left: 0;
    right: 0;
    height: 48px;
    pointer-events: none;
    z-index: 2;
}

.scroll-fade-top {
    top: 0;
    background: linear-gradient(to bottom, var(--vp-c-bg), transparent);
}

.scroll-fade-bottom {
    bottom: 0;
    background: linear-gradient(to top, var(--vp-c-bg), transparent);
}
</style>
