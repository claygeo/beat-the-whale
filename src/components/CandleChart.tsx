import { useEffect, useRef } from 'react'
import {
  createChart,
  ColorType,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { Candle } from '../lib/hyperliquid'

/** Premium dark candlestick chart (GeoBridge palette). Reveals candles up to `visibleTick`. */
export function CandleChart({ candles, visibleTick }: { candles: Candle[]; visibleTick: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const chartRef = useRef<IChartApi | null>(null)

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
      grid: { vertLines: { color: '#12121e' }, horzLines: { color: '#12121e' } },
      rightPriceScale: { borderColor: '#1a1a2a' },
      timeScale: { borderColor: '#1a1a2a', timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    })
    const series = chart.addCandlestickSeries({
      upColor: '#34d399',
      downColor: '#f87171',
      borderUpColor: '#34d399',
      borderDownColor: '#f87171',
      wickUpColor: '#34d399',
      wickDownColor: '#f87171',
    })
    chartRef.current = chart
    seriesRef.current = series
    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    const data: CandlestickData[] = candles.slice(0, visibleTick + 1).map((c) => ({
      time: Math.floor(c.t / 1000) as UTCTimestamp,
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
    }))
    series.setData(data)
  }, [candles, visibleTick])

  return <div ref={containerRef} className="h-full w-full" />
}
