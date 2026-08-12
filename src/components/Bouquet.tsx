import { getFlower } from '../lib/flowers'
import type { FlowerId } from '../types'
import './Bouquet.css'

interface BouquetProps {
  flowers: FlowerId[]
  blooming?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function Bouquet({ flowers, blooming = true, size = 'lg' }: BouquetProps) {
  const picks = flowers.length ? flowers : (['rose', 'peony', 'tulip'] as FlowerId[])

  return (
    <div className={`bouquet bouquet--${size} ${blooming ? 'bouquet--bloom' : ''}`} aria-hidden>
      <div className="bouquet__glow" />
      <svg className="bouquet__svg" viewBox="0 0 320 360" role="img">
        <defs>
          <linearGradient id="wrap" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E8C9B0" />
            <stop offset="100%" stopColor="#C9A88A" />
          </linearGradient>
          <linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7A8F5E" />
            <stop offset="100%" stopColor="#4F6140" />
          </linearGradient>
        </defs>

        {/* stems */}
        {picks.map((id, i) => {
          const x = 160 + (i - (picks.length - 1) / 2) * 22
          return (
            <path
              key={`stem-${id}-${i}`}
              className="bouquet__stem"
              d={`M${x} 300 C${x - 8} 240, ${x + 6} 180, ${x} 120`}
              stroke="url(#leaf)"
              strokeWidth="3.5"
              fill="none"
              style={{ animationDelay: `${0.1 + i * 0.08}s` }}
            />
          )
        })}

        {/* wrap */}
        <path
          className="bouquet__wrap"
          d="M95 250 C120 210, 200 210, 225 250 L190 330 C170 350, 150 350, 130 330 Z"
          fill="url(#wrap)"
          opacity="0.95"
        />
        <path
          d="M132 328 C160 348, 188 328, 188 328"
          stroke="#A88468"
          strokeWidth="2"
          fill="none"
          opacity="0.55"
        />

        {/* leaves */}
        <ellipse className="bouquet__leaf" cx="118" cy="220" rx="28" ry="14" fill="url(#leaf)" transform="rotate(-35 118 220)" />
        <ellipse className="bouquet__leaf" cx="208" cy="230" rx="26" ry="13" fill="url(#leaf)" transform="rotate(40 208 230)" />

        {/* blooms */}
        {picks.map((id, i) => {
          const flower = getFlower(id)
          const [c1, c2, c3] = flower.colors
          const x = 160 + (i - (picks.length - 1) / 2) * 42
          const y = 108 - Math.abs(i - (picks.length - 1) / 2) * 6
          return (
            <g
              key={`bloom-${id}-${i}`}
              className="bouquet__bloom"
              style={{ animationDelay: `${0.15 + i * 0.12}s`, transformOrigin: `${x}px ${y}px` }}
            >
              <circle cx={x} cy={y} r="28" fill={c2} opacity="0.35" />
              {[0, 60, 120, 180, 240, 300].map((angle) => {
                const rad = (angle * Math.PI) / 180
                const px = x + Math.cos(rad) * 16
                const py = y + Math.sin(rad) * 16
                return (
                  <ellipse
                    key={angle}
                    cx={px}
                    cy={py}
                    rx="14"
                    ry="20"
                    fill={c1}
                    transform={`rotate(${angle + 90} ${px} ${py})`}
                    opacity="0.92"
                  />
                )
              })}
              <circle cx={x} cy={y} r="10" fill={c3} />
              <circle cx={x - 2} cy={y - 2} r="3.5" fill={c2} opacity="0.7" />
            </g>
          )
        })}
      </svg>
      <div className="bouquet__petals">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className={`bouquet__petal bouquet__petal--${i + 1}`} />
        ))}
      </div>
    </div>
  )
}
