import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import type { SeriesPoint } from '@/api/analytics'
import { cn } from '@/lib/format'


function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

const tickIndexes = (n: number) => (n <= 1 ? [0] : n <= 4 ? [...Array(n).keys()] : [0, Math.floor((n - 1) / 2), n - 1])

function Tooltip({ x, y, label, value, width }: { x: number; y: number; label: string; value: string; width: number }) {
  const left = Math.min(Math.max(x, 52), width - 52)
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl bg-ink-900 px-2.5 py-1.5 text-center whitespace-nowrap text-mist-50 shadow-pop"
      style={{ left, top: y - 8 }}
    >
      <div className="text-[11px] font-medium text-snow/60">{label}</div>
      <div className="tabular text-[13px] font-bold">{value}</div>
    </div>
  )
}

export function BarChart({
  data,
  height = 120,
  format = String,
  ariaLabel,
}: {
  data: SeriesPoint[]
  height?: number
  format?: (v: number) => string
  ariaLabel: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const axisH = 18
  const plotH = height - axisH
  const max = Math.max(1, ...data.map((d) => d.value))
  const slot = data.length ? width / data.length : 0
  const gap = 2
  const barW = Math.max(2, Math.min(14, slot * 0.55))
  const maxIdx = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0)
  const ticks = tickIndexes(data.length)

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          <line x1={0} x2={width} y1={plotH + 0.5} y2={plotH + 0.5} className="stroke-ink-900/20" />
          {data.map((d, i) => {
            const h = d.value ? Math.max(4, (d.value / max) * (plotH - 14)) : 0
            const x = i * slot + (slot - barW) / 2
            const y = plotH - h
            const r = Math.min(4, barW / 2, h)
            const dim = hover !== null && hover !== i
            return (
              <g key={d.key}>
                {h > 0 && (
                  <path
                    d={`M${x},${plotH - gap / 2} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${plotH - gap / 2} Z`}
                    className={cn('fill-ink-900 transition-opacity', dim && 'opacity-35')}
                  />
                )}
                <rect x={i * slot} y={0} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            )
          })}
          {hover === null && data[maxIdx]?.value > 0 && (
            <text
              x={maxIdx * slot + slot / 2}
              y={plotH - (data[maxIdx].value / max) * (plotH - 14) - 5}
              textAnchor="middle"
              className="fill-ink-900 text-[11px] font-bold"
            >
              {format(data[maxIdx].value)}
            </text>
          )}
          {ticks.map((i) => (
            <text key={i} x={i * slot + slot / 2} y={height - 3} textAnchor="middle" className="fill-ink-900/55 text-[10.5px] font-semibold">
              {data[i].label}
            </text>
          ))}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip
          x={hover * slot + slot / 2}
          y={plotH - (data[hover].value / max) * (plotH - 14)}
          label={data[hover].label}
          value={format(data[hover].value)}
          width={width}
        />
      )}
    </div>
  )
}

export function LineChart({
  data,
  height = 120,
  format = String,
  ariaLabel,
}: {
  data: SeriesPoint[]
  height?: number
  format?: (v: number) => string
  ariaLabel: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const axisH = 18
  const padY = 10
  const plotH = height - axisH
  const max = Math.max(1, ...data.map((d) => d.value))
  const step = data.length > 1 ? width / (data.length - 1) : 0
  const pts = data.map((d, i) => [data.length > 1 ? i * step : width / 2, plotH - padY - (d.value / max) * (plotH - padY * 2)] as const)
  const path = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const ticks = tickIndexes(data.length)

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    setHover(step ? Math.max(0, Math.min(data.length - 1, Math.round(x / step))) : 0)
  }

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && data.length > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          <line x1={0} x2={width} y1={plotH + 0.5} y2={plotH + 0.5} className="stroke-ink-900/20" />
          {hover !== null && (
            <line x1={pts[hover][0]} x2={pts[hover][0]} y1={0} y2={plotH} className="stroke-ink-900/40" strokeDasharray="3 3" />
          )}
          <path d={path} fill="none" className="stroke-ink-900" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && (
            <circle cx={pts[hover][0]} cy={pts[hover][1]} r={5} className="fill-ink-900 stroke-blush-300" strokeWidth={2} />
          )}
          {ticks.map((i) => (
            <text
              key={i}
              x={pts[i][0]}
              y={height - 3}
              textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
              className="fill-ink-900/55 text-[10.5px] font-semibold"
            >
              {data[i].label}
            </text>
          ))}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip x={pts[hover][0]} y={pts[hover][1]} label={data[hover].label} value={format(data[hover].value)} width={width} />
      )}
    </div>
  )
}
