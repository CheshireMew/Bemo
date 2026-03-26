import {
  encodeBasicAuth,
  ensureWebDavLayout,
  formatWebDavError,
  normalizeWebDavBase,
  normalizeWebDavContainer,
  testWebDavConnection,
} from './webdavRequest.js';
import {
  hasWebDavBackendProxyAccess,
  hasWebDavBackendProxyConfig,
  shouldProxyWebDavThroughBackend,
} from './webdavHttp.js';
import {
  pushCheck,
  summarizeCounts,
  summarizeReport,
  type DiagnosticCheck,
  type WebDavDiagnosticReport,
} from './webdavDiagnosticShared.js';
import { runWebDavRemoteContractChecks } from './webdavDiagnosticContractChecks.js';
import { runWebDavLocalAndRuntimeChecks } from './webdavDiagnosticRuntimeChecks.js';

export type { WebDavDiagnosticReport } from './webdavDiagnosticShared.js';

export async function runWebDavDiagnostics(input: {
  webdavUrl: string;
  username: string;
  password: string;
  basePath: string;
}): Promise<WebDavDiagnosticReport> {
  const startedAt = new Date().toISOString();
  const checks: DiagnosticCheck[] = [];
  const webdavUrl = input.webdavUrl.trim();
  const username = input.username.trim();
  const password = input.password;
  const basePath = input.basePath.trim();
  const baseUrl = normalizeWebDavBase(webdavUrl || 'https://invalid.example', basePath);
  const containerUrl = normalizeWebDavContainer(webdavUrl || 'https://invalid.example', basePath);
  const headers = {
    Authorization: encodeBasicAuth(username, password),
  };

  const configIssues: string[] = [];
  if (!webdavUrl) configIssues.push('缺少 WebDAV 地址');
  if (!username) configIssues.push('缺少用户名');
  if (!password) configIssues.push('缺少密码');
  if (shouldProxyWebDavThroughBackend() && !hasWebDavBackendProxyConfig()) {
    configIssues.push('网页端缺少同步服务器地址，无法通过代理访问第三方 WebDAV');
  }
  if (shouldProxyWebDavThroughBackend() && !hasWebDavBackendProxyAccess()) {
    configIssues.push('网页端缺少同步服务器 Token，代理请求会被拒绝');
  }

  pushCheck(checks, {
    id: 'config',
    title: '配置与运行环境',
    phase: 'config',
    status: configIssues.length ? 'fail' : 'pass',
    detail: configIssues.length
      ? `当前配置还不能开始完整诊断：${configIssues.join('，')}。`
      : '配置完整，当前运行环境允许执行完整 WebDAV 诊断。',
    facts: [
      `容器路径：${containerUrl}`,
      `同步根目录：${baseUrl}`,
      `访问方式：${shouldProxyWebDavThroughBackend() ? '网页代理' : '原生直连'}`,
    ],
  });

  if (configIssues.length) {
    const finishedAt = new Date().toISOString();
    return {
      baseUrl,
      containerUrl,
      startedAt,
      finishedAt,
      summary: summarizeReport(checks),
      counts: summarizeCounts(checks),
      checks,
    };
  }

  try {
    const connection = await testWebDavConnection(webdavUrl, basePath, headers);
    pushCheck(checks, {
      id: 'connection',
      title: '远端连接与认证',
      phase: 'remote',
      status: connection.status === 404 ? 'warn' : 'pass',
      detail: connection.status === 404
        ? '连接成功，但当前基础路径还不存在。后续会继续检查目录自动创建能力。'
        : '连接成功，认证可用，远端容器可以访问。',
      facts: [
        `HTTP 状态：${connection.status}`,
        `容器地址：${connection.containerUrl}`,
      ],
    });
  } catch (error) {
    pushCheck(checks, {
      id: 'connection',
      title: '远端连接与认证',
      phase: 'remote',
      status: 'fail',
      detail: formatWebDavError(error),
    });
    const finishedAt = new Date().toISOString();
    return {
      baseUrl,
      containerUrl,
      startedAt,
      finishedAt,
      summary: summarizeReport(checks),
      counts: summarizeCounts(checks),
      checks,
    };
  }

  try {
    await ensureWebDavLayout(baseUrl, headers);
    pushCheck(checks, {
      id: 'layout',
      title: '同步目录结构',
      phase: 'remote',
      status: 'pass',
      detail: '同步目录可访问，目录缺失时也能自动创建。',
      facts: [
        `${baseUrl}/`,
        `${baseUrl}/batches/`,
        `${baseUrl}/blobs/`,
        `${baseUrl}/snapshots/`,
      ],
    });
  } catch (error) {
    pushCheck(checks, {
      id: 'layout',
      title: '同步目录结构',
      phase: 'remote',
      status: 'fail',
      detail: formatWebDavError(error),
    });
    const finishedAt = new Date().toISOString();
    return {
      baseUrl,
      containerUrl,
      startedAt,
      finishedAt,
      summary: summarizeReport(checks),
      counts: summarizeCounts(checks),
      checks,
    };
  }

  try {
    const {
      manifest,
      batchIndex,
      rebuiltRemoteNotes,
      referencedBlobHashes,
      snapshotMeta,
    } = await runWebDavRemoteContractChecks({
      checks,
      baseUrl,
      headers,
    });

    await runWebDavLocalAndRuntimeChecks({
      checks,
      baseUrl,
      headers,
      webdavUrl,
      username,
      password,
      basePath,
      manifest,
      batchIndex,
      rebuiltRemoteNotes,
      referencedBlobHashes,
      snapshotMeta,
    });
  } catch (failure) {
    const error = failure && typeof failure === 'object' && 'error' in failure
      ? (failure as { error: unknown }).error
      : failure;
    pushCheck(checks, {
      id: 'metadata',
      title: '远端元数据文件',
      phase: 'contract',
      status: 'fail',
      detail: formatWebDavError(error),
    });
  }

  const finishedAt = new Date().toISOString();
  return {
    baseUrl,
    containerUrl,
    startedAt,
    finishedAt,
    summary: summarizeReport(checks),
    counts: summarizeCounts(checks),
    checks,
  };
}
