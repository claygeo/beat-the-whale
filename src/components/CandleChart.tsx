import { useEffect, useRef } from 'react'
import {
  createChart,
  ColorType,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { Candle } from '../lib/hyperliquid'

/** A whale ghost marker (entry/exit), decoupled from lightweight-charts' types. */
export interface WhaleMarker {
  time: number
  aboveBar: boolean
  up: boolean
  text: string
}

/** Premium dark candlestick chart (GeoBridge palette). Reveals candles up to `visibleTick`. */
export function CandleChart({
  candles,
  visibleTick,
  markers = [],
}: {
  candles: Candle[]
  visibleTick: number
  markers?: WhaleMarker[]
}) {
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

  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    const m: SeriesMarker<UTCTimestamp>[] = markers.map((x) => ({
      time: x.time as UTCTimestamp,
      position: x.aboveBar ? 'aboveBar' : 'belowBar',
      color: '#fbbf24',
      shape: x.up ? 'arrowUp' : 'arrowDown',
      text: x.text,
    }))
    series.setMarkers(m)
  }, [markers])

  return <div ref={containerRef} className="h-full w-full" />
}
