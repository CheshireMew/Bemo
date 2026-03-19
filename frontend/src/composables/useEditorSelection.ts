import type { Ref } from 'vue';

export function useEditorSelection(previewRef: Ref<HTMLElement | null>) {
  const getPreviewSelectionOffsets = () => {
    const preview = previewRef.value;
    const selection = window.getSelection();
    if (!preview || !selection || selection.rangeCount === 0) {
      const length = preview?.textContent?.length || 0;
      return { start: length, end: length };
    }

    const range = selection.getRangeAt(0);
    if (!preview.contains(range.startContainer) || !preview.contains(range.endContainer)) {
      const length = preview.textContent?.length || 0;
      return { start: length, end: length };
    }

    const startRange = range.cloneRange();
    startRange.selectNodeContents(preview);
    startRange.setEnd(range.startContainer, range.startOffset);

    const endRange = range.cloneRange();
    endRange.selectNodeContents(preview);
    endRange.setEnd(range.endContainer, range.endOffset);

    return {
      start: startRange.toString().length,
      end: endRange.toString().length,
    };
  };

  const restorePreviewSelectionOffsets = (start: number, end: number) => {
    const preview = previewRef.value;
    const selection = window.getSelection();
    if (!preview || !selection) return;

    const walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT);
    let currentOffset = 0;
    let startNode: Node | null = null;
    let endNode: Node | null = null;
    let startNodeOffset = 0;
    let endNodeOffset = 0;

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const textLength = node.textContent?.length || 0;

      if (!startNode && currentOffset + textLength >= start) {
        startNode = node;
        startNodeOffset = Math.max(0, start - currentOffset);
      }

      if (!endNode && currentOffset + textLength >= end) {
        endNode = node;
        endNodeOffset = Math.max(0, end - currentOffset);
        break;
      }

      currentOffset += textLength;
    }

    const range = document.createRange();
    if (startNode && endNode) {
      range.setStart(startNode, Math.min(startNodeOffset, startNode.textContent?.length || 0));
      range.setEnd(endNode, Math.min(endNodeOffset, endNode.textContent?.length || 0));
    } else {
      range.selectNodeContents(preview);
      range.collapse(false);
    }

    selection.removeAllRanges();
    selection.addRange(range);
    preview.focus();
  };

  return {
    getPreviewSelectionOffsets,
    restorePreviewSelectionOffsets,
  };
}
