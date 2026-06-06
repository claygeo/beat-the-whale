import { useEffect, useState } from 'react'
import { tickAtElapsed } from '../lib/replay'

/**
 * Webview-safe replay clock: the current tick is derived from elapsed wall-clock time
 * (`performance.now() - start`), NEVER from accumulated frames. If a WKWebView throttles or
 * pauses rAF, the tick still lands correctly the moment it resumes — zero drift.
 *
 * `runKey` bumps to restart the clock from 0.
 */
export function useReplayClock(opts: {
  running: boolean
  msPerTick: number
  tickCount: number
  runKey: number
}): number {
  const { running, msPerTick, tickCount, runKey } = opts
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!running) return
    const start = performance.now()
    let raf = 0
    let stopped = false
    const sample = () => {
      const t = tickAtElapsed(performance.now() - start, msPerTick, tickCount)
      setTick(t)
      if (t >= tickCount) stopped = true
    }
    const loop = () => {
      if (stopped) return
      sample()
      if (!stopped) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    // Fallback driver: rAF is paused/throttled in backgrounded tabs and the X in-app
    // webview, which would freeze the replay. setInterval keeps firing; each sample is
    // recomputed from wall-clock, so it stays in lockstep with rAF — zero drift.
    const interval = window.setInterval(() => {
      if (stopped) {
        window.clearInterval(interval)
        return
      }
      sample()
    }, 200)
    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(interval)
    }
  }, [running, msPerTick, tickCount, runKey])

  return tick
}
