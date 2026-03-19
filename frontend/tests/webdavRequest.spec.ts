import assert from 'node:assert/strict';

import {
  WebDavRequestError,
  formatWebDavError,
  getWebDavStatusMessage,
  normalizeWebDavBase,
  normalizeWebDavContainer,
} from '../src/domain/sync/webdav/webdavRequest.js';

function testNormalizeWebDavContainerHandlesRootAndBasePath() {
  assert.equal(normalizeWebDavContainer('https://dav.example.com/', ''), 'https://dav.example.com');
  assert.equal(
    normalizeWebDavContainer('https://dav.example.com/', '/remote.php/dav/files/demo/'),
    'https://dav.example.com/remote.php/dav/files/demo',
  );
}

function testNormalizeWebDavBaseAppendsAppDirectory() {
  assert.equal(
    normalizeWebDavBase('https://dav.example.com/', '/remote.php/dav/files/demo/'),
    'https://dav.example.com/remote.php/dav/files/demo/bemo-sync',
  );
}

function testWebDavStatusMessagesAreReadable() {
  assert.equal(getWebDavStatusMessage(401), '认证失败，请检查用户名或密码');
  assert.equal(getWebDavStatusMessage(409), '远端父目录不存在，请检查基础路径');
}

function testFormatWebDavErrorUsesFriendlyMessage() {
  assert.equal(formatWebDavError(new WebDavRequestError(423)), '远端目录被锁定，请稍后重试');
  assert.equal(formatWebDavError(new Error('custom error')), 'custom error');
}

testNormalizeWebDavContainerHandlesRootAndBasePath();
testNormalizeWebDavBaseAppendsAppDirectory();
testWebDavStatusMessagesAreReadable();
testFormatWebDavErrorUsesFriendlyMessage();

console.log('webdavRequest.spec passed');
