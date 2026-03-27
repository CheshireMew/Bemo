import { onBeforeUnmount, watch, type Ref } from 'vue';

import { registerMobileBackHandler } from '../domain/runtime/mobileBackNavigation.js';

export function useMobileBackHandler(input: {
  id: string;
  priority: number;
  enabled: Ref<boolean>;
  dismiss: () => void;
}) {
  let unregister: (() => void) | null = null;

  const detach = () => {
    unregister?.();
    unregister = null;
  };

  watch(input.enabled, (enabled) => {
    if (!enabled) {
      detach();
      return;
    }

    if (unregister) {
      return;
    }

    unregister = registerMobileBackHandler({
      id: input.id,
      priority: input.priority,
      canHandle: () => input.enabled.value,
      handle: input.dismiss,
    });
  }, {
    immediate: true,
  });

  onBeforeUnmount(() => {
    detach();
  });
}
