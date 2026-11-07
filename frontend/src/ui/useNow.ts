import { ref } from 'vue'

/** A shared clock for relative times ("2 minutes ago"), ticking every 30 seconds. */
const now = ref(Date.now())
let started = false

export function useNow() {
  if (!started && typeof window !== 'undefined') {
    started = true
    window.setInterval(() => (now.value = Date.now()), 30_000)
  }
  return now
}

/** Compact age: "now", "45s", "3m", "2h", "5d". */
export function shortAge(iso: string | undefined, nowMs: number): string {
  if (!iso) return ''
  const seconds = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000))
  if (seconds < 10) return 'now'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86_400)}d`
}
