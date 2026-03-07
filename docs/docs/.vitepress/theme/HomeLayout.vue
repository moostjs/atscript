<script setup>
import { onMounted, nextTick, watch } from 'vue'
// oxlint-disable-next-line import/named -- vitepress re-exports these
import { useData, useRoute } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import VPButton from 'vitepress/dist/client/theme-default/components/VPButton.vue'
import SnippetDefine from './snippets/define-example.md'
import SnippetScattered from './snippets/scattered-ts.md'
import SnippetUnified from './snippets/unified-as.md'
import DefineCarousel from './DefineCarousel.vue'
import AssetsCarousel from './AssetsCarousel.vue'

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

            <!-- Features -->
            <section class="section-features">
                <div class="section-inner">
                    <div class="features-grid">
                        <a href="/packages/typescript/quick-start" class="feature-card">
                            <div class="feature-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg>
                            </div>
                            <h3 class="feature-title">Full Stack From One Source</h3>
                            <p class="feature-desc">TypeScript types, validators, DB tables, REST API — generated from one definition.</p>
                        </a>
                        <a href="/packages/typescript/annotations" class="feature-card">
                            <div class="feature-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.1 18.1 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 6h.008v.008H6z"/></svg>
                            </div>
                            <h3 class="feature-title">Rich Runtime Metadata</h3>
                            <p class="feature-desc">Labels, UI hints, custom annotations — accessible at runtime, not just compile time.</p>
                        </a>
                        <a href="/plugin-development/" class="feature-card">
                            <div class="feature-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.049.58.025 1.193-.14 1.743"/></svg>
                            </div>
                            <h3 class="feature-title">Your Rules, Your Plugins</h3>
                            <p class="feature-desc">Extend with custom annotations, primitives, and code generators. Atscript adapts to your stack.</p>
                        </a>
                    </div>
                </div>
            </section>

            <!-- Section 4: Comparison -->
            <section class="section-compare bg-diagonal">
                <div class="section-inner">
                    <h2 class="section-heading animate-in flex-row">
                        <svg xmlns="http://www.w3.org/2000/svg" class="header-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M9.599 3.495C9.908 2.655 10.646 2 11.616 2s1.709.654 2.018 1.495a2 2 0 0 1 .834-.177c1.293 0 2.176 1.164 2.176 2.382v.437a2 2 0 0 1 .676-.114c1.293 0 2.176 1.165 2.176 2.382v5.705c.018.709.021 2.63-.828 4.4c-.433.904-1.095 1.784-2.098 2.436c-1.005.654-2.304 1.047-3.96 1.054h-.003c-1.814 0-3.424-.886-4.6-1.784a14 14 0 0 1-2.3-2.241a4 4 0 0 0-.16-.19L3.202 15.23l-.012-.013c-.804-.92-.804-2.375 0-3.295c.85-.973 2.273-.979 3.13-.018l.27.275v-6.48c0-1.217.882-2.381 2.175-2.381c.303 0 .583.064.835.177m-.16 2.198c-.003-.58-.395-.875-.676-.875s-.676.297-.676.882v8.315a.75.75 0 0 1-1.285.525l-1.568-1.6l-.03-.03c-.258-.296-.629-.296-.887 0c-.308.352-.31.958-.005 1.314l2.34 2.547q.125.138.225.266a12.4 12.4 0 0 0 2.04 1.986c1.064.813 2.352 1.477 3.688 1.477c1.413-.006 2.42-.339 3.146-.811c.729-.474 1.225-1.12 1.563-1.827c.69-1.439.698-3.062.68-3.723V8.405c0-.585-.394-.882-.675-.882s-.676.297-.676.882v2.825a.75.75 0 1 1-1.5 0V5.7c0-.585-.395-.882-.676-.882s-.676.297-.676.882v5.53a.75.75 0 1 1-1.5 0V4.382c0-.585-.394-.882-.676-.882c-.281 0-.676.297-.676.882v6.66a.75.75 0 0 1-1.5 0z"/></svg>
                        <span>No more <span class="hl">scattered</span> definitions</span>
                    </h2>
                    <div class="comparison-grid animate-in">
                        <div class="comparison-col">
                            <div class="code-label muted-label">Before <span class="file-count">3 files</span></div>
                            <div class="code-block">
                                <SnippetScattered />
                            </div>
                        </div>
                        <div class="comparison-arrow">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M5 12h14M13 5l7 7-7 7" />
                            </svg>
                        </div>
                        <div class="comparison-col">
                            <div class="code-label brand-label">After <span class="file-count">1 file</span></div>
                            <div class="code-block brand-block">
                                <SnippetUnified />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Section 1: Define your data -->
            <section class="section-define">
                <div class="section-inner">
                    <h2 class="section-heading animate-in flex-row">
                        <svg xmlns="http://www.w3.org/2000/svg" class="header-icon" viewBox="0 0 24 24"><g fill="none"><path stroke="currentColor" stroke-linejoin="round" stroke-width="1.5" d="m16.692 9.803l1.791-1.792a1.764 1.764 0 0 0-2.494-2.494l-1.792 1.791m2.495 2.495l-10.68 10.68a1.764 1.764 0 0 1-2.495-2.494l10.68-10.68m2.495 2.494l-2.495-2.495m3.777 6.714a.026.026 0 0 1 .052 0a3.79 3.79 0 0 0 2.953 2.952c.028.006.028.046 0 .052a3.79 3.79 0 0 0-2.953 2.953c-.006.028-.046.028-.052 0a3.79 3.79 0 0 0-2.953-2.953c-.028-.006-.028-.046 0-.052a3.79 3.79 0 0 0 2.953-2.953Z"/><path fill="currentColor" d="M8.12 3.31c.085-.413.675-.413.76 0a2.32 2.32 0 0 0 1.81 1.81c.413.085.413.675 0 .76a2.32 2.32 0 0 0-1.81 1.81c-.085.413-.675.413-.76 0a2.32 2.32 0 0 0-1.81-1.81c-.413-.085-.413-.675 0-.76a2.32 2.32 0 0 0 1.81-1.81"/></g></svg>
                        <span>Define your <span class="hl">data</span> once</span>
                    </h2>
                    <div class="define-grid animate-in">
                        <div class="define-code">
                            <div class="code-label brand-label as-label">
                                <img src="/logo.svg" alt="Atscript" class="as-file" />
                                user.as
                            </div>
                            <div class="code-block brand-block">
                                <SnippetDefine />
                            </div>
                        </div>
                        <DefineCarousel />
                    </div>
                </div>
            </section>

            <!-- Section 2: Generate your data-assets -->
            <section class="section-generate bg-diagonal">
                <div class="section-inner">
                    <h2 class="section-heading animate-in flex-row">
                        <svg xmlns="http://www.w3.org/2000/svg" class="header-icon" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101m-.758-4.899a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.1 1.1"/></svg>
                        <span>Link your <span class="hl">assets</span> to your model</span>
                    </h2>
                    <div class="animate-in">
                        <AssetsCarousel />
                    </div>
                    <div class="generate-cta animate-in">
                        <VPButton tag="a" size="medium" theme="brand" text="Get Started" href="/packages/typescript/quick-start" />
                    </div>
                </div>
            </section>

        </template>
    </Layout>
</template>

<style scoped>
/* ---- Layout ---- */
.section-inner { max-width: 1152px; margin: 0 auto; }
.section-heading { font-size: 26px; font-weight: 700; color: var(--vp-c-text-1); margin-bottom: 24px; }
@media (min-width: 640px) { .section-heading { font-size: 30px; } }
.hl { color: var(--vp-c-brand-1); }
.bg-diagonal { position: relative; }
.bg-diagonal::before {
    content: ''; position: absolute; inset: 0; z-index: -1;
    background: var(--vp-c-bg-soft);
    clip-path: polygon(0 40px, 100% 0, 100% 100%, 0 calc(100% - 40px));
}

/* ---- Hero ---- */
.custom-hero {
    position: relative; overflow: hidden;
    margin-top: calc((var(--vp-nav-height) + var(--vp-layout-top-height, 0px)) * -1);
    padding: calc(var(--vp-nav-height) + var(--vp-layout-top-height, 0px) + 48px) 24px 48px;
}
@media (min-width: 640px) { .custom-hero { padding: calc(var(--vp-nav-height) + var(--vp-layout-top-height, 0px) + 64px) 48px 64px; } }
@media (min-width: 960px) { .custom-hero { padding: calc(var(--vp-nav-height) + var(--vp-layout-top-height, 0px) + 64px) 64px 64px; } }
.hero-inner { max-width: 1152px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; text-align: center; }
@media (min-width: 960px) { .hero-inner { flex-direction: row; text-align: left; } }
.hero-main { position: relative; z-index: 10; order: 2; flex-grow: 1; flex-shrink: 0; }
@media (min-width: 960px) { .hero-main { order: 1; width: calc((100% / 3) * 2); max-width: 592px; } }
.hero-image { order: 1; margin: -76px -24px -48px; }
@media (min-width: 640px) { .hero-image { margin: -108px -24px -48px; } }
@media (min-width: 960px) { .hero-image { flex-grow: 1; order: 2; margin: 0; min-height: 100%; } }
.image-container { position: relative; margin: 0 auto; width: 320px; height: 320px; }
@media (min-width: 640px) { .image-container { width: 392px; height: 392px; } }
@media (min-width: 960px) { .image-container { display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; transform: translate(-32px, -32px); } }
.image-src {
    position: absolute; top: 50%; left: 50%; max-width: 192px; transform: translate(-50%, -50%);
    filter: drop-shadow(0 0 40px rgba(71,26,236,0.35)) drop-shadow(0 0 80px rgba(71,26,236,0.25)) drop-shadow(0 0 120px rgba(71,26,236,0.15));
}
:global(.dark) .image-src { filter: drop-shadow(0 0 40px rgba(174,153,252,0.5)) drop-shadow(0 0 80px rgba(174,153,252,0.35)) drop-shadow(0 0 140px rgba(174,153,252,0.2)); }
@media (min-width: 640px) { .image-src { max-width: 256px; } }
@media (min-width: 960px) { .image-src { max-width: 320px; } }
.hero-name { font-size: 84px; font-weight: 600; letter-spacing: -1px; line-height: 1.1; color: var(--vp-c-brand-1); margin-bottom: 8px; }
@media (min-width: 640px) { .hero-name { font-size: 56px; } }
@media (min-width: 960px) { .hero-name { font-size: 84px; } }
.hero-text { font-size: 20px; font-weight: 700; color: var(--vp-c-text-1); line-height: 1.3; max-width: 600px; margin: 0 auto 8px; }
@media (min-width: 640px) { .hero-text { font-size: 32px; } }
@media (min-width: 960px) { .hero-text { font-size: 36px; margin: 0 0 8px; } }
.hero-tagline { font-size: 16px; font-weight: 500; color: var(--vp-c-text-2); max-width: 520px; margin: 0 auto; line-height: 1.5; }
@media (min-width: 640px) { .hero-tagline { font-size: 20px; } }
@media (min-width: 960px) { .hero-tagline { margin: 0; } }
.actions { display: flex; flex-wrap: wrap; justify-content: center; margin: -6px; padding-top: 28px; }
@media (min-width: 960px) { .actions { justify-content: flex-start; } }
.action { flex-shrink: 0; padding: 6px; }

/* ---- Section 1: Define ---- */
.section-define { padding: 72px 24px 64px; }
@media (min-width: 640px) { .section-define { padding: 80px 48px 72px; } }
@media (min-width: 960px) { .section-define { padding: 80px 64px 72px; } }
.define-grid { display: grid; grid-template-columns: 1fr; gap: 24px; align-items: center; }
@media (min-width: 768px) { .define-grid { grid-template-columns: 1fr 1fr; gap: 32px; } }
.define-code { min-width: 0; }

/* ---- Section 2: Generate ---- */
.section-generate { padding: 48px 24px; }
@media (min-width: 640px) { .section-generate { padding: 64px 48px; } }
@media (min-width: 960px) { .section-generate { padding: 64px 64px; } }
.generate-cta { display: flex; gap: 12px; justify-content: center; margin-top: 32px; }

/* ---- Section 4: Comparison ---- */
.section-compare { padding: 48px 24px 64px; }
@media (min-width: 640px) { .section-compare { padding: 64px 48px 80px; } }
@media (min-width: 960px) { .section-compare { padding: 64px 64px 80px; } }
.comparison-grid { display: grid; grid-template-columns: 1fr; gap: 8px; align-items: center; min-width: 0; }
.comparison-col { min-width: 0; }
.comparison-arrow { display: flex; justify-content: center; color: var(--vp-c-text-3); }
.comparison-arrow svg { transform: rotate(90deg); }
@media (min-width: 768px) {
    .comparison-grid { grid-template-columns: 1fr auto 1fr; gap: 16px; }
    .comparison-arrow svg { transform: rotate(0deg); }
}
.header-icon {
    width: 36px; height: 36px;
}
.flex-row {
    display: flex;
    gap: 0.5em;
    align-items: center;
}
.as-file {
    width: 24px; height: 24px;
}
.as-label {
    display: flex;
    gap: 0.5em;
}

/* ---- Shared code block styles ---- */
.code-label {
    padding: 8px 16px; font-size: 13px; font-weight: 600;
    letter-spacing: 0.5px; text-transform: none; border-radius: 12px 12px 0 0;
}
.muted-label { background: rgba(128,128,128,0.1); color: var(--vp-c-text-2); }
.brand-label { background: rgba(71,26,236,0.12); color: var(--vp-c-brand-1); }
:global(.dark) .brand-label { background: rgba(174,153,252,0.12); }
.file-count { font-weight: 400; font-size: 12px; opacity: 0.7; margin-left: 4px; }
.code-block {
    border-radius: 0 0 12px 12px; overflow: hidden;
    border: 1px solid var(--vp-c-divider); border-top: none; background: var(--vp-c-bg);
}
:global(.dark) .code-block { border-color: rgba(255,255,255,0.06); }
.brand-block {
    box-shadow: 0 0 40px rgba(71,26,236,0.15), 0 0 80px rgba(71,26,236,0.08);
    border-color: rgba(71,26,236,0.25);
}
:global(.dark) .brand-block {
    box-shadow: 0 0 40px rgba(174,153,252,0.2), 0 0 80px rgba(174,153,252,0.1);
    border-color: rgba(174,153,252,0.3);
}
.code-block :deep(div[class*="language-"]) { margin: 0 !important; border-radius: 0; background: var(--vp-c-bg) !important; }
.code-block :deep(button.copy), .code-block :deep(span.lang), .code-block :deep(.line-numbers-wrapper) { display: none !important; }
.code-block :deep(pre) { padding: 0 !important; margin: 0 !important; overflow-x: auto; }
.code-block :deep(code) { display: block; width: fit-content; min-width: 100%; padding: 8px 20px; font-size: 13px; }
.code-block :deep(.file-sep) {
    padding: 4px 16px; font-size: 12px; font-family: var(--vp-font-family-mono);
    color: var(--vp-c-text-2); background: var(--vp-c-bg-alt); border-top: 1px solid var(--vp-c-divider);
}
:global(.dark) .code-block :deep(.file-sep) { border-top-color: rgba(255,255,255,0.06); }
.code-block :deep(.file-sep:first-child) { border-top: none; }


/* ---- Section 5: Features ---- */
.section-features { padding: 0 24px 48px; }
@media (min-width: 640px) { .section-features { padding: 0 48px 64px; } }
@media (min-width: 960px) { .section-features { padding: 0 64px 64px; } }
.features-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
@media (min-width: 640px) { .features-grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 960px) { .features-grid { grid-template-columns: repeat(3, 1fr); } }
.feature-card {
    padding: 24px; border-radius: 14px; background: var(--vp-c-bg);
    border: 1px solid var(--vp-c-divider); text-decoration: none; color: inherit;
    transition: border-color 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease;
}
.feature-card:hover { border-color: var(--vp-c-brand-1); transform: translateY(-2px); box-shadow: 0 4px 16px rgba(71,26,236,0.1); }
:global(.dark) .feature-card:hover { box-shadow: 0 4px 16px rgba(174,153,252,0.12); }
.feature-icon {
    width: 36px; height: 36px; padding: 6px; border-radius: 10px;
    background: rgba(71,26,236,0.1); color: var(--vp-c-brand-1); margin-bottom: 12px;
}
:global(.dark) .feature-icon { background: rgba(174,153,252,0.12); }
.feature-icon svg { width: 100%; height: 100%; }
.feature-title { font-size: 16px; font-weight: 600; color: var(--vp-c-text-1); margin-bottom: 6px; }
.feature-desc { font-size: 14px; color: var(--vp-c-text-2); line-height: 1.5; margin: 0; }
.feature-desc code {
    font-size: 13px; color: var(--vp-c-brand-1);
    background: rgba(71,26,236,0.08); padding: 1px 5px; border-radius: 4px;
    font-family: var(--vp-font-family-mono);
}
:global(.dark) .feature-desc code { background: rgba(174,153,252,0.12); }

/* ---- Scroll Animations ---- */
.animate-in { opacity: 0; transform: translateY(24px); transition: opacity 0.6s ease, transform 0.6s ease; }
.animate-in.visible { opacity: 1; transform: translateY(0); }
</style>
