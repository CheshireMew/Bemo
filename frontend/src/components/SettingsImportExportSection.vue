<template>
  <section class="settings-section">
    <div class="section-header">
      <div>
        <h3>导入导出</h3>
        <p>把侧边栏里的备份与迁移操作集中到这里。</p>
      </div>
      <span v-if="isImporting" class="section-badge">处理中...</span>
    </div>

    <div class="card-grid two-up">
      <article class="settings-card">
        <h4>完整备份</h4>
        <p>导出全部笔记、回收站及引用的附件，用于数据备份或跨设备无损迁移。</p>
        <div class="button-row">
          <button type="button" class="primary-btn" @click="exportBackup">导出完整备份 ZIP</button>
        </div>
      </article>

      <article class="settings-card">
        <h4>完整恢复</h4>
        <p v-if="remoteAppData">从备份替换后端主存储中的笔记、回收站和附件；使用同一后端的其他设备也会受到影响。</p>
        <p v-else>从备份替换此设备上的笔记、回收站和附件，并重置同步历史与基线状态。</p>
        <div class="button-row">
          <button type="button" class="primary-btn" @click="triggerZipImport">导入完整备份 ZIP / JSON</button>
        </div>
      </article>

      <article class="settings-card">
        <h4>Markdown 归档</h4>
        <p>导出通用 Markdown 归档；导入时会按“完整恢复”的范围替换当前数据，并恢复引用附件。</p>
        <div class="button-row">
          <button type="button" class="secondary-btn" @click="exportMarkdownArchive">导出归档包</button>
          <button type="button" class="secondary-btn" @click="triggerMarkdownArchiveImport">导入归档包</button>
        </div>
      </article>

      <article class="settings-card">
        <h4>兼容格式</h4>
        <p>快捷导入 Flomo 标准备份（ZIP / HTML 等），或导出纯文本 CSV 数据。</p>
        <div class="button-row">
          <button type="button" class="secondary-btn" @click="exportFlomo">导出为 CSV</button>
          <button type="button" class="secondary-btn" @click="triggerFlomoImport">从 Flomo 导入</button>
        </div>
      </article>

      <article v-if="canRestoreSyncDirectory" class="settings-card">
        <h4>坚果云同步目录</h4>
        <p>选择坚果云里的 `bemo-sync` 同步目录，读取其中最新同步快照，再覆盖恢复到当前本机数据库。</p>
        <div class="button-row">
          <button type="button" class="secondary-btn" @click="triggerSyncDirectoryImport">选择同步目录并恢复</button>
        </div>
      </article>
      <article class="settings-card danger-card">
        <h4>清空工作区</h4>
        <p v-if="remoteAppData">删除后端主存储中的全部笔记、回收站、附件和同步残留，并清理本机缓存；使用同一后端的设备都会受到影响，界面设置会保留。</p>
        <p v-else>删除此设备上的全部笔记、回收站、附件和同步记录，界面设置会保留。</p>
        <div class="button-row">
          <button type="button" class="danger-btn" @click="clearAllExperimentData">删除全部记录</button>
        </div>
      </article>

      <article class="settings-card danger-card">
        <h4>深度重置</h4>
        <p v-if="remoteAppData">只重置当前设备的缓存、同步配置、主题和本地设置；后端主存储中的笔记和附件不会删除。</p>
        <p v-else>删除此设备上的笔记、回收站、附件、同步配置和本地设置，恢复到首次安装状态。</p>
        <div class="button-row">
          <button type="button" class="danger-btn subtle-danger-btn" @click="resetToFirstInstallState">回到初始安装状态</button>
        </div>
      </article>
    </div>
    <input type="file" ref="backupFileInput" accept=".zip,.json" hidden @change="handleZipImport" />
    <input type="file" ref="markdownArchiveFileInput" accept=".zip" hidden @change="handleMarkdownArchiveImport" />
    <input type="file" ref="flomoFileInput" accept=".zip,.csv,.txt,.html" hidden @change="handleFlomoImport" />
    <input v-if="canRestoreSyncDirectory" type="file" ref="syncDirectoryInput" hidden multiple webkitdirectory directory @change="handleSyncDirectoryImport" />
  </section>
</template>

<script setup lang="ts">
import { useImportExport } from '../composables/useImportExport';
import { canRestoreFromSyncDirectory } from '../domain/runtime/platformCapabilities.js';
import { usesRemoteAppData } from '../domain/appStore/dataAdapter.js';

const emit = defineEmits<{
  imported: [];
}>();

const canRestoreSyncDirectory = canRestoreFromSyncDirectory();
const remoteAppData = usesRemoteAppData();

const {
  isImporting,
  flomoFileInput,
  backupFileInput,
  markdownArchiveFileInput,
  syncDirectoryInput,
  exportBackup,
  exportMarkdownArchive,
  exportFlomo,
  triggerZipImport,
  handleZipImport,
  triggerFlomoImport,
  handleFlomoImport,
  triggerMarkdownArchiveImport,
  handleMarkdownArchiveImport,
  triggerSyncDirectoryImport,
  handleSyncDirectoryImport,
  clearAllExperimentData,
  resetToFirstInstallState,
} = useImportExport(() => {
  emit('imported');
});

void flomoFileInput;
void backupFileInput;
void markdownArchiveFileInput;
void syncDirectoryInput;
</script>

<style scoped>
/* Scoped styles are handled by global settings.css */
</style>
