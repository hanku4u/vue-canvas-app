import { describe, expect, it } from 'vitest'
import { WHEEL_STEP, wheelZoomFactor } from '@/canvas/zoomGuard'

describe('wheelZoomFactor', () => {
  it('steps 10% per mouse-wheel notch, in either delta mode', () => {
    expect(wheelZoomFactor({ deltaY: -100, deltaMode: 0 })).toBeCloseTo(WHEEL_STEP)
    expect(wheelZoomFactor({ deltaY: 100, deltaMode: 0 })).toBeCloseTo(1 / WHEEL_STEP)
    expect(wheelZoomFactor({ deltaY: -3, deltaMode: 1 })).toBeCloseTo(WHEEL_STEP)
    // Big deltas (fast spins, high-res wheels) are still one step per event.
    expect(wheelZoomFactor({ deltaY: -600, deltaMode: 0 })).toBeCloseTo(WHEEL_STEP)
  })

  it('scales pinch gestures smoothly and gently', () => {
    const small = wheelZoomFactor({ deltaY: -2, deltaMode: 0 })
    const larger = wheelZoomFactor({ deltaY: -10, deltaMode: 0 })
    expect(small).toBeGreaterThan(1)
    expect(small).toBeLessThan(1.03)
    expect(larger).toBeGreaterThan(small)
    expect(larger).toBeLessThan(1.12)
    expect(wheelZoomFactor({ deltaY: 10, deltaMode: 0 })).toBeCloseTo(1 / larger)
    expect(wheelZoomFactor({ deltaY: 0, deltaMode: 0 })).toBe(1)
  })

  it('never changes zoom by more than 25% in one event', () => {
    expect(wheelZoomFactor({ deltaY: -49, deltaMode: 0 })).toBeLessThanOrEqual(1.25)
  })
})
