type StoreMap = Map<any, any>;
type FakeIndexDefinition = {
  keyPath: string;
  unique: boolean;
};

class FakeIdbRequest<T> {
  result!: T;
  error: Error | null = null;
  onsuccess: ((this: FakeIdbRequest<T>, ev: Event) => any) | null = null;
  onerror: ((this: FakeIdbRequest<T>, ev: Event) => any) | null = null;
  onupgradeneeded: ((this: FakeIdbRequest<T>, ev: Event) => any) | null = null;
}

class FakeObjectStore {
  constructor(
    private readonly definition: FakeStoreDefinition,
    private readonly transaction: FakeTransaction,
  ) {}

  indexNames = {
    contains: (name: string) => this.definition.indexes.has(name),
  };

  private nextKey() {
    return this.definition.data.size + 1;
  }

  createIndex(name: string, keyPath: string, options?: { unique?: boolean }) {
    this.definition.indexes.set(name, {
      keyPath,
      unique: Boolean(options?.unique),
    });
    return {
      name,
      keyPath,
    };
  }

  index(name: string) {
    const definition = this.definition.indexes.get(name);
    if (!definition) {
      throw new Error(`Missing index: ${name}`);
    }
    return {
      get: (value: any) => {
        const request = new FakeIdbRequest<any>();
        queueMicrotask(() => {
          request.result = Array.from(this.definition.data.values())
            .find((item) => item[definition.keyPath] === value);
          request.onsuccess?.call(request, new Event('success'));
        });
        return request;
      },
    };
  }

  add(value: any) {
    const request = new FakeIdbRequest<number>();
    this.transaction.start();
    queueMicrotask(() => {
      const key = this.definition.autoIncrement ? this.nextKey() : value[this.definition.keyPath];
      this.definition.data.set(key, { ...value, [this.definition.keyPath]: key });
      request.result = key;
      request.onsuccess?.call(request, new Event('success'));
      this.transaction.finish();
    });
    return request;
  }

  put(value: any) {
    const request = new FakeIdbRequest<any>();
    this.transaction.start();
    queueMicrotask(() => {
      const key = this.definition.autoIncrement
        ? (value[this.definition.keyPath] ?? this.nextKey())
        : value[this.definition.keyPath];
      this.definition.data.set(key, { ...value, [this.definition.keyPath]: key });
      request.result = key;
      request.onsuccess?.call(request, new Event('success'));
      this.transaction.finish();
    });
    return request;
  }

  get(key: any) {
    const request = new FakeIdbRequest<any>();
    queueMicrotask(() => {
      request.result = this.definition.data.get(key);
      request.onsuccess?.call(request, new Event('success'));
    });
    return request;
  }

  getAll() {
    const request = new FakeIdbRequest<any[]>();
    queueMicrotask(() => {
      request.result = Array.from(this.definition.data.values()).map((value) => ({ ...value }));
      request.onsuccess?.call(request, new Event('success'));
    });
    return request;
  }

  delete(key: any) {
    this.transaction.start();
    queueMicrotask(() => {
      this.definition.data.delete(key);
      this.transaction.finish();
    });
  }

  clear() {
    this.transaction.start();
    queueMicrotask(() => {
      this.definition.data.clear();
      this.transaction.finish();
    });
  }
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  private pending = 0;
  private completed = false;

  constructor(private readonly stores: Map<string, FakeStoreDefinition>) {}

  objectStore(name: string) {
    const definition = this.stores.get(name);
    if (!definition) {
      throw new Error(`Missing object store: ${name}`);
    }
    return new FakeObjectStore(definition, this);
  }

  start() {
    this.pending += 1;
  }

  finish() {
    this.pending = Math.max(0, this.pending - 1);
    if (this.completed || this.pending !== 0) return;
    this.completed = true;
    queueMicrotask(() => this.oncomplete?.());
  }
}

type FakeStoreDefinition = {
  keyPath: string;
  autoIncrement: boolean;
  data: StoreMap;
  indexes: Map<string, FakeIndexDefinition>;
};

class FakeDatabase {
  objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  };

  private stores = new Map<string, FakeStoreDefinition>();

  createObjectStore(name: string, options: { keyPath: string; autoIncrement?: boolean }) {
    const definition: FakeStoreDefinition = {
      keyPath: options.keyPath,
      autoIncrement: Boolean(options.autoIncrement),
      data: new Map(),
      indexes: new Map(),
    };
    this.stores.set(name, definition);
    return new FakeObjectStore(definition, new FakeTransaction(new Map([[name, definition]])));
  }

  deleteObjectStore(name: string) {
    this.stores.delete(name);
  }

  transaction(names: string | string[], _mode: 'readonly' | 'readwrite') {
    const list = Array.isArray(names) ? names : [names];
    return new FakeTransaction(new Map(list.map((name) => {
      const definition = this.stores.get(name);
      if (!definition) {
        throw new Error(`Missing object store: ${name}`);
      }
      return [name, definition];
    })));
  }
}

export function installMemoryIndexedDb() {
  const databases = new Map<string, FakeDatabase>();

  Object.assign(globalThis, {
    indexedDB: {
      open(name: string, _version: number) {
        const request = new FakeIdbRequest<FakeDatabase>();
        queueMicrotask(() => {
          const existing = databases.get(name);
          const db = existing ?? new FakeDatabase();
          request.result = db;
          if (!existing) {
            databases.set(name, db);
            request.onupgradeneeded?.call(request, new Event('upgradeneeded'));
          }
          request.onsuccess?.call(request, new Event('success'));
        });
        return request;
      },
      deleteDatabase(name: string) {
        databases.delete(name);
      },
    },
  });
}
