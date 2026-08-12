import { useEffect, useMemo, useState } from 'react'
import { formatMorningDate, getFlower } from '../lib/flowers'
import type { MorningDelivery } from '../types'
import { Bouquet } from './Bouquet'
import './Reveal.css'

interface RevealProps {
  delivery: MorningDelivery
  onBack: () => void
}

type Stage = 'bouquet' | 'note' | 'video'

export function Reveal({ delivery, onBack }: RevealProps) {
  const [stage, setStage] = useState<Stage>('bouquet')
  const meanings = useMemo(
    () => delivery.flowers.map((id) => getFlower(id).name).join(' · '),
    [delivery.flowers],
  )

  useEffect(() => {
    setStage('bouquet')
  }, [delivery.id])

  const embed = useMemo(() => toEmbedUrl(delivery.videoUrl), [delivery.videoUrl])

  return (
    <section className="reveal">
      <button type="button" className="reveal__back" onClick={onBack}>
        ← Back
      </button>

      <p className="reveal__from">
        From {delivery.fromName} · {formatMorningDate(delivery.createdAt)}
      </p>

      {stage === 'bouquet' && (
        <div className="reveal__panel reveal__panel--center">
          <Bouquet flowers={delivery.flowers} size="lg" />
          <h1 className="reveal__title">For you, this morning.</h1>
          <p className="reveal__meanings">{meanings}</p>
          <button type="button" className="btn btn--primary" onClick={() => setStage('note')}>
            Read the note
          </button>
        </div>
      )}

      {stage === 'note' && (
        <div className="reveal__panel">
          <div className="reveal__letter">
            <p className="reveal__dear">Dear {delivery.toName},</p>
            <p className="reveal__note">{delivery.note}</p>
            <p className="reveal__sign">— {delivery.fromName}</p>
          </div>
          <div className="reveal__nav">
            <button type="button" className="btn btn--ghost" onClick={() => setStage('bouquet')}>
              Bouquet
            </button>
            <button type="button" className="btn btn--primary" onClick={() => setStage('video')}>
              Watch video
            </button>
          </div>
        </div>
      )}

      {stage === 'video' && (
        <div className="reveal__panel">
          <h2 className="reveal__video-title">A piece of me, for you</h2>
          {delivery.videoUrl ? (
            embed ? (
              <div className="reveal__frame">
                <iframe
                  src={embed}
                  title="Morning video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <video className="reveal__video" src={delivery.videoUrl} controls playsInline />
            )
          ) : (
            <p className="reveal__missing">
              The bouquet and note arrived — ask {delivery.fromName} to send the video file or a
              Drive / YouTube link next time so it plays here too.
            </p>
          )}
          <div className="reveal__nav">
            <button type="button" className="btn btn--ghost" onClick={() => setStage('note')}>
              Note
            </button>
            <button type="button" className="btn btn--primary" onClick={onBack}>
              Keep this morning
            </button>
          </div>
        </div>
      )}

      <div className="reveal__steps" aria-hidden>
        <span className={stage === 'bouquet' ? 'is-on' : ''} />
        <span className={stage === 'note' ? 'is-on' : ''} />
        <span className={stage === 'video' ? 'is-on' : ''} />
      </div>
    </section>
  )
}

function toEmbedUrl(url: string): string | null {
  if (!url || url.startsWith('blob:')) return null
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')

    if (host.includes('youtu.be')) {
      const id = u.pathname.split('/').filter(Boolean)[0]
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (host.includes('youtube.com')) {
      const id = u.searchParams.get('v')
      if (id) return `https://www.youtube.com/embed/${id}`
      const parts = u.pathname.split('/')
      const shortIdx = parts.indexOf('shorts')
      if (shortIdx >= 0 && parts[shortIdx + 1]) {
        return `https://www.youtube.com/embed/${parts[shortIdx + 1]}`
      }
    }
    if (host.includes('drive.google.com')) {
      const fileMatch = u.pathname.match(/\/file\/d\/([^/]+)/)
      if (fileMatch?.[1]) {
        return `https://drive.google.com/file/d/${fileMatch[1]}/preview`
      }
    }
    return null
  } catch {
    return null
  }
}
