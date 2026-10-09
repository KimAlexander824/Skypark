import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { SeriesPoint } from '@/api/analytics'
import { cn } from '@/lib/format'
import { t } from '@/i18n'

/*
 * Графики v3. Одна серия — нейтральные «пилюли», активная (наведённая или максимум) — оранжевая со штриховкой.
 * Легенда для одной серии не нужна: её называет заголовок карточки.
 */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

const ticks = (n: number) => (n <= 1 ? [0] : n <= 6 ? [...Array(n).keys()] : [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1])

function GlassTooltip({ x, y, width, title, value, sub }: { x: number; y: number; width: number; title: string; value: string; sub?: string }) {
  return (
    <div
      className="glass-strong pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-2xl px-3 py-2 text-left whitespace-nowrap"
      style={{ left: Math.min(Math.max(x, 64), width - 64), top: y - 10 }}
    >
      <div className="text-[11px] font-semibold text-mist-500">{title}</div>
      <div className="tabular text-sm font-extrabold text-ink-900">{value}</div>
      {sub && <div className="text-[11px] font-medium text-mist-500">{sub}</div>}
    </div>
  )
}

export function PillBarChart({
  data,
  height = 250,
  format = String,
  ariaLabel,
  yTicks = 4,
}: {
  data: SeriesPoint[]
  height?: number
  format?: (v: number) => string
  ariaLabel: string
  yTicks?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const axisLeft = 34
  const axisBottom = 22
  const plotW = Math.max(0, width - axisLeft)
  const top = 48 // место под подсказку над столбцом
  const plotH = height - axisBottom - top
  const rawMax = Math.max(1, ...data.map((d) => d.value))
  const step = Math.max(1, Math.ceil(rawMax / yTicks))
  const max = step * yTicks
  const slot = data.length ? plotW / data.length : 0
  const barW = Math.max(6, Math.min(28, slot * 0.62))
  const maxIdx = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0)
  const active = hover ?? maxIdx

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }} onMouseLeave={() => setHover(null)} role="img" aria-label={ariaLabel}>
      {width > 0 && (
        <>
          {/* сетка и ось Y — приглушённые */}
          {Array.from({ length: yTicks + 1 }, (_, i) => {
            const y = top + plotH - (i / yTicks) * plotH
            return (
              <div key={i} className="absolute right-0 left-0 flex items-center" style={{ top: y - 7 }}>
                <span className="tabular w-[30px] text-right text-[10.5px] font-semibold text-mist-400">{i * step}</span>
                <span className={cn('ml-1 h-px flex-1', i === 0 ? 'bg-mist-300' : 'border-t border-dashed border-mist-200')} />
              </div>
            )
          })}
          {data.map((d, i) => {
            const h = d.value ? Math.max(10, (d.value / max) * plotH) : 4
            const x = axisLeft + i * slot + (slot - barW) / 2
            const isActive = i === active && d.value > 0
            return (
              <div key={d.key}>
                <div
                  className={cn(
                    'absolute rounded-full transition-all duration-300 ease-[var(--ease-ios)]',
                    isActive ? 'stripes-accent shadow-[0_8px_18px_-8px_rgb(255_107_44/0.7)]' : 'bg-mist-200',
                    hover !== null && !isActive && 'opacity-70',
                  )}
                  style={{ left: x, width: barW, height: h, top: top + plotH - h }}
                />
                {/* зона наведения шире столбца */}
                <div className="absolute cursor-pointer" style={{ left: axisLeft + i * slot, width: slot, top: 0, height: plotH + top }} onMouseEnter={() => setHover(i)} />
              </div>
            )
          })}
          {ticks(data.length).map((i) => (
            <span
              key={i}
              className="tabular absolute -translate-x-1/2 text-[10.5px] font-semibold text-mist-500"
              style={{ left: axisLeft + i * slot + slot / 2, top: height - 16 }}
            >
              {data[i].label}
            </span>
          ))}
          {data[active] && data[active].value > 0 && (
            <GlassTooltip
              x={axisLeft + active * slot + slot / 2}
              y={top + plotH - (data[active].value / max) * plotH}
              width={width}
              title={data[active].label}
              value={format(data[active].value)}
            />
          )}
        </>
      )}
    </div>
  )
}

/** Плавная линия с мягкой оранжевой заливкой. */
export function GlassAreaChart({ data, height = 160, format = String, ariaLabel }: { data: SeriesPoint[]; height?: number; format?: (v: number) => string; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const axisBottom = 20
  const plotH = height - axisBottom
  const max = Math.max(1, ...data.map((d) => d.value)) * 1.15
  const step = data.length > 1 ? width / (data.length - 1) : 0
  const pts = data.map((d, i) => [data.length > 1 ? i * step : width / 2, plotH - (d.value / max) * (plotH - 12)] as const)

  // сглаживание (catmull-rom → bezier)
  const path = pts
    .map(([x, y], i) => {
      if (i === 0) return `M${x},${y}`
      const [x0, y0] = pts[i - 1]
      const [xp, yp] = pts[i - 2] ?? pts[i - 1]
      const [xn, yn] = pts[i + 1] ?? [x, y]
      const c1x = x0 + (x - xp) / 6
      const c1y = Math.min(plotH, y0 + (y - yp) / 6)
      const c2x = x - (xn - x0) / 6
      const c2y = Math.min(plotH, y - (yn - y0) / 6)
      return `C${c1x},${c1y} ${c2x},${c2y} ${x},${y}`
    })
    .join(' ')
  const area = pts.length ? `${path} L${pts[pts.length - 1][0]},${plotH} L${pts[0][0]},${plotH} Z` : ''

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left
    setHover(step ? Math.max(0, Math.min(data.length - 1, Math.round(x / step))) : 0)
  }

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && data.length > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="overflow-visible">
          <defs>
            <linearGradient id="area-accent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ff6b2c" stopOpacity="0.28" />
              <stop offset="1" stopColor="#ff6b2c" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1={0} x2={width} y1={plotH + 0.5} y2={plotH + 0.5} className="stroke-mist-300" />
          <path d={area} fill="url(#area-accent)" />
          <path d={path} fill="none" stroke="#ff6b2c" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          {hover !== null && (
            <>
              <line x1={pts[hover][0]} x2={pts[hover][0]} y1={0} y2={plotH} className="stroke-mist-400" strokeDasharray="3 4" />
              <circle cx={pts[hover][0]} cy={pts[hover][1]} r={6} fill="#ff6b2c" className="stroke-white" strokeWidth={3} />
            </>
          )}
          {ticks(data.length).map((i) => (
            <text
              key={i}
              x={pts[i][0]}
              y={height - 4}
              textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
              className="tabular fill-mist-500 text-[10.5px] font-semibold"
            >
              {data[i].label}
            </text>
          ))}
        </svg>
      )}
      {hover !== null && data[hover] && <GlassTooltip x={pts[hover][0]} y={pts[hover][1]} width={width} title={data[hover].label} value={format(data[hover].value)} />}
    </div>
  )
}

/** Кольцевая диаграмма с зазорами и скруглёнными концами. Подписи и значения — в легенде рядом. */
export function Donut({
  segments,
  size = 168,
  thickness = 18,
  center,
}: {
  segments: { key: string; value: number; color: string }[]
  size?: number
  thickness?: number
  center?: ReactNode
}) {
  const [hover, setHover] = useState<string | null>(null)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 6 : 0
  let offset = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-mist-200)" strokeWidth={thickness} />
        {segments.map((s) => {
          const len = (s.value / total) * c
          const dash = Math.max(0, len - gap)
          const el = (
            <circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={hover === s.key ? thickness + 4 : thickness}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset - gap / 2}
              className="cursor-pointer transition-[stroke-width] duration-200"
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
            />
          )
          offset += len
          return s.value > 0 ? el : null
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>
    </div>
  )
}

/* ---------- Сравнение с прошлым периодом ---------- */

/**
 * Посещения по интервалам: в каждом слоте рядом стоят прошлый период (серая «пилюля»)
 * и текущий (оранжевая). Будущие часы сегодняшнего дня — пустые пунктирные дорожки,
 * текущий час отмечен точкой под подписью. Наведение подсвечивает слот и показывает сравнение.
 */
export function ComparisonBarChart({
  current,
  previous,
  height = 250,
  format = String,
  ariaLabel,
  yTicks = 4,
}: {
  current: SeriesPoint[]
  previous: SeriesPoint[]
  height?: number
  format?: (v: number) => string
  ariaLabel: string
  yTicks?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const axisLeft = 28
  const axisBottom = 26
  const top = 10
  const plotH = height - axisBottom - top
  const n = current.length
  const rawMax = Math.max(1, ...current.map((d) => d.value), ...previous.slice(0, n).map((d) => d.value))
  const step = Math.max(1, Math.ceil(rawMax / yTicks))
  const max = step * yTicks
  const slotW = n ? Math.max(0, width - axisLeft) / n : 0
  const barW = Math.max(4, Math.min(16, slotW * 0.26))
  // последний наступивший слот — «сейчас» (только когда в серии есть будущие слоты)
  const firstFuture = current.findIndex((d) => d.future)
  const nowIndex = firstFuture > 0 ? firstFuture - 1 : -1
  // подписи: все, если помещаются, иначе — равномерная выборка
  const labelEvery = slotW >= 38 ? 1 : Math.ceil(38 / Math.max(1, slotW))
  const pct = (v: number) => `${(v / max) * 100}%`

  return (
    <div ref={ref} role="img" aria-label={ariaLabel} className="relative w-full select-none" style={{ height }} onMouseLeave={() => setHover(null)}>
      {/* сетка и ось Y */}
      {Array.from({ length: yTicks + 1 }, (_, i) => (
        <div key={i} className="pointer-events-none absolute inset-x-0 flex h-0 items-center" style={{ top: top + plotH - (i / yTicks) * plotH }}>
          <span className="tabular w-[22px] text-right text-[10.5px] font-semibold text-mist-400">{i * step}</span>
          <span className={cn('ml-1.5 flex-1', i === 0 ? 'h-px bg-mist-300' : 'border-t border-dashed border-mist-200')} />
        </div>
      ))}

      {width > 0 && (
        <div className="absolute inset-y-0 right-0 flex" style={{ left: axisLeft }}>
          {current.map((d, i) => {
            const prev = previous[i]
            const active = hover === i
            const isNow = i === nowIndex
            const showLabel = i % labelEvery === 0 || isNow
            return (
              <div key={d.key} className="relative flex-1" onMouseEnter={() => setHover(i)}>
                {/* подсветка слота */}
                <div
                  className={cn('absolute inset-x-[10%] rounded-xl bg-mist-200/50 transition-opacity duration-200', active ? 'opacity-100' : 'opacity-0')}
                  style={{ top, height: plotH }}
                />
                <div className="absolute inset-x-0 flex items-end justify-center gap-[3px]" style={{ top, height: plotH }}>
                  {d.future ? (
                    <span className="h-full rounded-full bg-mist-200/40" style={{ width: barW * 2 + 3 }} />
                  ) : (
                    <>
                      <span
                        className="animate-bar-grow origin-bottom rounded-full bg-mist-300 transition-[height] duration-500 ease-[var(--ease-ios)]"
                        style={{ width: barW, height: prev?.value ? pct(prev.value) : 4, animationDelay: `${i * 25}ms` }}
                      />
                      <span
                        className={cn(
                          'animate-bar-grow origin-bottom rounded-full transition-[height,filter] duration-500 ease-[var(--ease-ios)]',
                          d.value ? (active || isNow ? 'stripes-accent' : 'bg-linear-to-b from-accent-400 to-accent-500') : 'bg-accent-200',
                          active && 'brightness-110',
                        )}
                        style={{ width: barW, height: d.value ? pct(d.value) : 4, animationDelay: `${i * 25 + 60}ms` }}
                      />
                    </>
                  )}
                </div>
                {showLabel && (
                  <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
                    <span
                      className={cn(
                        'tabular text-[10.5px] whitespace-nowrap',
                        isNow ? 'font-extrabold text-accent-600' : d.future ? 'font-semibold text-mist-300' : active ? 'font-bold text-ink-900' : 'font-semibold text-mist-500',
                      )}
                    >
                      {d.label}
                    </span>
                    <span className={cn('mt-0.5 size-1 rounded-full', isNow ? 'bg-accent-500' : 'bg-transparent')} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {hover !== null && current[hover] && (
        <div
          className="glass-strong pointer-events-none absolute z-10 -translate-x-1/2 animate-fade-in rounded-2xl px-3 py-2 whitespace-nowrap"
          style={{ left: Math.min(Math.max(axisLeft + slotW * (hover + 0.5), 90), width - 90), top: -6 }}
        >
          <div className="text-[11px] font-semibold text-mist-500">
            {current[hover].label}
            {hover === nowIndex && <span className="ml-1 text-accent-600">{t('· сейчас')}</span>}
          </div>
          {current[hover].future ? (
            <div className="mt-0.5 text-[12.5px] font-bold text-mist-500">{t('Ещё не наступило')}</div>
          ) : (
            <div className="mt-0.5 flex items-center gap-1.5 text-[13px] font-extrabold text-ink-900">
              <span className="size-2 rounded-full bg-accent-500" />
              {format(current[hover].value)}
            </div>
          )}
          {previous[hover] && (
            <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-mist-500">
              <span className="size-2 rounded-full bg-mist-300" />
              {format(previous[hover].value)} · {previous[hover].label}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
