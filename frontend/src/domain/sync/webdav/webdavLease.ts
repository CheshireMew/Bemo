import { readJson, readJsonDocument, WebDavRequestError, writeJson } from './webdavRequest.js';

function createLeaseToken(deviceId: string) {
  const random = Math.random().toString(36).slice(2, 10);
  return `${deviceId}_${Date.now()}_${random}`;
}

export async function acquireWebDavLease(baseUrl: string, headers: HeadersInit, deviceId: string) {
  const leaseUrl = `${baseUrl}/lease.json`;
  const now = Date.now();
  const token = createLeaseToken(deviceId);
  const currentDocument = await readJsonDocument<{ device_id: string; token?: string; expires_at: string }>(leaseUrl, headers);
  const current = currentDocument.value;
  if (current && Date.parse(current.expires_at) > now && current.device_id !== deviceId) {
    return null;
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

  const confirmed = await readJson<{ device_id: string; token?: string; expires_at: string }>(leaseUrl, headers);
  if (!confirmed || confirmed.device_id !== deviceId || confirmed.token !== token || Date.parse(confirmed.expires_at) <= now) {
    return null;
  }

  return {
    deviceId,
    token,
    expiresAt: confirmed.expires_at,
  };
}

export async function releaseWebDavLease(baseUrl: string, headers: HeadersInit, lease: { deviceId: string; token: string }) {
  const leaseUrl = `${baseUrl}/lease.json`;
  const currentDocument = await readJsonDocument<{ device_id: string; token?: string }>(leaseUrl, headers);
  const current = currentDocument.value;
  if (!current || current.device_id !== lease.deviceId || current.token !== lease.token) return;
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
