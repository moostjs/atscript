<script setup>
import Carousel from './Carousel.vue'
import ValidationAnimation from './ValidationAnimation.vue'
import AnnotationScroll from './AnnotationScroll.vue'
import DbRelationsAnimation from './DbRelationsAnimation.vue'

const slides = [
    {
        title: 'Types that validate',
        desc: '<code>string.email</code>, <code>number.int.positive</code> — types carry constraints automatically',
    },
    {
        title: 'Rich annotations',
        desc: '<code>@meta.*</code>, <code>@db.*</code>, <code>@expect.*</code> — labels, indexes, constraints, all in one place',
    },
    {
        title: 'Relations & DB schema',
        desc: 'Foreign keys, cascades, indexes, views — your schema <em>is</em> your database',
    },
]
</script>

<template>
    <Carousel :count="slides.length" :labels="slides.map(s => s.title)" :interval="8000">
        <template #default="{ index }">
            <div class="define-slide">
                <div class="slide-illustration">
                    <ValidationAnimation v-if="index === 0" />
                    <AnnotationScroll v-else-if="index === 1" />
                    <DbRelationsAnimation v-else-if="index === 2" />
                </div>
                <div class="slide-content">
                    <h3 class="slide-title">{{ slides[index].title }}</h3>
                    <p class="slide-desc" v-html="slides[index].desc" />
                </div>
            </div>
        </template>
    </Carousel>
</template>

<style scoped>
.define-slide {
    display: flex;
    flex-direction: column;
    height: 100%;
    border-radius: 16px;
    background: var(--vp-c-bg);
    border: 1px solid var(--vp-c-divider);
    overflow: hidden;
    transition: border-color 0.3s ease;
}

.define-slide:hover {
    border-color: var(--vp-c-brand-1);
}

.slide-illustration {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 24px 0;
    min-height: 180px;
}

.slide-content {
    padding: 20px 24px 24px;
}

.slide-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--vp-c-text-1);
    margin-bottom: 6px;
}

.slide-desc {
    font-size: 14px;
    color: var(--vp-c-text-2);
    line-height: 1.5;
    margin: 0;
}

.slide-desc :deep(code) {
    font-size: 13px;
    color: var(--vp-c-brand-1);
    background: rgba(71, 26, 236, 0.08);
    padding: 1px 5px;
    border-radius: 4px;
    font-family: var(--vp-font-family-mono);
}

:global(.dark) .slide-desc :deep(code) {
    background: rgba(174, 153, 252, 0.12);
}
</style>
