import { formatMorningDate, getFlower } from '../lib/flowers'
import type { MorningDelivery } from '../types'
import './Inbox.css'

interface InboxProps {
  inbox: MorningDelivery[]
  sent: MorningDelivery[]
  openedIds: string[]
  onBack: () => void
  onOpen: (d: MorningDelivery) => void
}

export function Inbox({ inbox, sent, openedIds, onBack, onOpen }: InboxProps) {
  return (
    <section className="inbox">
      <button type="button" className="inbox__back" onClick={onBack}>
        ← Home
      </button>
      <h1>Your mornings</h1>

      <h2>Received</h2>
      {inbox.length === 0 ? (
        <p className="inbox__empty">No mornings yet — when they share a link, it lands here.</p>
      ) : (
        <ul className="inbox__list">
          {inbox.map((d) => {
            const unread = !openedIds.includes(d.id)
            const names = d.flowers.map((id) => getFlower(id).name).slice(0, 3).join(', ')
            return (
              <li key={d.id}>
                <button type="button" className="inbox__item" onClick={() => onOpen(d)}>
                  <span className="inbox__item-top">
                    <strong>{d.fromName}</strong>
                    {unread && <span className="inbox__new">New</span>}
                  </span>
                  <span className="inbox__item-note">{d.note}</span>
                  <span className="inbox__item-meta">
                    {formatMorningDate(d.createdAt)} · {names}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <h2>Sent</h2>
      {sent.length === 0 ? (
        <p className="inbox__empty">You haven&apos;t sent a morning yet.</p>
      ) : (
        <ul className="inbox__list">
          {sent.map((d) => (
            <li key={d.id}>
              <button type="button" className="inbox__item" onClick={() => onOpen(d)}>
                <span className="inbox__item-top">
                  <strong>To {d.toName}</strong>
                </span>
                <span className="inbox__item-note">{d.note}</span>
                <span className="inbox__item-meta">{formatMorningDate(d.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
