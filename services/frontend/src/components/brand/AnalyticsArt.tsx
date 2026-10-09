const bars = [38, 56, 44, 72, 60, 88, 66, 94, 78, 58, 82, 70]
const line = [30, 42, 36, 58, 50, 64, 61, 78, 72, 86, 80, 92]

function linePath(values: number[], w: number, h: number) {
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - (v / 100) * h] as const)
  return pts
    .map(([x, y], i) => {
      if (i === 0) return `M${x},${y}`
      const [px, py] = pts[i - 1]
      const cx = (px + x) / 2
      return `C${cx},${py} ${cx},${y} ${x},${y}`
    })
    .join(' ')
}

export function AnalyticsArt({ className }: { className?: string }) {
  const lp = linePath(line, 520, 150)
  return (
    <svg viewBox="0 0 760 900" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="aa-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="aa-bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.12" />
        </linearGradient>
        <pattern id="aa-grid" width="38" height="38" patternUnits="userSpaceOnUse">
          <path d="M38 0H0V38" fill="none" stroke="#fff" strokeOpacity="0.05" />
        </pattern>
        <filter id="aa-soft">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>

      <rect width="760" height="900" fill="url(#aa-grid)" />

      <g transform="translate(70 120) rotate(-8 310 330)" filter="url(#aa-soft)">
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${i * 184} 0)`}>
            <rect width="168" height="96" rx="22" fill="#fff" fillOpacity="0.06" stroke="#fff" strokeOpacity="0.12" />
            <rect x="20" y="22" width="64" height="8" rx="4" fill="#fff" fillOpacity="0.28" />
            <rect x="20" y="44" width={[92, 70, 104][i]} height="20" rx="8" fill="#fff" fillOpacity="0.55" />
            <rect x="20" y="72" width="44" height="7" rx="3.5" fill="#fff" fillOpacity="0.2" />
            <circle cx="140" cy="30" r="12" fill="#fff" fillOpacity="0.12" />
          </g>
        ))}

        <g transform="translate(0 124)">
          <rect width="352" height="250" rx="26" fill="#fff" fillOpacity="0.05" stroke="#fff" strokeOpacity="0.12" />
          <rect x="24" y="24" width="120" height="10" rx="5" fill="#fff" fillOpacity="0.4" />
          <rect x="24" y="44" width="76" height="7" rx="3.5" fill="#fff" fillOpacity="0.18" />
          {[0, 1, 2, 3].map((i) => (
            <line key={i} x1="24" x2="328" y1={100 + i * 40} y2={100 + i * 40} stroke="#fff" strokeOpacity="0.07" strokeDasharray="3 6" />
          ))}
          {bars.map((v, i) => (
            <rect key={i} x={30 + i * 25} y={222 - v * 1.2} width="13" height={v * 1.2} rx="6.5" fill="url(#aa-bar)" fillOpacity={i === 7 ? 1 : 0.7} />
          ))}
        </g>

        <g transform="translate(368 124)">
          <rect width="184" height="250" rx="26" fill="#fff" fillOpacity="0.05" stroke="#fff" strokeOpacity="0.12" />
          <circle cx="92" cy="112" r="54" fill="none" stroke="#fff" strokeOpacity="0.1" strokeWidth="16" />
          <circle
            cx="92"
            cy="112"
            r="54"
            fill="none"
            stroke="#fff"
            strokeOpacity="0.6"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 54 * 0.72} ${2 * Math.PI * 54}`}
            transform="rotate(-90 92 112)"
          />
          <rect x="66" y="104" width="52" height="16" rx="7" fill="#fff" fillOpacity="0.55" />
          <rect x="28" y="194" width="128" height="8" rx="4" fill="#fff" fillOpacity="0.2" />
          <rect x="28" y="212" width="92" height="8" rx="4" fill="#fff" fillOpacity="0.14" />
        </g>

        <g transform="translate(0 398)">
          <rect width="552" height="220" rx="26" fill="#fff" fillOpacity="0.05" stroke="#fff" strokeOpacity="0.12" />
          <rect x="24" y="24" width="140" height="10" rx="5" fill="#fff" fillOpacity="0.4" />
          <g transform="translate(16 50)">
            <path d={`${lp} L520,150 L0,150 Z`} fill="url(#aa-area)" />
            <path d={lp} fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="3" strokeLinecap="round" />
            <circle cx={(7 / 11) * 520} cy={150 - 0.78 * 150} r="7" fill="#fff" fillOpacity="0.9" />
            <circle cx={(7 / 11) * 520} cy={150 - 0.78 * 150} r="16" fill="#fff" fillOpacity="0.12" />
          </g>
        </g>
      </g>
    </svg>
  )
}
