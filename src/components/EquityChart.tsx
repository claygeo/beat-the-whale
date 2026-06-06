import { useEffect, useRef } from 'react'
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { SimPoint } from '../lib/replay'

/** The race: your equity (ice blue) vs the whale's (amber), drawn against replay tick. */
export function EquityChart({ you, whale }: { you: SimPoint[]; whale: SimPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const youRef = useRef<ISeriesApi<'Line'> | null>(null)
  const whaleRef = useRef<ISeriesApi<'Line'> | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#07070e' },
        textColor: '#6b6b7b',
        fontFamily: '"Geist Mono", ui-monospace, monospace',
        attributionLogo: false,
      },
      grid: { vertLines: { color: 'transparent' }, horzLines: { color: '#12121e' } },
      rightPriceScale: { borderColor: '#1a1a2a' },
      timeScale: { visible: false, borderVisible: false },
      crosshair: { mode: 0 },
      handleScroll: false,
      handleScale: false,
    })
    whaleRef.current = chart.addLineSeries({
      color: '#fbbf24',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    })
    youRef.current = chart.addLineSeries({
      color: '#4a9eff',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    })
    chartRef.current = chart
    return () => {
      chart.remove()
      chartRef.current = null
      youRef.current = null
      whaleRef.current = null
    }
  }, [])

  useEffect(() => {
    const toData = (pts: SimPoint[]): LineData[] =>
      pts.map((p) => ({ time: (p.tick + 1) as UTCTimestamp, value: p.equity }))
    youRef.current?.setData(toData(you))
    whaleRef.current?.setData(toData(whale))
  }, [you, whale])

  return <div ref={containerRef} className="h-full w-full" />
}
