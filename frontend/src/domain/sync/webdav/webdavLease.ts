import { readJsonDocument, WebDavRequestError, writeJson } from './webdavRequest.js';

function createLeaseToken(deviceId: string) {
  const random = Math.random().toString(36).slice(2, 10);
  return `${deviceId}_${Date.now()}_${random}`;
}

/** Every remote mutation, including crash recovery, uses the same lease. */
export async function withWebDavLease<T>(baseUrl: string, headers: HeadersInit,
  run: (assertLease: () => Promise<void>) => Promise<T>, deviceId = `recovery_${crypto.randomUUID()}`): Promise<T> {
  const lease = await acquireWebDavLease(baseUrl, headers, deviceId);
  if (!lease) throw new Error('WebDAV 正在写入，请稍后重试。');
  let checks = Promise.resolve();
  const assertLease = () => {
    checks = checks.then(() => renewWebDavLease(baseUrl, headers, lease));
    return checks;
  };
  const timer = setInterval(() => { void assertLease().catch(() => {}); }, 20_000);
  try { const result = await run(assertLease); await assertLease(); return result; }
  finally { clearInterval(timer); await checks.catch(() => {}); await releaseWebDavLease(baseUrl, headers, lease); }
}

export async function acquireWebDavLease(baseUrl: string, headers: HeadersInit, deviceId: string) {
  const leaseUrl = `${baseUrl}/lease.json`;
  const now = Date.now();
  const token = createLeaseToken(deviceId);
  const currentDocument = await readJsonDocument<{ device_id: string; token?: string; expires_at: string }>(leaseUrl, headers);
  const current = currentDocument.value;
  if (current && Date.parse(current.expires_at) > now) {
    return null;
  }
  if (currentDocument.status !== 404 && !currentDocument.etag) {
    throw new Error('WebDAV 未提供写入锁的强 ETag，无法保护并发写入，请检查服务或代理配置。');
  }
  try {
    await writeJson(leaseUrl, headers, {
      device_id: deviceId,
      token,
      acquired_at: new Date(now).toISOString(),
      expires_at: new Date(now + 60_000).toISOString(),
    }, {
      ifMatch: currentDocument.etag,
      ifNoneMatch: currentDocument.status === 404 ? '*' : null,
    });
  } catch (error) {
    if (error instanceof WebDavRequestError && error.status === 412) {
      return null;
    }
    throw error;
  }

  const confirmedDocument = await readJsonDocument<{ device_id: string; token?: string; expires_at: string }>(leaseUrl, headers);
  const confirmed = confirmedDocument.value;
  if (!confirmed || confirmed.device_id !== deviceId || confirmed.token !== token || Date.parse(confirmed.expires_at) <= now) {
    return null;
  }
  if (!confirmedDocument.etag) throw new Error('WebDAV 未提供写入锁的强 ETag，无法保护并发写入，请检查服务或代理配置。');

  return {
    deviceId,
    token,
    expiresAt: confirmed.expires_at,
  };
}

export async function renewWebDavLease(baseUrl: string, headers: HeadersInit, lease: { deviceId: string; token: string }) {
  const url = `${baseUrl}/lease.json`;
  const document = await readJsonDocument<{device_id: string; token: string; expires_at: string}>(url, headers);
  const current = document.value;
  if (!current || !document.etag || current.device_id !== lease.deviceId || current.token !== lease.token || Date.parse(current.expires_at) <= Date.now()) {
    throw new Error('WebDAV 写入锁已失效，请重试同步。');
  }
  await writeJson(url, headers, { ...current, expires_at: new Date(Date.now() + 60_000).toISOString() }, { ifMatch: document.etag });
}

export async function releaseWebDavLease(baseUrl: string, headers: HeadersInit, lease: { deviceId: string; token: string }) {
  const leaseUrl = `${baseUrl}/lease.json`;
  const currentDocument = await readJsonDocument<{ device_id: string; token?: string }>(leaseUrl, headers);
  const current = currentDocument.value;
  if (!current || !currentDocument.etag || current.device_id !== lease.deviceId || current.token !== lease.token) return;
  try {
    await writeJson(leaseUrl, headers, {
      device_id: '',
      token: '',
      acquired_at: null,
      expires_at: new Date(0).toISOString(),
    }, {
      ifMatch: currentDocument.etag,
    });
  } catch (error) {
    if (error instanceof WebDavRequestError && error.status === 412) {
      return;
    }
    throw error;
  }
}
