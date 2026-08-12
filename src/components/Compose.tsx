import { useMemo, useState } from 'react'
import { FLOWERS, MAX_FLOWERS } from '../lib/flowers'
import type { CoupleProfile, FlowerId, MorningDelivery } from '../types'
import { Bouquet } from './Bouquet'
import './Compose.css'

interface ComposeProps {
  profile: CoupleProfile
  onBack: () => void
  onCreated: (delivery: MorningDelivery, shareUrl: string) => void
  createDelivery: (input: {
    note: string
    flowers: FlowerId[]
    videoUrl: string
    videoName?: string
  }) => Promise<{ delivery: MorningDelivery; shareUrl: string }>
}

export function Compose({ profile, onBack, onCreated, createDelivery }: ComposeProps) {
  const [flowers, setFlowers] = useState<FlowerId[]>(['rose', 'peony', 'tulip'])
  const [note, setNote] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoName, setVideoName] = useState<string | undefined>()
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const canSend = note.trim().length > 2 && flowers.length > 0 && (videoUrl.trim() || localPreview)

  const previewFlowers = useMemo(() => flowers, [flowers])

  function toggleFlower(id: FlowerId) {
    setFlowers((prev) => {
      if (prev.includes(id)) return prev.filter((f) => f !== id)
      if (prev.length >= MAX_FLOWERS) return prev
      return [...prev, id]
    })
  }

  function onVideoFile(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('video/')) {
      setError('Please choose a video file.')
      return
    }
    if (file.size > 40 * 1024 * 1024) {
      setError('Keep videos under 40MB, or paste a Drive / YouTube link instead.')
      return
    }
    setError('')
    const url = URL.createObjectURL(file)
    setLocalPreview(url)
    setVideoUrl(url)
    setVideoName(file.name)
  }

  async function handleSend() {
    if (!canSend) return
    setBusy(true)
    setError('')
    try {
      const finalVideo = videoUrl.trim()
      if (!finalVideo) {
        setError('Add a video link or upload a short clip.')
        setBusy(false)
        return
      }
      const isLocalClip = finalVideo.startsWith('blob:')
      const { delivery, shareUrl: url } = await createDelivery({
        note,
        flowers,
        videoUrl: isLocalClip ? '' : finalVideo,
        videoName,
      })
      // Local clips stay on this phone for your preview; share link carries bouquet + note.
      if (isLocalClip) {
        delivery.videoUrl = finalVideo
      }
      setShareUrl(url)
      onCreated(delivery, url)
    } catch {
      setError('Could not create this morning. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Copy failed — long-press the link to copy.')
    }
  }

  async function nativeShare() {
    if (!shareUrl) return
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Morning Blooms',
          text: `${profile.yourName} sent you a morning bouquet and note.`,
          url: shareUrl,
        })
      } catch {
        // user cancelled
      }
    } else {
      await copyLink()
    }
  }

  if (shareUrl) {
    return (
      <section className="compose compose--done">
        <button type="button" className="compose__back" onClick={onBack}>
          ← Home
        </button>
        <Bouquet flowers={previewFlowers} size="md" />
        <h1>Ready to send</h1>
        <p>
          Share this link with {profile.partnerName}. On Android or iPhone it opens right in the
          browser — they can also Add to Home Screen for an app-like icon.
        </p>
        <div className="compose__linkbox">{shareUrl}</div>
        {videoUrl.startsWith('blob:') && (
          <p className="compose__hint">
            Tip: also send your video file in WhatsApp / Telegram so they can watch it. Paste a Drive
            link next time to keep everything in one open.
          </p>
        )}
        <div className="compose__actions">
          <button type="button" className="btn btn--primary" onClick={nativeShare}>
            Share with {profile.partnerName}
          </button>
          <button type="button" className="btn btn--ghost" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="compose">
      <button type="button" className="compose__back" onClick={onBack}>
        ← Back
      </button>
      <header className="compose__header">
        <p className="compose__eyebrow">Morning for {profile.partnerName}</p>
        <h1>Compose today&apos;s delivery</h1>
      </header>

      <div className="compose__preview">
        <Bouquet flowers={previewFlowers} size="sm" blooming={false} />
      </div>

      <fieldset className="compose__flowers">
        <legend>Choose up to {MAX_FLOWERS} flowers</legend>
        <div className="compose__flower-grid">
          {FLOWERS.map((f) => {
            const selected = flowers.includes(f.id)
            return (
              <button
                key={f.id}
                type="button"
                className={`compose__flower ${selected ? 'is-selected' : ''}`}
                onClick={() => toggleFlower(f.id)}
                aria-pressed={selected}
              >
                <span
                  className="compose__swatch"
                  style={{ background: `linear-gradient(135deg, ${f.colors[1]}, ${f.colors[0]})` }}
                />
                <span className="compose__flower-name">{f.name}</span>
                <span className="compose__flower-meaning">{f.meaning}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <label className="compose__label">
        Your note
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={5}
          placeholder={`Good morning, ${profile.partnerName}…`}
          maxLength={800}
        />
        <span className="compose__count">{note.length}/800</span>
      </label>

      <div className="compose__video">
        <p className="compose__label">Your video</p>
        <p className="compose__hint">
          Best for long-distance: paste an unlisted YouTube or Google Drive link. You can also upload
          a short clip to preview here.
        </p>
        <input
          type="url"
          value={videoUrl.startsWith('blob:') ? '' : videoUrl}
          onChange={(e) => {
            setLocalPreview(null)
            setVideoName(undefined)
            setVideoUrl(e.target.value)
          }}
          placeholder="https://youtube.com/... or Drive link"
        />
        <label className="compose__file">
          <input
            type="file"
            accept="video/*"
            capture="user"
            onChange={(e) => onVideoFile(e.target.files?.[0])}
          />
          {videoName ? `Selected: ${videoName}` : 'Or record / upload a clip'}
        </label>
        {(localPreview || (videoUrl && !videoUrl.startsWith('blob:'))) && (
          <video
            className="compose__player"
            src={localPreview || videoUrl}
            controls
            playsInline
          />
        )}
      </div>

      {error && <p className="compose__error">{error}</p>}

      <button
        type="button"
        className="btn btn--primary"
        disabled={!canSend || busy}
        onClick={handleSend}
      >
        {busy ? 'Wrapping bouquet…' : 'Create & get share link'}
      </button>
    </section>
  )
}
