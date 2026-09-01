import { shallowRef } from 'vue';

export type DialogRequest = {
  id: number;
  mode: 'confirm' | 'prompt';
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  inputLabel?: string;
  inputValue?: string;
  inputPlaceholder?: string;
  validate?: (value: string) => string;
};

type DialogOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type PromptOptions = DialogOptions & {
  inputLabel?: string;
  inputValue?: string;
  inputPlaceholder?: string;
  validate?: (value: string) => string;
};

type PendingDialog = {
  request: DialogRequest;
  resolve: (value: boolean | string | null) => void;
};

let nextDialogId = 1;
const queue: PendingDialog[] = [];
let current: PendingDialog | null = null;

export const activeDialog = shallowRef<DialogRequest | null>(null);

function showNextDialog() {
  if (current || queue.length === 0) return;
  current = queue.shift() || null;
  activeDialog.value = current?.request || null;
}

function enqueueDialog(request: Omit<DialogRequest, 'id'>) {
  return new Promise<boolean | string | null>((resolve) => {
    queue.push({
      request: { ...request, id: nextDialogId++ },
      resolve,
    });
    showNextDialog();
  });
}

export async function requestConfirmation(options: DialogOptions) {
  const value = await enqueueDialog({
    mode: 'confirm',
    title: options.title,
    message: options.message,
    confirmLabel: options.confirmLabel || '确定',
    cancelLabel: options.cancelLabel || '取消',
    danger: options.danger ?? false,
  });
  return value === true;
}

export async function requestTextInput(options: PromptOptions) {
  const value = await enqueueDialog({
    mode: 'prompt',
    title: options.title,
    message: options.message,
    confirmLabel: options.confirmLabel || '插入',
    cancelLabel: options.cancelLabel || '取消',
    danger: options.danger ?? false,
    inputLabel: options.inputLabel,
    inputValue: options.inputValue,
    inputPlaceholder: options.inputPlaceholder,
    validate: options.validate,
  });
  return typeof value === 'string' ? value : null;
}

export function resolveDialog(value: boolean | string | null) {
  if (!current) return;
  const pending = current;
  current = null;
  activeDialog.value = null;
  pending.resolve(value);
  queueMicrotask(showNextDialog);
}
