import { formatMorningDate } from '../lib/flowers'
import type { CoupleProfile, MorningDelivery } from '../types'
import { Bouquet } from './Bouquet'
import './Home.css'

interface HomeProps {
  profile: CoupleProfile
  todaysFromPartner: MorningDelivery | null
  inbox: MorningDelivery[]
  sent: MorningDelivery[]
  openedIds: string[]
  onCompose: () => void
  onOpen: (d: MorningDelivery) => void
  onInbox: () => void
}

export function Home({
  profile,
  todaysFromPartner,
  inbox,
  sent,
  openedIds,
  onCompose,
  onOpen,
  onInbox,
}: HomeProps) {
  const unread = inbox.filter((d) => !openedIds.includes(d.id)).length
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <section className="home">
      <header className="home__top">
        <div>
          <p className="home__brand">Morning Blooms</p>
          <h1 className="home__hello">
            {greeting}, {profile.yourName}
          </h1>
        </div>
        <button type="button" className="home__code" title="Your couple code">
          {profile.coupleCode}
        </button>
      </header>

      <div className="home__hero">
        {todaysFromPartner ? (
          <>
            <p className="home__eyebrow">Today from {todaysFromPartner.fromName}</p>
            <Bouquet flowers={todaysFromPartner.flowers} size="md" />
            <h2 className="home__headline">Your morning is waiting.</h2>
            <p className="home__sub">
              A bouquet, a note, and a video — opened with love on{' '}
              {formatMorningDate(todaysFromPartner.createdAt)}.
            </p>
            <button type="button" className="btn btn--primary" onClick={() => onOpen(todaysFromPartner)}>
              Open today&apos;s morning
            </button>
          </>
        ) : (
          <>
            <p className="home__eyebrow">For {profile.partnerName}</p>
            <Bouquet flowers={['peony', 'rose', 'lavender']} size="md" blooming />
            <h2 className="home__headline">Send a morning across the miles.</h2>
            <p className="home__sub">
              Pick flowers, write a note, add your video — then share the link so{' '}
              {profile.partnerName} can open it instantly on Android or iPhone.
            </p>
            <button type="button" className="btn btn--primary" onClick={onCompose}>
              Create today&apos;s delivery
            </button>
          </>
        )}
      </div>

      <div className="home__actions">
        {todaysFromPartner && (
          <button type="button" className="btn btn--ghost" onClick={onCompose}>
            Send one back
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={onInbox}>
          Inbox {unread > 0 ? `(${unread} new)` : `(${inbox.length})`}
        </button>
      </div>

      {sent[0] && (
        <p className="home__footnote">
          Last sent to {sent[0].toName} · {formatMorningDate(sent[0].createdAt)}
        </p>
      )}
    </section>
  )
}
