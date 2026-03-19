import { onMounted, ref } from 'vue';
import { getAllAttachmentBlobRecords, getAllDraftAttachmentBlobRecords } from '../domain/attachments/blobStorage.js';
import {
  clearAllLocalExperimentData,
  cleanupOrphanImagesRequest,
  exportBackupArchive,
  exportFlomoCsv,
  exportMarkdownArchive,
  importBackupArchive,
  importFlomoArchive,
  importMarkdownArchiveZip,
  resetAppToFirstInstallState,
} from '../domain/importExport/localImportExport';
import { getAttachmentReferenceSummary } from '../domain/attachments/attachmentRefStorage.js';
import { pushNotification } from '../store/notifications';

export function useImportExport(onSuccess?: () => void) {
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
      const [referenceSummary, storedAttachments, storedDraftAttachments] = await Promise.all([
        getAttachmentReferenceSummary(),
        getAllAttachmentBlobRecords(),
        getAllDraftAttachmentBlobRecords(),
      ]);
      attachmentSummary.value = {
        ...referenceSummary,
        storedAttachments: storedAttachments.length,
        storedDraftAttachments: storedDraftAttachments.length,
        unreferencedStoredAttachments: Math.max(storedAttachments.length - referenceSummary.totalReferencedAttachments, 0),
      };
    } catch (error) {
      console.error('Failed to load attachment reference summary', error);
    }
  };

  onMounted(() => {
    void refreshAttachmentSummary();
  });

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

  const triggerZipImport = () => {
    if (isImporting.value) return;
    backupFileInput.value?.click();
  };

  const handleZipImport = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    const file = target.files[0];
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
      if (backupFileInput.value) backupFileInput.value.value = '';
    }
  };

  const triggerFlomoImport = () => {
    if (isImporting.value) return;
    flomoFileInput.value?.click();
  };

  const triggerMarkdownArchiveImport = () => {
    if (isImporting.value) return;
    markdownArchiveFileInput.value?.click();
  };

  const handleFlomoImport = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    const file = target.files[0];
    isImporting.value = true;
    try {
      const res = await importFlomoArchive(file);
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
      if (flomoFileInput.value) flomoFileInput.value.value = '';
    }
  };

  const handleMarkdownArchiveImport = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    const file = target.files[0];
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
      if (markdownArchiveFileInput.value) markdownArchiveFileInput.value.value = '';
    }
  };

  const cleanupOrphanImages = async () => {
    if (isCleaningOrphans.value) return;
    isCleaningOrphans.value = true;
    try {
      const res = await cleanupOrphanImagesRequest();
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
    const confirmed = window.confirm('这会清空本地所有笔记、回收站、附件和同步队列，仅保留设置。确定继续吗？');
    if (!confirmed) return;

    isImporting.value = true;
    try {
      await clearAllLocalExperimentData();
      pushNotification('已清空本地笔记、附件和同步残留。', 'success');
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
    const confirmed = window.confirm('这会删除本地所有笔记、附件、AI 对话、同步配置、主题和其他本地设置，并刷新页面。确定继续吗？');
    if (!confirmed) return;

    isImporting.value = true;
    try {
      await resetAppToFirstInstallState();
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
    cleanupOrphanImages,
    clearAllExperimentData,
    resetToFirstInstallState,
    refreshAttachmentSummary,
  };
}
