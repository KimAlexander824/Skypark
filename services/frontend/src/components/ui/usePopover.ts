import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react'

export interface PopoverPos {
  left: number
  top: number
  width: number
  placement: 'bottom' | 'top'
}

/**
 * Позиция выпадающей панели относительно кнопки (через portal, position: fixed),
 * чтобы панель не обрезалась внутри модалок и карточек с overflow.
 */
export function usePopover(
  triggerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  { panelHeight, minWidth = 0, align = 'left', panelWidth }: { panelHeight: number; minWidth?: number; align?: 'left' | 'right'; panelWidth?: number },
) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<PopoverPos>()

  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    const vh = window.innerHeight
    const below = vh - r.bottom
    const placement = below < panelHeight + 16 && r.top > below ? 'top' : 'bottom'
    // панель всегда остаётся внутри экрана
    const rawTop = placement === 'bottom' ? r.bottom + 6 : r.top - 6 - panelHeight
    const top = Math.max(8, Math.min(rawTop, vh - panelHeight - 8))
    const width = panelWidth ?? Math.max(r.width, minWidth)
    let left = align === 'right' ? r.right - width : r.left
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
    setPos({ left, width, top, placement })
  }, [triggerRef, panelHeight, minWidth, align, panelWidth])

  useLayoutEffect(() => {
    if (!open) return
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, triggerRef, panelRef])

  return { open, setOpen, pos }
}
