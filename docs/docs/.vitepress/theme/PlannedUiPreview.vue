<script setup>
import Carousel from './Carousel.vue'

const slides = [
  { label: 'Form', title: '<AsForm />', chip: '@atscript/vue-form' },
  { label: 'Table', title: '<AsTable />', chip: '@atscript/vue-table' },
  { label: 'Workflow', title: '<AsWfForm />', chip: '@atscript/vue-wf' },
]
</script>

<template>
  <div class="planned-ui">
    <div class="planned-model">user.as → ui</div>

    <Carousel :count="slides.length" :labels="slides.map(s => s.label)" :interval="4200">
      <template #default="{ index }">
        <div class="planned-card">
          <div class="planned-card-meta">
            <div class="planned-card-head">{{ slides[index].title }}</div>
            <div class="planned-card-chip">{{ slides[index].chip }}</div>
          </div>

          <div v-if="index === 0" class="planned-form">
            <div class="planned-field">
              <span class="planned-label">Full Name <span class="planned-req">*</span></span>
              <div class="planned-input wide" />
            </div>
            <div class="planned-field">
              <span class="planned-label">Email</span>
              <div class="planned-input wide" />
            </div>
            <div class="planned-field">
              <span class="planned-label">Role</span>
              <div class="planned-input short" />
            </div>
            <div class="planned-field">
              <span class="planned-label">Bio</span>
              <div class="planned-input tall" />
            </div>
            <div class="planned-button">Submit</div>
          </div>

          <div v-else-if="index === 1" class="planned-table">
            <div class="planned-row planned-row-head">
              <span>Name</span>
              <span>Email</span>
              <span>Role</span>
            </div>
            <div class="planned-row">
              <span class="cell-fill med" />
              <span class="cell-fill long" />
              <span class="cell-badge cell-badge-ok">admin</span>
            </div>
            <div class="planned-row">
              <span class="cell-fill short" />
              <span class="cell-fill med" />
              <span class="cell-badge">user</span>
            </div>
            <div class="planned-row">
              <span class="cell-fill med" />
              <span class="cell-fill long" />
              <span class="cell-badge cell-badge-ok">admin</span>
            </div>
            <div class="planned-row">
              <span class="cell-fill med" />
              <span class="cell-fill med" />
              <span class="cell-badge">user</span>
            </div>
            <div class="planned-row">
              <span class="cell-fill short" />
              <span class="cell-fill long" />
              <span class="cell-badge cell-badge-warn">draft</span>
            </div>
          </div>

          <div v-else class="planned-wf">
            <div class="wf-stepper">
              <div class="wf-step wf-step-done">
                <span class="wf-step-dot">✓</span>
                <span class="wf-step-label">Email</span>
              </div>
              <span class="wf-line wf-line-done" />
              <div class="wf-step wf-step-active">
                <span class="wf-step-dot">2</span>
                <span class="wf-step-label">Verify</span>
              </div>
              <span class="wf-line" />
              <div class="wf-step">
                <span class="wf-step-dot">3</span>
                <span class="wf-step-label">Done</span>
              </div>
            </div>
            <div class="wf-server-note">↶ server decides next</div>
            <div class="wf-screen">
              <div class="wf-screen-title">Step 2 · Verify email</div>
              <div class="planned-field">
                <span class="planned-label">6-digit code</span>
                <div class="planned-input wide" />
              </div>
              <div class="planned-button">Continue</div>
            </div>
          </div>
        </div>
      </template>
    </Carousel>
  </div>
</template>

<style scoped>
.planned-ui {
  width: 100%;
  max-width: 460px;
}

.planned-ui :deep(.carousel) {
  gap: 12px;
}

.planned-ui :deep(.carousel-dots) {
  justify-content: flex-start;
}

.planned-model {
  display: inline-flex;
  align-items: center;
  margin-bottom: 14px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(71, 26, 236, 0.12);
  color: var(--vp-c-brand-1);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  font-family: var(--vp-font-family-mono);
}

.planned-card {
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(71, 26, 236, 0.16);
  background: var(--vp-c-bg);
  box-shadow: 0 10px 24px rgba(71, 26, 236, 0.08);
  height: 420px;
}

:global(.dark) .planned-card {
  border-color: rgba(174, 153, 252, 0.22);
  box-shadow: 0 10px 24px rgba(174, 153, 252, 0.08);
}

.planned-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.planned-card-head {
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  font-weight: 700;
  color: var(--vp-c-brand-1);
}

.planned-card-chip {
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(43, 170, 196, 0.12);
  color: #127791;
  font-family: var(--vp-font-family-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

:global(.dark) .planned-card-chip {
  background: rgba(43, 170, 196, 0.2);
  color: #7ddff2;
}

.planned-field {
  display: grid;
  gap: 6px;
  margin-bottom: 10px;
}

.planned-label {
  font-size: 12px;
  color: var(--vp-c-text-2);
}

.planned-req {
  color: #e53e3e;
}

.planned-input {
  height: 28px;
  border-radius: 8px;
  background: linear-gradient(90deg, rgba(71, 26, 236, 0.14), rgba(43, 170, 196, 0.14));
}

.planned-input.wide {
  width: 100%;
}
.planned-input.short {
  width: 62%;
}
.planned-input.tall {
  width: 100%;
  height: 54px;
}

.planned-button {
  margin-top: 8px;
  width: 88px;
  padding: 8px 0;
  border-radius: 8px;
  background: var(--vp-c-brand-1);
  color: white;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
}

/* Table */

.planned-row {
  display: grid;
  grid-template-columns: 1fr 1.35fr 0.7fr;
  gap: 8px;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid var(--vp-c-divider);
}

.planned-row-head {
  padding-top: 0;
  border-top: none;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--vp-c-text-2);
}

.cell-fill {
  display: block;
  height: 8px;
  border-radius: 999px;
  background: rgba(71, 26, 236, 0.14);
}

:global(.dark) .cell-fill {
  background: rgba(174, 153, 252, 0.16);
}

.cell-fill.short {
  width: 70%;
}
.cell-fill.med {
  width: 85%;
}
.cell-fill.long {
  width: 100%;
}

.cell-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(128, 128, 128, 0.1);
  color: var(--vp-c-text-2);
  font-size: 10px;
  font-weight: 700;
  font-family: var(--vp-font-family-mono);
  text-align: center;
}

.cell-badge-ok {
  background: rgba(24, 166, 116, 0.15);
  color: #18a674;
}

.cell-badge-warn {
  background: rgba(217, 119, 6, 0.15);
  color: #d97706;
}

/* Workflow */

.planned-wf {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.wf-stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0;
  padding: 4px 4px 18px;
}

.wf-step {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  z-index: 1;
}

.wf-step-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  font-weight: 700;
  background: var(--vp-c-bg-alt);
  border: 2px solid var(--vp-c-divider);
  color: var(--vp-c-text-3);
}

.wf-step-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

.wf-step-done .wf-step-dot {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  color: #fff;
}

.wf-step-done .wf-step-label {
  color: var(--vp-c-text-1);
}

.wf-step-active .wf-step-dot {
  background: var(--vp-c-bg);
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 4px rgba(71, 26, 236, 0.15);
}

:global(.dark) .wf-step-active .wf-step-dot {
  box-shadow: 0 0 0 4px rgba(174, 153, 252, 0.2);
}

.wf-step-active .wf-step-label {
  color: var(--vp-c-brand-1);
  font-weight: 700;
}

.wf-line {
  flex: 1;
  height: 2px;
  background: var(--vp-c-divider);
  margin: 0 -4px 22px;
}

.wf-line-done {
  background: var(--vp-c-brand-1);
}

.wf-server-note {
  font-family: var(--vp-font-family-mono);
  font-size: 10px;
  color: var(--vp-c-text-3);
  text-align: center;
  margin-top: -4px;
}

.wf-screen {
  padding: 14px;
  border-radius: 10px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-alt);
}

:global(.dark) .wf-screen {
  border-color: rgba(255, 255, 255, 0.06);
}

.wf-screen-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--vp-c-brand-1);
  margin-bottom: 10px;
}
</style>
