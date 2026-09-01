const NETWORK_ERROR_PATTERN = /failed to fetch|networkerror|network request failed|load failed|fetch failed/i;

export function toUserErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error
    ? error.message.trim()
    : typeof error === 'string'
      ? error.trim()
      : '';

  if (!message) return fallback;
  if (/timeout|timed out|aborted/i.test(message)) return '请求超时，请检查连接后重试。';
  if (NETWORK_ERROR_PATTERN.test(message)) {
    return '无法连接数据服务，请检查服务是否已启动，然后重试。';
  }
  return message;
}
