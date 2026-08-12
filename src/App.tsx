import { useEffect, useState } from 'react'
import { Compose } from './components/Compose'
import { Home } from './components/Home'
import { Inbox } from './components/Inbox'
import { Onboarding } from './components/Onboarding'
import { Reveal } from './components/Reveal'
import { useCoupleApp } from './hooks/useCoupleApp'
import type { AppView } from './types'
import './App.css'

function App() {
  const app = useCoupleApp()
  const [view, setView] = useState<AppView>('home')

  useEffect(() => {
    if (!app.profile) {
      setView('onboarding')
      return
    }
    if (app.pendingReceive) {
      setView('reveal')
    }
  }, [app.profile, app.pendingReceive])

  if (!app.profile || view === 'onboarding') {
    return (
      <div className="app-shell">
        <Onboarding onComplete={app.completeOnboarding} />
      </div>
    )
  }

  return (
    <div className="app-shell">
      {view === 'home' && (
        <Home
          profile={app.profile}
          todaysFromPartner={app.todaysFromPartner}
          inbox={app.inbox}
          sent={app.sent}
          openedIds={app.openedIds}
          onCompose={() => setView('compose')}
          onInbox={() => setView('inbox')}
          onOpen={(d) => {
            app.openDelivery(d)
            setView('reveal')
          }}
        />
      )}

      {view === 'compose' && (
        <Compose
          profile={app.profile}
          createDelivery={app.createDelivery}
          onBack={() => setView('home')}
          onCreated={(delivery) => {
            app.setActiveDelivery(delivery)
          }}
        />
      )}

      {view === 'inbox' && (
        <Inbox
          inbox={app.inbox}
          sent={app.sent}
          openedIds={app.openedIds}
          onBack={() => setView('home')}
          onOpen={(d) => {
            app.openDelivery(d)
            setView('reveal')
          }}
        />
      )}

      {view === 'reveal' && app.activeDelivery && (
        <Reveal
          delivery={app.activeDelivery}
          onBack={() => {
            app.clearActive()
            setView('home')
          }}
        />
      )}
    </div>
  )
}

export default App
