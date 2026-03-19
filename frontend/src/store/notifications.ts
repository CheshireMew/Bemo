import { ref } from 'vue';

export type NotificationLevel = 'success' | 'error' | 'info';

export type AppNotification = {
  id: number;
  message: string;
  level: NotificationLevel;
  durationMs: number;
};

const nextId = ref(1);
export const notifications = ref<AppNotification[]>([]);

export function pushNotification(message: string, level: NotificationLevel = 'info', durationMs = 2800) {
  const notification: AppNotification = {
    id: nextId.value++,
    message,
    level,
    durationMs,
  };
  notifications.value = [...notifications.value, notification];

  window.setTimeout(() => {
    removeNotification(notification.id);
  }, durationMs);
}

export function removeNotification(id: number) {
  notifications.value = notifications.value.filter((item) => item.id !== id);
}
