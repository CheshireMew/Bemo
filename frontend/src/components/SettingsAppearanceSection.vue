<template>
  <div class="settings-section">
    <div class="section-header">
      <div>
        <h3>外观主题</h3>
        <p>选择您喜欢的界面首选项，系统支持独立切换明暗模式和主题色系。</p>
      </div>
    </div>

    <!-- 深浅模式设置 -->
    <article class="settings-card form-card">
      <div class="field-row">
        <div class="field-row-text">
          <span class="field-label">深色模式</span>
          <p class="field-hint">手动开启或关闭全局黑夜模式。顶部导航栏也可快捷切换该状态。</p>
        </div>
        <div class="toggle-switch-wrapper">
          <label class="switch">
            <input type="checkbox" :checked="isDarkMode" @change="toggleTheme">
            <span class="toggle-switch-slider"></span>
          </label>
        </div>
      </div>
    </article>

    <article class="settings-card">
      <h4>主题风格</h4>
      <p>选择全局高亮颜色及背景色相的风格色板。</p>
      <div class="theme-grid">
        <!-- 默认 -->
        <button 
          class="theme-card" 
          :class="{ active: currentSkin === 'default' }" 
          @click="setSkin('default')"
        >
          <div class="theme-preview preview-light">
            <div class="preview-sidebar"></div>
            <div class="preview-content">
              <div class="preview-card"></div>
              <div class="preview-card"></div>
            </div>
          </div>
          <span>经典配色 (Bemo)</span>
        </button>

        <!-- 极地冰川 -->
        <button 
          class="theme-card" 
          :class="{ active: currentSkin === 'nord' }" 
          @click="setSkin('nord')"
        >
          <div class="theme-preview preview-nord">
            <div class="preview-sidebar"></div>
            <div class="preview-content">
              <div class="preview-card"></div>
              <div class="preview-card"></div>
            </div>
          </div>
          <span>极区冰川 (Nord)</span>
        </button>

        <!-- 书卷拿铁 -->
        <button 
          class="theme-card" 
          :class="{ active: currentSkin === 'sepia' }" 
          @click="setSkin('sepia')"
        >
          <div class="theme-preview preview-sepia">
            <div class="preview-sidebar"></div>
            <div class="preview-content">
              <div class="preview-card"></div>
              <div class="preview-card"></div>
            </div>
          </div>
          <span>书卷拿铁 (Sepia)</span>
        </button>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { currentSkin, setSkin, isDarkMode, toggleTheme } from '../store/ui';
</script>

<style scoped>
.field-row-text {
  display: flex;
  flex-direction: column;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  margin-top: 14px;
}

.theme-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  background: transparent;
  border: 2px solid transparent;
  border-radius: 14px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  outline: none;
}

.theme-card:hover {
  background: color-mix(in srgb, var(--border-color, #e4e4e7) 50%, transparent);
}

.theme-card.active {
  background: color-mix(in srgb, var(--accent-color, #31d279) 8%, transparent);
  border-color: var(--accent-color, #31d279);
}

.theme-preview {
  width: 100%;
  aspect-ratio: 16 / 10;
  border-radius: 10px;
  border: 1px solid var(--border-color, #e4e4e7);
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  display: flex;
  overflow: hidden;
  padding: 0;
}

.preview-sidebar {
  width: 25%;
  height: 100%;
}
.preview-content {
  flex: 1;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.preview-card {
  height: 12px;
  border-radius: 4px;
}
.preview-card:first-child { height: 24px; }

/* Previews */
.preview-light { background: #f4f5f7; border-color: #e4e4e7; }
.preview-light .preview-sidebar { background: #ffffff; }
.preview-light .preview-card { background: #ffffff; border: 1px solid #eaeaea; }
.preview-light .preview-content::before { content: ""; display: block; width: 40%; height: 6px; border-radius: 3px; background: #31d279; margin-bottom: 2px;}

.preview-nord { background: #ECEFF4; border-color: #D8DEE9;}
.preview-nord .preview-sidebar { background: #E5E9F0; }
.preview-nord .preview-card { background: #ffffff; border: 1px solid #D8DEE9; }
.preview-nord .preview-content::before { content: ""; display: block; width: 40%; height: 6px; border-radius: 3px; background: #5E81AC; margin-bottom: 2px;}

.preview-sepia { background: #F4F0EB; border-color: #D5C8B4;}
.preview-sepia .preview-sidebar { background: #EBE5DB; }
.preview-sepia .preview-card { background: #FDFAF5; border: 1px solid #D5C8B4; }
.preview-sepia .preview-content::before { content: ""; display: block; width: 40%; height: 6px; border-radius: 3px; background: #A0522D; margin-bottom: 2px;}

.theme-card span {
  font-weight: 500;
  color: var(--text-primary);
  font-size: 0.95rem;
}

@media (max-width: 600px) {
  .theme-grid {
    grid-template-columns: 1fr;
  }
}
</style>
