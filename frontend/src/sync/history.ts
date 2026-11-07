import { invertTransaction, mergeTransactions, type Transaction } from './ops'

interface Entry {
  tx: Transaction
  /** Consecutive pushes with the same key within MERGE_WINDOW_MS become one undo step. */
  mergeKey?: string
  at: number
}

const MERGE_WINDOW_MS = 1000
const MAX_ENTRIES = 200

/** Undo/redo stacks of transactions for the current editing session. */
export class UndoHistory {
  private undoStack: Entry[] = []
  private redoStack: Entry[] = []

  constructor(private readonly now: () => number = Date.now) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  push(tx: Transaction, mergeKey?: string): void {
    if (!tx.length) return
    const top = this.undoStack[this.undoStack.length - 1]
    const at = this.now()
    if (mergeKey && top?.mergeKey === mergeKey && at - top.at < MERGE_WINDOW_MS) {
      top.tx = mergeTransactions(top.tx, tx)
      top.at = at
    } else {
      this.undoStack.push({ tx, mergeKey, at })
      if (this.undoStack.length > MAX_ENTRIES) this.undoStack.shift()
    }
    this.redoStack = []
  }

  /** The transaction that undoes the latest step, or null. */
  undo(): Transaction | null {
    const entry = this.undoStack.pop()
    if (!entry) return null
    this.redoStack.push(entry)
    return invertTransaction(entry.tx)
  }

  /** The transaction that redoes the latest undone step, or null. */
  redo(): Transaction | null {
    const entry = this.redoStack.pop()
    if (!entry) return null
    this.undoStack.push({ ...entry, mergeKey: undefined })
    return entry.tx
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
}
