/**
 * Vitest setup.
 *
 * Node ≥ 25 defines its own global `localStorage` (Web Storage, disabled unless
 * --localstorage-file is given), which shadows jsdom's and has no working methods.
 * Install an in-memory Storage when that happens.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  let current: Storage | undefined
  try {
    current = globalThis[name]
  } catch {
    current = undefined
  }
  if (typeof current?.clear !== 'function') {
    Object.defineProperty(globalThis, name, {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    })
  }
}
