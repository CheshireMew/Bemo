import { onMounted, ref } from 'vue';
import {
  cleanupOrphanedAttachments,
  readAttachmentSummary,
} from '../domain/appStore/attachmentsAdapter.js';
import {
  getClearCurrentDataPrompt,
  getClearCurrentDataSuccessMessage,
} from '../domain/appStore/dataAdapter.js';
import {
  clearCurrentWorkspaceData,
  exportBackupArchive,
  exportMarkdownArchive,
  importBackupFromSyncDirectory,
  importBackupArchive,
  importMarkdownArchiveZip,
  resetCurrentInstallState,
} from '../domain/importExport/importExportCommands';
import {
  pickNativeImportFile,
  shouldUseAndroidNativeImportPicker,
} from '../domain/importExport/fileImportPicker.js';
import { exportFlomoCsv, importFlomoArchive } from '../domain/importExport/flomoImportExport.js';
import { pushNotification } from '../store/notifications';
import { requestSyncNow } from '../domain/sync/syncCoordinator.js';

export function useImportExport(onSuccess?: () => void) {
  const nutstoreSyncPath = 'C:\\Users\\Dylan\\Nutstore\\1\\bemo-sync';
  const isImporting = ref(false);
  const isCleaningOrphans = ref(false);
  const attachmentSummary = ref({
    activeAttachments: 0,
    trashAttachments: 0,
    draftAttachments: 0,
    totalReferencedAttachments: 0,
    totalAttachmentRefs: 0,
    storedAttachments: 0,
    storedDraftAttachments: 0,
    unreferencedStoredAttachments: 0,
  });
  const flomoFileInput = ref<HTMLInputElement | null>(null);
  const backupFileInput = ref<HTMLInputElement | null>(null);
  const markdownArchiveFileInput = ref<HTMLInputElement | null>(null);

  const refreshAttachmentSummary = async () => {
    try {
      attachmentSummary.value = await readAttachmentSummary();
    } catch (error) {
      console.error('Failed to load attachment reference summary', error);
    }
  };

  onMounted(() => {
    void refreshAttachmentSummary();
  });

  const isImportCancelled = (error: unknown) => {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return message.includes('pickfiles canceled')
      || message.includes('pickdirectory canceled')
      || message.includes('cancel')
      || message.includes('canceled');
  };

  const exportBackup = async () => {
    try {
      await exportBackupArchive();
    } catch (e: any) {
      console.error(e);
      pushNotification('导出失败: ' + (e.response?.data?.detail || e.message), 'error');
    }
  };

  const exportFlomo = async () => {
    try {
      await exportFlomoCsv();
    } catch (e: any) {
      console.error(e);
      pushNotification('导出失败: ' + (e.response?.data?.detail || e.message), 'error');
    }
  };

  const exportMarkdownArchiveFile = async () => {
    try {
      await exportMarkdownArchive();
    } catch (e: any) {
      console.error(e);
      pushNotification('导出失败: ' + (e.response?.data?.detail || e.message), 'error');
    }
  };

  const runBackupImport = async (file: File) => {
    isImporting.value = true;
    try {
      const res = await importBackupArchive(file);
      pushNotification(`完整备份已恢复，导入了 ${res.imported_notes} 条笔记和 ${res.imported_images} 个媒体文件。`, 'success');
      await refreshAttachmentSummary();
      if (onSuccess) onSuccess();
    } catch (e: any) {
      console.error(e);
      pushNotification('导入失败: ' + (e.response?.data?.detail || e.message), 'error');
    } finally {
      isImporting.value = false;
    }
  };

  const runFlomoImport = async (file: File) => {
    isImporting.value = true;
    try {
      const res = await importFlomoArchive(file);
      if (res.sync_queued) {
        requestSyncNow();
      }
      const attachmentSuffix = res.imported_attachment_count
        ? `，并导入了 ${res.imported_attachment_count} 个附件`
        : '';
      pushNotification(`导入成功，共导入了 ${res.imported_count} 条笔记${attachmentSuffix}。`, 'success');
      await refreshAttachmentSummary();
      if (onSuccess) onSuccess();
    } catch (e: any) {
      console.error(e);
      pushNotification('导入失败: ' + (e.response?.data?.detail || e.message), 'error');
    } finally {
      isImporting.value = false;
    }
  };

  const runMarkdownArchiveImport = async (file: File) => {
    isImporting.value = true;
    try {
      const res = await importMarkdownArchiveZip(file);
      pushNotification(`Markdown 归档已恢复，导入了 ${res.imported_notes} 条笔记和 ${res.imported_images} 个附件。`, 'success');
      await refreshAttachmentSummary();
      if (onSuccess) onSuccess();
    } catch (e: any) {
      console.error(e);
      pushNotification('导入失败: ' + (e.response?.data?.detail || e.message), 'error');
    } finally {
      isImporting.value = false;
    }
  };

  const triggerZipImport = async () => {
    if (isImporting.value) return;
    if (!shouldUseAndroidNativeImportPicker()) {
      backupFileInput.value?.click();
      return;
    }
    try {
      const file = await pickNativeImportFile('backup');
      if (!file) return;
      await runBackupImport(file);
    } catch (e: any) {
      if (isImportCancelled(e)) return;
      console.error(e);
      pushNotification('导入失败: ' + (e.response?.data?.detail || e.message), 'error');
    }
  };

  const handleZipImport = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    try {
      await runBackupImport(file);
    } finally {
      if (backupFileInput.value) backupFileInput.value.value = '';
    }
  };

  const triggerFlomoImport = async () => {
    if (isImporting.value) return;
    if (!shouldUseAndroidNativeImportPicker()) {
      flomoFileInput.value?.click();
      return;
    }
    try {
      const file = await pickNativeImportFile('flomo');
      if (!file) return;
      await runFlomoImport(file);
    } catch (e: any) {
      if (isImportCancelled(e)) return;
      console.error(e);
      pushNotification('导入失败: ' + (e.response?.data?.detail || e.message), 'error');
    }
  };

  const handleFlomoImport = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    try {
      await runFlomoImport(file);
    } finally {
      if (flomoFileInput.value) flomoFileInput.value.value = '';
    }
  };

  const triggerMarkdownArchiveImport = async () => {
    if (isImporting.value) return;
    if (!shouldUseAndroidNativeImportPicker()) {
      markdownArchiveFileInput.value?.click();
      return;
    }
    try {
      const file = await pickNativeImportFile('markdown-archive');
      if (!file) return;
      await runMarkdownArchiveImport(file);
    } catch (e: any) {
      if (isImportCancelled(e)) return;
      console.error(e);
      pushNotification('导入失败: ' + (e.response?.data?.detail || e.message), 'error');
    }
  };

  const handleMarkdownArchiveImport = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    try {
      await runMarkdownArchiveImport(file);
    } finally {
      if (markdownArchiveFileInput.value) markdownArchiveFileInput.value.value = '';
    }
  };

  const importNutstoreSyncBackup = async () => {
    if (isImporting.value || isCleaningOrphans.value) return;
    const confirmed = window.confirm(`这会用同步目录 ${nutstoreSyncPath} 中的最新快照覆盖当前本机数据。建议先导出完整备份。确定继续吗？`);
    if (!confirmed) return;

    isImporting.value = true;
    try {
      const res = await importBackupFromSyncDirectory(nutstoreSyncPath);
      pushNotification(`已从坚果云同步目录恢复，导入了 ${res.imported_notes} 条笔记和 ${res.imported_images} 个附件。`, 'success');
      await refreshAttachmentSummary();
      if (onSuccess) onSuccess();
    } catch (e: any) {
      console.error(e);
      pushNotification('同步目录恢复失败: ' + (e.response?.data?.detail || e.message), 'error');
    } finally {
      isImporting.value = false;
    }
  };

  const cleanupOrphanImages = async () => {
    if (isCleaningOrphans.value) return;
    isCleaningOrphans.value = true;
    try {
      const res = await cleanupOrphanedAttachments();
      pushNotification(`清理完成，删除了 ${res.deleted_count} 个未被引用的附件文件。`, 'success');
      await refreshAttachmentSummary();
      if (onSuccess) onSuccess();
    } catch (e: any) {
      console.error(e);
      pushNotification('清理失败: ' + (e.response?.data?.detail || e.message), 'error');
    } finally {
      isCleaningOrphans.value = false;
    }
  };

  const clearAllExperimentData = async () => {
    if (isImporting.value || isCleaningOrphans.value) return;
    const confirmed = window.confirm(getClearCurrentDataPrompt());
    if (!confirmed) return;

    isImporting.value = true;
    try {
      await clearCurrentWorkspaceData();
      pushNotification(getClearCurrentDataSuccessMessage(), 'success');
      await refreshAttachmentSummary();
      if (onSuccess) onSuccess();
    } catch (e: any) {
      console.error(e);
      pushNotification('清空失败: ' + (e.response?.data?.detail || e.message), 'error');
    } finally {
      isImporting.value = false;
    }
  };

  const resetToFirstInstallState = async () => {
    if (isImporting.value || isCleaningOrphans.value) return;
    const confirmed = window.confirm('这会删除当前设备上的所有笔记缓存、附件、AI 对话、同步配置、主题和其他本地设置，并刷新页面。确定继续吗？');
    if (!confirmed) return;

    isImporting.value = true;
    try {
      await resetCurrentInstallState();
      pushNotification('已恢复到首次安装状态，页面即将刷新。', 'success');
      window.setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch (e: any) {
      console.error(e);
      pushNotification('恢复失败: ' + (e.response?.data?.detail || e.message), 'error');
      isImporting.value = false;
    }
  };

  return {
    isImporting,
    isCleaningOrphans,
    attachmentSummary,
    flomoFileInput,
    backupFileInput,
    markdownArchiveFileInput,
    exportBackup,
    exportMarkdownArchive: exportMarkdownArchiveFile,
    exportFlomo,
    triggerZipImport,
    handleZipImport,
    triggerFlomoImport,
    handleFlomoImport,
    triggerMarkdownArchiveImport,
    handleMarkdownArchiveImport,
    importNutstoreSyncBackup,
    cleanupOrphanImages,
    clearAllExperimentData,
    resetToFirstInstallState,
    refreshAttachmentSummary,
  };
}
