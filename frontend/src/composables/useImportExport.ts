import { ref } from 'vue';
import axios from 'axios';
import { API_BASE } from '../config';

export function useImportExport(onSuccess?: () => void) {
  const isImporting = ref(false);
  const isCleaningOrphans = ref(false);
  const flomoFileInput = ref<HTMLInputElement | null>(null);
  const zipFileInput = ref<HTMLInputElement | null>(null);

  const exportZip = async () => {
    try {
      const res = await axios.get(`${API_BASE}/uploads/export/zip`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers['content-disposition'] || '';
      const match = disposition.match(/filename="(.+?)"/);
      a.download = match ? match[1] : 'bemo_backup.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error(e);
      alert('导出失败: ' + (e.response?.data?.detail || e.message));
    }
  };

  const exportFlomo = async () => {
    try {
      const res = await axios.get(`${API_BASE}/uploads/export/flomo`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers['content-disposition'] || '';
      const match = disposition.match(/filename="(.+?)"/);
      a.download = match ? match[1] : 'bemo_flomo.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error(e);
      alert('导出失败: ' + (e.response?.data?.detail || e.message));
    }
  };

  const triggerZipImport = () => {
    if (isImporting.value) return;
    zipFileInput.value?.click();
  };

  const handleZipImport = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    const file = target.files[0];
    isImporting.value = true;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${API_BASE}/uploads/zip`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      alert(`导入成功！导入了 ${res.data.imported_notes} 条笔记和 ${res.data.imported_images} 个媒体文件。`);
      if (onSuccess) onSuccess();
    } catch (e: any) {
      console.error(e);
      alert('导入失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      isImporting.value = false;
      if (zipFileInput.value) zipFileInput.value.value = '';
    }
  };

  const triggerFlomoImport = () => {
    if (isImporting.value) return;
    flomoFileInput.value?.click();
  };

  const handleFlomoImport = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    const file = target.files[0];
    isImporting.value = true;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${API_BASE}/uploads/flomo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      alert(`导入成功！共导入了 ${res.data.imported_count} 条笔记。`);
      if (onSuccess) onSuccess();
    } catch (e: any) {
      console.error(e);
      alert('导入失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      isImporting.value = false;
      if (flomoFileInput.value) flomoFileInput.value.value = '';
    }
  };

  const cleanupOrphanImages = async () => {
    if (isCleaningOrphans.value) return;
    isCleaningOrphans.value = true;
    try {
      const res = await axios.post(`${API_BASE}/notes/maintenance/cleanup-orphan-images`);
      alert(`清理完成！删除了 ${res.data.deleted_count} 个孤儿图片文件。`);
      if (onSuccess) onSuccess();
    } catch (e: any) {
      console.error(e);
      alert('清理失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      isCleaningOrphans.value = false;
    }
  };

  return {
    isImporting,
    isCleaningOrphans,
    flomoFileInput,
    zipFileInput,
    exportZip,
    exportFlomo,
    triggerZipImport,
    handleZipImport,
    triggerFlomoImport,
    handleFlomoImport,
    cleanupOrphanImages,
  };
}
