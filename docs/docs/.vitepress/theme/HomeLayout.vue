<script setup>
import { onMounted, nextTick, watch } from 'vue'
// oxlint-disable-next-line import/named -- vitepress re-exports these
import { useData, useRoute } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import VPButton from 'vitepress/dist/client/theme-default/components/VPButton.vue'
import SnippetScattered from './snippets/scattered-ts.md'
import SnippetUnified from './snippets/unified-as.md'

const { Layout } = DefaultTheme
const { frontmatter } = useData()
const route = useRoute()

function setupScrollAnimations() {
    nextTick(() => {
        const observer = new IntersectionObserver( // oxlint-disable-line no-undef -- browser global
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        e.target.classList.add('visible')
                        observer.unobserve(e.target)
                    }
                })
            },
            { threshold: 0.1 }
        )
        document.querySelectorAll('.animate-in').forEach((el) => { // oxlint-disable-line no-undef -- browser global
            el.classList.remove('visible')
            observer.observe(el)
        })
    })
}

onMounted(setupScrollAnimations)
watch(() => route.path, setupScrollAnimations)

const features = [
    {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-3-3v6m-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z"/></svg>`,
        title: 'One File, Zero Drift',
        details: 'Types, validation, DB schemas, and UI metadata in a single <code>.as</code> file. Change once, everything stays in sync.',
        link: '/packages/typescript/why-atscript',
    },
    {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m4.5 12.75 6 6 9-13.5"/></svg>`,
        title: 'Types That Validate',
        details: "<code>string.email</code> isn't just a type — it's a validator. <code>number.int.positive</code> carries constraints automatically.",
        link: '/packages/typescript/primitives',
    },
    {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M21 6.375c0 2.692-4.03 4.875-9 4.875S3 9.067 3 6.375S7.03 1.5 12 1.5s9 2.183 9 4.875z"/><path fill="currentColor" d="M12 12.75c2.685 0 5.19-.586 7.078-1.609a8.3 8.3 0 0 0 1.897-1.384Q21 10.09 21 10.5v1.875c0 2.692-4.03 4.875-9 4.875S3 15.067 3 12.375V10.5q.024-.413.025-.743a8.3 8.3 0 0 0 1.897 1.384C6.81 12.164 9.315 12.75 12 12.75z"/><path fill="currentColor" d="M12 18.75c2.685 0 5.19-.586 7.078-1.609a8.3 8.3 0 0 0 1.897-1.384q.025.333.025.743v1.875c0 2.692-4.03 4.875-9 4.875S3 21.067 3 18.375V16.5q.024-.413.025-.743a8.3 8.3 0 0 0 1.897 1.384C6.81 18.164 9.315 18.75 12 18.75z"/></svg>`,
        title: 'Database From Annotations',
        details: '<code>@db.table</code>, <code>@db.index.unique</code>, <code>@db.column</code> — your schema creates tables, syncs indexes, and handles CRUD.',
        link: '/db-support/',
    },
    {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/></svg>`,
        title: 'Full Stack From One Source',
        details: 'TypeScript types, runtime validators, JSON Schema, database tables with indexes — all generated from one <code>.as</code> file.',
        link: '/packages/typescript/quick-start',
    },
    {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.1 18.1 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 6h.008v.008H6z"/></svg>`,
        title: 'Rich Runtime Metadata',
        details: 'Labels, descriptions, sensitivity flags, UI hints — all accessible at runtime for forms, docs, and APIs.',
        link: '/packages/typescript/metadata-export',
    },
    {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M41.5 10h-6m-8-4v8m0-4h-22m8 14h-8m16-4v8m22-4h-22m20 14h-6m-8-4v8m0-4h-22"/></svg>`,
        title: 'Your Rules, Your Plugins',
        details: 'Add domain-specific annotations that flow through your entire stack. Build plugins for any language, database, or framework.',
        link: '/plugin-development/',
    },
]
</script>

<template>
    <Layout>
        <template #home-hero-before>
            <!-- Hero -->
            <div class="custom-hero">
                <div class="hero-inner">
                    <div class="hero-main">
                        <h1 class="hero-name">Atscript</h1>
                        <p class="hero-text">{{ frontmatter.hero2.text }}</p>
                        <p class="hero-tagline">{{ frontmatter.hero2.tagline }}</p>
                        <div v-if="frontmatter.actions" class="actions">
                            <div
                                v-for="action in frontmatter.actions"
                                :key="action.link"
                                class="action"
                            >
                                <VPButton
                                    tag="a"
                                    size="medium"
                                    :theme="action.theme"
                                    :text="action.text"
                                    :href="action.link"
                                />
                            </div>
                        </div>

                    </div>
                    
                    <div class="hero-image">
                        <div class="image-container">
                            <img src="/logo.svg" alt="Atscript" class="image-src" />
                        </div>
                    </div>
                </div>
            </div>

            <!-- Feature Cards -->
            <section class="features-section">
                <div class="features-inner">
                    <div class="features-grid">
                        <a
                            v-for="(f, i) in features"
                            :key="i"
                            :href="f.link"
                            class="feature-card"
                            :style="{ '--delay': `${i * 0.07}s` }"
                        >
                            <div class="feature-icon" v-html="f.icon" />
                            <div class="feature-body">
                                <h3 class="feature-title">{{ f.title }}</h3>
                                <p class="feature-details" v-html="f.details"></p>
                            </div>
                        </a>
                    </div>
                </div>
            </section>

            <!-- Before/After: Scattered vs Unified -->
            <section class="code-section bg-diagonal bg-diagonal-1">
                <div class="code-section-inner">
                    <h2 class="section-heading animate-in">You've written this type <span class="heading-hl">three times</span> today.</h2>
                    <p class="section-subheading animate-in">Once in Drizzle. Once in Zod. Once in your UI config. Atscript replaces all of them.</p>
                    <div class="comparison-grid animate-in">
                        <div class="comparison-col">
                            <div class="comparison-label muted-label">Before <span class="file-count">3 files</span></div>
                            <div class="comparison-block">
                                <SnippetScattered />
                            </div>
                        </div>
                        <div class="comparison-arrow">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M5 12h14M13 5l7 7-7 7" />
                            </svg>
                        </div>
                        <div class="comparison-col brand-col">
                            <div class="comparison-label brand-label">After <span class="file-count">1 file</span></div>
                            <div class="comparison-block brand-block">
                                <SnippetUnified />
                            </div>
                        </div>
                    </div>
                    <p class="section-footnote animate-in"><code>@meta.*</code> annotations are built-in. <code>@db.*</code> annotations power real <a href="/db-support/">database integrations</a>. Add your own via the <a href="/plugin-development/">plugin system</a>.</p>
                </div>
            </section>

            <!-- What You Get strip -->
            <section class="what-you-get animate-in">
                <div class="what-you-get-inner">
                    <div class="wyg-item">
                        <div class="wyg-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M11.644 1.59a.75.75 0 0 1 .712 0l9.75 5.25a.75.75 0 0 1 0 1.32l-9.75 5.25a.75.75 0 0 1-.712 0l-9.75-5.25a.75.75 0 0 1 0-1.32l9.75-5.25z"/><path fill="currentColor" d="M3.265 10.602l7.668 4.129a2.25 2.25 0 0 0 2.134 0l7.668-4.13 1.37.739a.75.75 0 0 1 0 1.32l-9.75 5.25a.75.75 0 0 1-.71 0l-9.75-5.25a.75.75 0 0 1 0-1.32l1.37-.738z"/><path fill="currentColor" d="M3.265 15.602l7.668 4.129a2.25 2.25 0 0 0 2.134 0l7.668-4.13 1.37.739a.75.75 0 0 1 0 1.32l-9.75 5.25a.75.75 0 0 1-.71 0l-9.75-5.25a.75.75 0 0 1 0-1.32l1.37-.738z"/></svg>
                        </div>
                        <div class="wyg-text">TypeScript Types</div>
                    </div>
                    <div class="wyg-sep">+</div>
                    <div class="wyg-item">
                        <div class="wyg-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M12.516 2.17a.75.75 0 0 0-1.032 0 11.2 11.2 0 0 1-7.877 3.08a.75.75 0 0 0-.722.515A12.74 12.74 0 0 0 2.25 9.75c0 5.942 4.064 10.932 9.563 12.348a.75.75 0 0 0 .374 0c5.499-1.416 9.563-6.406 9.563-12.348c0-1.39-.223-2.73-.635-3.985a.75.75 0 0 0-.722-.516l-.143.001a11.2 11.2 0 0 1-7.734-3.08zm3.927 8.57a.75.75 0 1 0-1.06-1.06L12 13.064l-1.22-1.22a.75.75 0 0 0-1.06 1.06l1.75 1.75a.75.75 0 0 0 1.06 0l3.913-3.913z" clip-rule="evenodd"/></svg>
                        </div>
                        <div class="wyg-text">Runtime Validators</div>
                    </div>
                    <div class="wyg-sep">+</div>
                    <div class="wyg-item">
                        <div class="wyg-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0 0 16.5 9h-1.875a1.875 1.875 0 0 1-1.875-1.875V5.25A3.75 3.75 0 0 0 9 1.5H5.625z"/><path fill="currentColor" d="M12.971 1.816A5.23 5.23 0 0 1 14.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 0 1 3.434 1.279a9.77 9.77 0 0 0-6.963-6.963z"/></svg>
                        </div>
                        <div class="wyg-text">JSON Schema</div>
                    </div>
                    <div class="wyg-sep">+</div>
                    <div class="wyg-item">
                        <div class="wyg-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M21 6.375c0 2.692-4.03 4.875-9 4.875S3 9.067 3 6.375S7.03 1.5 12 1.5s9 2.183 9 4.875z"/><path fill="currentColor" d="M12 12.75c2.685 0 5.19-.586 7.078-1.609a8.3 8.3 0 0 0 1.897-1.384Q21 10.09 21 10.5v1.875c0 2.692-4.03 4.875-9 4.875S3 15.067 3 12.375V10.5q.024-.413.025-.743a8.3 8.3 0 0 0 1.897 1.384C6.81 12.164 9.315 12.75 12 12.75z"/><path fill="currentColor" d="M12 18.75c2.685 0 5.19-.586 7.078-1.609a8.3 8.3 0 0 0 1.897-1.384q.025.333.025.743v1.875c0 2.692-4.03 4.875-9 4.875S3 21.067 3 18.375V16.5q.024-.413.025-.743a8.3 8.3 0 0 0 1.897 1.384C6.81 18.164 9.315 18.75 12 18.75z"/></svg>
                        </div>
                        <div class="wyg-text">DB Schemas</div>
                    </div>
                    <div class="wyg-sep">+</div>
                    <div class="wyg-item">
                        <div class="wyg-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.1 18.1 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z"/></svg>
                        </div>
                        <div class="wyg-text">Rich Metadata</div>
                    </div>
                </div>
            </section>
        </template>
    </Layout>
</template>

<style scoped>
/* ---- Hero ---- */
.custom-hero {
    position: relative;
    overflow: hidden;
    margin-top: calc(
        (var(--vp-nav-height) + var(--vp-layout-top-height, 0px)) * -1
    );
    padding: calc(
            var(--vp-nav-height) + var(--vp-layout-top-height, 0px) + 48px
        )
        24px 48px;
}
@media (min-width: 640px) {
    .custom-hero {
        padding: calc(
                var(--vp-nav-height) + var(--vp-layout-top-height, 0px) + 64px
            )
            48px 64px;
    }
}
@media (min-width: 960px) {
    .custom-hero {
        padding: calc(
                var(--vp-nav-height) + var(--vp-layout-top-height, 0px) + 64px
            )
            64px 64px;
    }
}
.hero-inner {
    max-width: 1152px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
}
@media (min-width: 960px) {
    .hero-inner {
        flex-direction: row;
        text-align: left;
    }
}
.hero-main {
    position: relative;
    z-index: 10;
    order: 2;
    flex-grow: 1;
    flex-shrink: 0;
}
@media (min-width: 960px) {
    .hero-main {
        order: 1;
        width: calc((100% / 3) * 2);
        max-width: 592px;
    }
}
/* Image area - matches VitePress .image */
.hero-image {
    order: 1;
    margin: -76px -24px -48px;
}
@media (min-width: 640px) {
    .hero-image {
        margin: -108px -24px -48px;
    }
}
@media (min-width: 960px) {
    .hero-image {
        flex-grow: 1;
        order: 2;
        margin: 0;
        min-height: 100%;
    }
}
/* Image container - matches VitePress .image-container */
.image-container {
    position: relative;
    margin: 0 auto;
    width: 320px;
    height: 320px;
}
@media (min-width: 640px) {
    .image-container {
        width: 392px;
        height: 392px;
    }
}
@media (min-width: 960px) {
    .image-container {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 100%;
        transform: translate(-32px, -32px);
    }
}
/* Logo image - matches VitePress .image-src sizing */
.image-src {
    position: absolute;
    top: 50%;
    left: 50%;
    max-width: 192px;
    transform: translate(-50%, -50%);
    filter: drop-shadow(0 0 40px rgba(71, 26, 236, 0.35))
           drop-shadow(0 0 80px rgba(71, 26, 236, 0.25))
           drop-shadow(0 0 120px rgba(71, 26, 236, 0.15));
}
:global(.dark) .image-src {
    filter: drop-shadow(0 0 40px rgba(174, 153, 252, 0.5))
           drop-shadow(0 0 80px rgba(174, 153, 252, 0.35))
           drop-shadow(0 0 140px rgba(174, 153, 252, 0.2));
}
@media (min-width: 640px) {
    .image-src {
        max-width: 256px;
    }
}
@media (min-width: 960px) {
    .image-src {
        max-width: 320px;
    }
}
.hero-name {
    font-size: 84px;
    font-weight: 600;
    letter-spacing: -1px;
    line-height: 1.1;
    color: var(--vp-c-brand-1);
    margin-bottom: 8px;
}
@media (min-width: 640px) {
    .hero-name {
        font-size: 56px;
    }
}
@media (min-width: 960px) {
    .hero-name {
        font-size: 84px;
    }
}
.hero-text {
    font-size: 20px;
    font-weight: 700;
    color: var(--vp-c-text-1);
    line-height: 1.3;
    max-width: 600px;
    margin: 0 auto 8px;
}
@media (min-width: 640px) {
    .hero-text {
        font-size: 32px;
    }
}
@media (min-width: 960px) {
    .hero-text {
        font-size: 36px;
        margin: 0 0 8px;
    }
}
.hero-tagline {
    font-size: 16px;
    font-weight: 500;
    color: var(--vp-c-text-2);
    max-width: 520px;
    margin: 0 auto;
    line-height: 1.5;
}
@media (min-width: 640px) {
    .hero-tagline {
        font-size: 20px;
    }
}
@media (min-width: 960px) {
    .hero-tagline {
        margin: 0;
    }
}
.actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    margin: -6px;
    padding-top: 28px;
}
@media (min-width: 960px) {
    .actions {
        justify-content: flex-start;
    }
}
.action {
    flex-shrink: 0;
    padding: 6px;
}

/* ---- Feature Cards ---- */
.features-section {
    padding: 0 24px 48px;
}
@media (min-width: 640px) {
    .features-section {
        padding: 0 48px 48px;
    }
}
@media (min-width: 960px) {
    .features-section {
        padding: 0 64px 48px;
    }
}
.features-inner {
    margin: 0 auto;
    max-width: 1152px;
}
.features-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
}
@media (min-width: 640px) {
    .features-grid {
        grid-template-columns: 1fr 1fr;
    }
}
@media (min-width: 960px) {
    .features-grid {
        grid-template-columns: 1fr 1fr 1fr;
    }
}
.feature-card {
    display: flex;
    gap: 16px;
    padding: 20px;
    border-radius: 12px;
    border: 1px solid var(--vp-c-divider);
    background: var(--vp-c-bg-soft);
    text-decoration: none;
    color: inherit;
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
                box-shadow 0.25s ease,
                border-color 0.25s ease;
    animation: feature-fade-in 0.5s ease both;
    animation-delay: var(--delay);
}
.feature-card:hover {
    transform: translateY(-4px);
    border-color: var(--vp-c-brand-1);
    box-shadow: 0 8px 24px rgba(71, 26, 236, 0.12);
}
:global(.dark) .feature-card:hover {
    box-shadow: 0 8px 24px rgba(174, 153, 252, 0.15);
}
@keyframes feature-fade-in {
    from {
        opacity: 0;
        transform: translateY(12px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
.feature-icon {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    padding: 6px;
    border-radius: 8px;
    background: rgba(71, 26, 236, 0.1);
    color: var(--vp-c-brand-1);
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
                background 0.25s ease;
}
:global(.dark) .feature-icon {
    background: rgba(174, 153, 252, 0.12);
}
.feature-card:hover .feature-icon {
    transform: scale(1.15) rotate(-5deg);
    background: rgba(71, 26, 236, 0.18);
}
:global(.dark) .feature-card:hover .feature-icon {
    background: rgba(174, 153, 252, 0.22);
}
.feature-icon :deep(svg) {
    width: 100%;
    height: 100%;
}
.feature-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--vp-c-text-1);
    margin-bottom: 4px;
    line-height: 1.4;
}
.feature-details {
    font-size: 13px;
    color: var(--vp-c-text-2);
    line-height: 1.5;
    margin: 0;
}
.feature-details :deep(code) {
    font-size: 12px;
    font-family: var(--vp-font-family-mono);
    color: var(--vp-c-brand-1);
    background: rgba(71, 26, 236, 0.08);
    padding: 1px 5px;
    border-radius: 4px;
}
:global(.dark) .feature-details :deep(code) {
    background: rgba(174, 153, 252, 0.12);
}

/* ---- Code Comparison Sections ---- */
.code-section {
    padding: 32px 24px;
    position: relative;
}
@media (min-width: 640px) {
    .code-section {
        padding: 64px 48px;
    }
}
@media (min-width: 960px) {
    .code-section {
        padding: 64px 64px;
    }
}
.bg-diagonal {
    padding-top: 80px !important;
    padding-bottom: 80px !important;
}
.bg-diagonal::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--vp-c-bg-soft);
}
.bg-diagonal-1::before {
    clip-path: polygon(0 50px, 100% 0, 100% 100%, 0 calc(100% - 50px));
}
.code-section-inner {
    max-width: 1152px;
    margin: 0 auto;
}
.section-heading {
    font-size: 24px;
    font-weight: 700;
    color: var(--vp-c-text-1);
    margin-bottom: 8px;
}
@media (min-width: 640px) {
    .section-heading {
        font-size: 28px;
    }
}
.heading-hl {
    color: var(--vp-c-brand-1);
}
.section-subheading {
    font-size: 16px;
    color: var(--vp-c-text-2);
    margin-bottom: 24px;
    max-width: 600px;
    line-height: 1.5;
}
.section-footnote {
    font-size: 13px;
    color: var(--vp-c-text-3);
    margin-top: 16px;
    line-height: 1.5;
}
.section-footnote code {
    font-size: 12px;
    color: var(--vp-c-text-2);
    background: var(--vp-c-bg-soft);
    padding: 1px 5px;
    border-radius: 4px;
}
.section-footnote a {
    color: var(--vp-c-brand-1);
    text-decoration: none;
}
.section-footnote a:hover {
    text-decoration: underline;
}
.comparison-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    align-items: center;
    min-width: 0;
}
.comparison-col {
    min-width: 0;
}
.comparison-arrow {
    display: flex;
    justify-content: center;
    align-self: center;
    color: var(--vp-c-text-3);
}
.comparison-arrow svg {
    transform: rotate(90deg);
}
@media (min-width: 768px) {
    .comparison-grid {
        grid-template-columns: 1fr auto 1fr;
        gap: 16px;
    }
    .comparison-arrow svg {
        transform: rotate(0deg);
    }
}
.comparison-block {
    border-radius: 0 0 12px 12px;
    overflow: hidden;
    border: 1px solid var(--vp-c-divider);
    border-top: none;
    background: var(--vp-c-bg);
}
:global(.dark) .comparison-block {
    border-color: rgba(255, 255, 255, 0.06);
}
.comparison-label {
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    border-radius: 12px 12px 0 0;
}
.muted-label {
    background: rgba(128, 128, 128, 0.1);
    color: var(--vp-c-text-2);
}
.brand-label {
    background: rgba(71, 26, 236, 0.12);
    color: var(--vp-c-brand-1);
}
:global(.dark) .brand-label {
    background: rgba(174, 153, 252, 0.12);
    color: var(--vp-c-brand-1);
}
.file-count {
    font-weight: 400;
    font-size: 12px;
    opacity: 0.7;
    margin-left: 4px;
}
.label-link {
    float: right;
    font-size: 12px;
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
    color: var(--vp-c-brand-1);
    text-decoration: none;
    opacity: 0.8;
    transition: opacity 0.2s;
}
.label-link:hover {
    opacity: 1;
}
/* Reset VitePress code block chrome inside comparison */
.comparison-block :deep(div[class*="language-"]) {
    margin: 0 !important;
    border-radius: 0;
    background: var(--vp-c-bg) !important;
}
.comparison-block :deep(button.copy),
.comparison-block :deep(span.lang),
.comparison-block :deep(.line-numbers-wrapper) {
    display: none !important;
}
.comparison-block :deep(pre) {
    padding: 0 !important;
    margin: 0 !important;
    overflow-x: auto;
}
.comparison-block :deep(code) {
    display: block;
    width: fit-content;
    min-width: 100%;
    padding: 8px 20px;
    font-size: 13px;
}
.comparison-block :deep(.file-sep) {
    padding: 4px 16px;
    font-size: 12px;
    font-family: var(--vp-font-family-mono);
    color: var(--vp-c-text-2);
    background: var(--vp-c-bg-alt);
    border-top: 1px solid var(--vp-c-divider);
}
:global(.dark) .comparison-block :deep(.file-sep) {
    border-top-color: rgba(255, 255, 255, 0.06);
}
.comparison-block :deep(.file-sep:first-child) {
    border-top: none;
}
/* Brand snippet glow */
.brand-block {
    box-shadow: 0 0 40px rgba(71, 26, 236, 0.15), 0 0 80px rgba(71, 26, 236, 0.08);
    border-color: rgba(71, 26, 236, 0.25);
}
:global(.dark) .brand-block {
    box-shadow: 0 0 40px rgba(174, 153, 252, 0.2), 0 0 80px rgba(174, 153, 252, 0.1);
    border-color: rgba(174, 153, 252, 0.3);
}

/* ---- What You Get Strip ---- */
.what-you-get {
    padding: 8px 24px 48px;
}
@media (min-width: 640px) {
    .what-you-get {
        padding: 8px 48px 56px;
    }
}
.what-you-get-inner {
    max-width: 900px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 20px 28px;
    border-radius: 16px;
    background: linear-gradient(135deg, rgba(71, 26, 236, 0.06) 0%, rgba(71, 26, 236, 0.02) 100%);
    border: 1px solid rgba(71, 26, 236, 0.15);
    flex-wrap: wrap;
}
:global(.dark) .what-you-get-inner {
    background: linear-gradient(135deg, rgba(174, 153, 252, 0.1) 0%, rgba(174, 153, 252, 0.03) 100%);
    border-color: rgba(174, 153, 252, 0.2);
}
.wyg-item {
    display: flex;
    align-items: center;
    gap: 8px;
}
.wyg-icon {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    padding: 4px;
    border-radius: 6px;
    background: rgba(71, 26, 236, 0.1);
    color: var(--vp-c-brand-1);
}
:global(.dark) .wyg-icon {
    background: rgba(174, 153, 252, 0.15);
}
.wyg-icon svg {
    width: 100%;
    height: 100%;
}
.wyg-text {
    font-size: 14px;
    font-weight: 600;
    color: var(--vp-c-text-1);
    white-space: nowrap;
}
.wyg-sep {
    font-size: 16px;
    font-weight: 700;
    color: var(--vp-c-text-3);
}

/* ---- Scroll Animations ---- */
.animate-in {
    opacity: 0;
    transform: translateY(24px);
    transition: opacity 0.6s ease, transform 0.6s ease;
}
.animate-in.visible {
    opacity: 1;
    transform: translateY(0);
}
</style>
