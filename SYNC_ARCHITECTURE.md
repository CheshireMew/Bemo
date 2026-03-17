# Bemo 多端同步架构设计

## 目标

Bemo 需要支持以下两类同步方式，并且两者共用同一套本地同步核心：

1. 用户自部署 `Bemo Sync Server`
2. 用户连接坚果云、Nextcloud、群晖等 `WebDAV` 云盘

约束：

- Bemo 仍然保持本地优先
- 不要求普通用户自建服务器
- 手机端和桌面端都可离线读写
- 冲突时不能静默丢数据
- 不能把现有 Markdown 文件夹直接作为同步协议

## 核心原则

同步设计分成三层：

1. 本地数据模型
2. 同步引擎
3. 传输后端

其中：

- 本地数据模型：定义笔记、附件、变更日志、设备状态
- 同步引擎：负责 push、pull、冲突检测、重放变更
- 传输后端：负责把变更和附件写入目标介质

这意味着：

- `ServerTransport` 和 `WebDavTransport` 只是不同后端
- 客户端内部只维护一套同步逻辑
- 后续即使增加 Dropbox、OneDrive，也只是加新的 transport

## 为什么不能直接同步 Markdown 文件

现有实现以文件路径和文件修改时间为主：

- 笔记主键实际上接近 `filename`
- 排序和更新依赖 `mtime`
- 附件引用依赖正文里的 `/images/<name>`

这在单机可用，但直接拿来多端同步会有问题：

- 文件名可变，不适合作为稳定身份
- 两端同时修改同一文件时难以判定冲突
- 仅靠 `mtime` 无法可靠处理跨设备修改
- WebDAV 对目录扫描和文件锁支持有限
- 附件缺少稳定身份和去重依据

因此需要单独的同步层数据模型。

## 同步对象模型

### NoteRecord

每条笔记必须有稳定身份，不再把 `filename` 当主键。

```json
{
  "note_id": "n_01HQY7Q2GJQ7N0S1S6B4GX9M8R",
  "revision": 12,
  "created_at": "2026-03-17T12:00:00+08:00",
  "updated_at": "2026-03-17T12:05:00+08:00",
  "deleted_at": null,
  "title": "今天的想法",
  "content": "正文内容",
  "tags": ["idea", "daily"],
  "pinned": false,
  "attachments": [
    {
      "attachment_id": "a_01HQY7R4K9X2W6G3F8T0P1N2M",
      "blob_hash": "sha256:...",
      "kind": "image",
      "name": "demo.png",
      "mime_type": "image/png"
    }
  ],
  "source": {
    "device_id": "device-desktop-01",
    "last_operation_id": "op_01HQY7S8..."
  }
}
```

字段要求：

- `note_id`：全局稳定主键，建议 ULID
- `revision`：每次成功应用写操作就递增
- `deleted_at`：软删除标记，支持 tombstone
- `attachments`：正文外的结构化附件索引
- `source`：便于调试和冲突定位

### AttachmentBlob

附件按内容地址存储，避免重复上传。

```json
{
  "blob_hash": "sha256:...",
  "size": 128392,
  "mime_type": "image/png"
}
```

附件远端以 `blob_hash` 为 key。

### ChangeRecord

同步传输的最小单位不是整本笔记，而是变更事件。

```json
{
  "operation_id": "op_01HQY7W6...",
  "device_id": "device-mobile-01",
  "entity_type": "note",
  "entity_id": "n_01HQY7Q2GJQ7N0S1S6B4GX9M8R",
  "base_revision": 11,
  "timestamp": "2026-03-17T12:06:10+08:00",
  "type": "note.update",
  "payload": {
    "content": "修改后的正文",
    "tags": ["idea"],
    "pinned": false
  }
}
```

事件类型先收敛到以下几种：

- `note.create`
- `note.update`
- `note.delete`
- `note.restore`
- `note.meta.update`
- `blob.put`

第一版不要把同步事件拆得太细，先保证简单和可重放。

### DeviceState

每台设备本地记录：

```json
{
  "device_id": "device-mobile-01",
  "last_sync_cursor": "c_00000128",
  "last_sync_at": "2026-03-17T12:10:00+08:00"
}
```

## 本地存储建议

不同平台底层可不同，但逻辑结构一致。

- Web：IndexedDB
- Tauri：SQLite
- Capacitor：SQLite

本地至少需要这几张表或集合：

- `notes`
- `attachments`
- `mutation_log`
- `sync_state`
- `conflicts`

`mutation_log` 是现有 `pendingQueue` 的升级版，必须支持：

- 新建
- 编辑
- 删除
- 恢复
- 元数据修改

## 同步引擎流程

每次同步分四步：

1. 收集本地未上传变更
2. `push` 到远端
3. `pull` 自上次游标以来的远端变更
4. 在本地重放并更新游标

### Push

客户端上传：

- `changes[]`
- 缺失的 `blobs[]`
- 当前设备信息

服务端或远端返回：

- 已接受的 `operation_id`
- 被拒绝的冲突项
- 最新游标

### Pull

客户端拉取：

- `changes[]`
- 远端游标
- 缺失 blob 清单

客户端本地重放规则：

- 先校验是否已处理过该 `operation_id`
- 再按时间和依赖顺序应用
- 若命中冲突规则，则写入 `conflicts`

## 冲突处理

第一版目标不是自动合并到最优，而是保证不丢数据。

### 无冲突情况

如果本地编辑基于的 `base_revision` 与远端当前 revision 一致，则直接应用。

### 元数据冲突

对于以下字段可直接使用最后写入值：

- `pinned`
- `tags`

前提：

- 服务端和 WebDAV 模式都保留冲突记录
- 客户端 UI 可以显示“最近一次覆盖来自哪个设备”

### 正文冲突

如果同一条笔记正文在两个设备上基于相同 `base_revision` 被修改：

- 不静默覆盖
- 保留远端版本
- 本地生成冲突副本或冲突待处理项

推荐策略：

- 原笔记保持远端胜出版本
- 本地额外生成一条 `冲突副本 - <原标题>`
- 在 UI 中提示用户自行合并

这样最稳，尤其适合个人多端而非协作编辑。

## Transport 抽象

同步引擎只依赖抽象接口，不依赖具体后端。

```ts
interface SyncTransport {
  getInfo(): Promise<RemoteInfo>;
  pushChanges(input: PushChangesInput): Promise<PushChangesResult>;
  pullChanges(cursor: string | null, limit?: number): Promise<PullChangesResult>;
  hasBlob(blobHash: string): Promise<boolean>;
  putBlob(blobHash: string, data: Uint8Array, mimeType: string): Promise<void>;
  getBlob(blobHash: string): Promise<Uint8Array>;
  writeSnapshot?(snapshot: SnapshotRecord): Promise<void>;
  acquireLease?(): Promise<LeaseHandle | null>;
}
```

## 方案 A：Bemo Sync Server

### 定位

用户自己部署的服务端，最适合完整双向同步。

### 服务端职责

- 保存当前笔记状态
- 保存变更日志
- 提供增量游标
- 存储附件 blob
- 幂等处理重复提交
- 做冲突判定

### API 草案

- `POST /api/sync/push`
- `GET /api/sync/pull?cursor=<cursor>&limit=<n>`
- `HEAD /api/sync/blobs/<hash>`
- `PUT /api/sync/blobs/<hash>`
- `GET /api/sync/blobs/<hash>`
- `GET /api/sync/info`

### 服务端存储建议

可选：

- SQLite + 文件目录
- PostgreSQL + 对象存储

第一版建议：

- SQLite 存 metadata、change log、cursor
- 本地文件目录存 blobs

### 优点

- 同步最稳定
- 并发控制最容易
- 远端游标和幂等最好实现
- 适合后续扩展共享、版本历史

## 方案 B：WebDAV / 坚果云

### 定位

把 WebDAV 当“远端文件仓库”，不是业务逻辑服务器。

### 远端目录布局

建议使用 Bemo 自己的同步目录：

```text
/bemo-sync/
  manifest.json
  changes/
    2026/
      03/
        op_01HQ....json
  blobs/
    sha256/
      ab/
        abcd1234...
  snapshots/
    snapshot_00000120.json
```

### 关键文件

`manifest.json`

```json
{
  "format_version": 1,
  "latest_cursor": "c_00000128",
  "latest_snapshot": "snapshot_00000120.json",
  "updated_at": "2026-03-17T12:20:00+08:00"
}
```

每个 change 文件独立存储，文件名直接使用 `operation_id`。

### WebDAV 同步流程

1. 读取 `manifest.json`
2. 拉取新增 change 文件列表
3. 下载未处理 changes
4. 上传本地新 changes
5. 上传缺失 blobs
6. 尝试更新 `manifest.json`

### WebDAV 模式的额外约束

- 不保证像服务端那样强一致
- 需要接受最终一致性
- 同步周期尽量短
- 任何冲突以“保留数据优先”

### 锁与租约

WebDAV 第一版不要依赖复杂锁。

可选方案：

- 最佳努力写 `lease.json`
- 带过期时间，防止死锁

但就算抢锁失败，也不能阻止本地写入，只影响远端 compaction 和 snapshot。

### 为什么不用直接同步 Markdown

因为 WebDAV 适合保存同步日志，但不适合承担冲突语义。
直接同步 Markdown 会把这些问题暴露给用户：

- 文件覆盖
- 重命名冲突
- 目录状态不一致
- 无法知道哪个修改先发生

## 两种方式如何共用一套实现

客户端内部结构建议：

```text
SyncEngine
  ├─ LocalRepository
  ├─ ConflictResolver
  ├─ ServerTransport
  └─ WebDavTransport
```

其中：

- `LocalRepository` 负责本地数据和 mutation log
- `ConflictResolver` 负责 revision 检查和冲突副本生成
- `Transport` 只负责和远端交换 changes / blobs

## 设置项设计

同步模式建议提供三档：

1. 本地模式
2. 自部署服务器
3. WebDAV 云盘

### 自部署服务器配置

- `server_url`
- `access_token`
- `device_name`

### WebDAV 配置

- `webdav_url`
- `username`
- `password` 或应用密码
- `base_path`
- `device_name`

## 第一阶段落地范围

先做能跑通的最小版本，不要一开始就追求完美。

### Phase 1

- 为笔记引入 `note_id`
- 为笔记引入 `revision`
- 本地新增 `mutation_log`
- 附件引入 `blob_hash`
- 同步引擎支持：
  - create
  - update
  - delete
  - pull
  - push

这一阶段先不做：

- 自动三方合并
- 多人协作
- 分享链接
- 复杂权限

### Phase 2

- 增加 `ServerTransport`
- 增加服务端 cursor 和幂等处理
- 补同步状态 UI

### Phase 3

- 增加 `WebDavTransport`
- 增加 `manifest + changes + blobs`
- 增加 snapshot/compaction

## 推荐实现顺序

1. 后端和数据模型去文件主键化
2. 前端离线队列升级为 mutation log
3. 落地 `ServerTransport`
4. 验证多端同步和冲突副本逻辑
5. 再落地 `WebDavTransport`

先做服务端模式的原因：

- 同步语义更清晰
- 更容易验证引擎对不对
- WebDAV 版本可以直接复用大部分逻辑

## 风险点

### 风险 1：继续把 `filename` 当主键

后果：

- 重命名和多端冲突会很快失控

### 风险 2：WebDAV 直接同步 Markdown

后果：

- 高概率出现静默覆盖

### 风险 3：冲突时自动覆盖正文

后果：

- 用户最难接受的是内容丢失，不是多出一份冲突副本

### 风险 4：同步引擎和具体后端耦合

后果：

- 后续新增同步方式会重复开发

## 结论

Bemo 应该实现“一套同步核心，两种远端后端”：

- 自部署服务器：完整双向同步主方案
- WebDAV/坚果云：无自建服务端用户的替代方案

两者必须共用：

- `note_id + revision`
- `mutation_log`
- `change record`
- `blob hash`
- 冲突副本策略

只有这样，后续才不会因为同步后端不同而维护两套完全不同的系统。
