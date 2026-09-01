import { ref } from 'vue';

export type NotificationLevel = 'success' | 'error' | 'info';

export type AppNotification = {
  id: number;
  message: string;
  level: NotificationLevel;
  durationMs: number;
  action?: {
    label: string;
    run: () => void | Promise<void>;
  };
};

const nextId = ref(1);
export const notifications = ref<AppNotification[]>([]);

export function pushNotification(
  message: string,
  level: NotificationLevel = 'info',
  durationMs = 2800,
  action?: AppNotification['action'],
) {
  const notification: AppNotification = {
    id: nextId.value++,
    message,
    level,
    durationMs,
    action,
  };
  notifications.value = [...notifications.value, notification];

  window.setTimeout(() => {
    removeNotification(notification.id);
  }, durationMs);

  return notification.id;
}

export async function runNotificationAction(notification: AppNotification) {
  removeNotification(notification.id);
  await notification.action?.run();
}

export function removeNotification(id: number) {
  notifications.value = notifications.value.filter((item) => item.id !== id);
}
