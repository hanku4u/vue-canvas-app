import { describe, expect, it } from 'vitest'
import { WHEEL_STEP, wheelZoomFactor } from '@/canvas/zoomGuard'

const notches = (factors: number[]) => factors.reduce((a, b) => a * b, 1)

describe('wheelZoomFactor', () => {
  it('mouse wheel with Ctrl held: 5% per notch, however the browser splits it', () => {
    expect(wheelZoomFactor({ deltaY: -100, deltaMode: 0 }, true)).toBeCloseTo(WHEEL_STEP)
    expect(wheelZoomFactor({ deltaY: 100, deltaMode: 0 }, true)).toBeCloseTo(1 / WHEEL_STEP)
    // Smooth scrolling: one notch as five events of 20 px gives the same total.
    const split = notches(
      Array.from({ length: 5 }, () => wheelZoomFactor({ deltaY: -20, deltaMode: 0 }, true)),
    )
    expect(split).toBeCloseTo(WHEEL_STEP)
    // Line mode (Firefox): 3 lines ≈ one notch.
    expect(wheelZoomFactor({ deltaY: -3, deltaMode: 1 }, true)).toBeCloseTo(WHEEL_STEP, 2)
  })

  it('trackpad pinch (no key held) follows the gesture smoothly', () => {
    const small = wheelZoomFactor({ deltaY: -2, deltaMode: 0 }, false)
    expect(small).toBeGreaterThan(1)
    expect(small).toBeLessThan(1.03)
    expect(wheelZoomFactor({ deltaY: 10, deltaMode: 0 }, false)).toBeCloseTo(
      1 / wheelZoomFactor({ deltaY: -10, deltaMode: 0 }, false),
    )
    expect(wheelZoomFactor({ deltaY: 0, deltaMode: 0 }, false)).toBe(1)
  })

  it('never changes zoom by more than 25% in one event', () => {
    expect(wheelZoomFactor({ deltaY: -2000, deltaMode: 0 }, true)).toBeLessThanOrEqual(1.25)
    expect(wheelZoomFactor({ deltaY: -100, deltaMode: 0 }, false)).toBeLessThanOrEqual(1.25)
  })
})
