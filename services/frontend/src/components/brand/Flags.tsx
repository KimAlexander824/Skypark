import { useId, type ReactNode } from 'react'
import type { Lang } from '@/i18n'

/** Круглые флаги для выбора языка. Эмодзи-флаги Windows не рисует, поэтому SVG. */
function RoundFlag({ className, children }: { className?: string; children: (clip: string) => ReactNode }) {
  const id = useId()
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <clipPath id={id}>
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>{children(id)}</g>
    </svg>
  )
}

function UzFlag({ className }: { className?: string }) {
  return (
    <RoundFlag className={className}>
      {() => (
        <>
          <rect width="24" height="24" fill="#fff" />
          <rect width="24" height="7.6" fill="#0099b5" />
          <rect y="16.4" width="24" height="7.6" fill="#1eb53a" />
          <rect y="7.6" width="24" height="0.7" fill="#ce1126" />
          <rect y="15.7" width="24" height="0.7" fill="#ce1126" />
          <circle cx="6.4" cy="3.9" r="2.5" fill="#fff" />
          <circle cx="7.3" cy="3.9" r="2.2" fill="#0099b5" />
          {[10.2, 12.4, 14.6].map((x) => (
            <circle key={x} cx={x} cy="3.2" r="0.55" fill="#fff" />
          ))}
          {[12.4, 14.6].map((x) => (
            <circle key={x} cx={x} cy="5.3" r="0.55" fill="#fff" />
          ))}
        </>
      )}
    </RoundFlag>
  )
}

function RuFlag({ className }: { className?: string }) {
  return (
    <RoundFlag className={className}>
      {() => (
        <>
          <rect width="24" height="8" fill="#fff" />
          <rect y="8" width="24" height="8" fill="#0039a6" />
          <rect y="16" width="24" height="8" fill="#d52b1e" />
        </>
      )}
    </RoundFlag>
  )
}

function GbFlag({ className }: { className?: string }) {
  return (
    <RoundFlag className={className}>
      {() => (
        <>
          <rect width="24" height="24" fill="#012169" />
          <path d="M0 0 24 24M24 0 0 24" stroke="#fff" strokeWidth="4.4" />
          <path d="M0 0 24 24M24 0 0 24" stroke="#c8102e" strokeWidth="1.5" />
          <path d="M12 0v24M0 12h24" stroke="#fff" strokeWidth="6.4" />
          <path d="M12 0v24M0 12h24" stroke="#c8102e" strokeWidth="3.6" />
        </>
      )}
    </RoundFlag>
  )
}

export function LangFlag({ lang, className }: { lang: Lang; className?: string }) {
  if (lang === 'uz') return <UzFlag className={className} />
  if (lang === 'en') return <GbFlag className={className} />
  return <RuFlag className={className} />
}
