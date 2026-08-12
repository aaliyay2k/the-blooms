import { useState } from 'react'
import { makeCoupleCode } from '../lib/flowers'
import type { CoupleProfile } from '../types'
import './Onboarding.css'

interface OnboardingProps {
  onComplete: (data: Omit<CoupleProfile, 'createdAt'>) => void
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [yourName, setYourName] = useState('')
  const [partnerName, setPartnerName] = useState('')
  const [coupleCode, setCoupleCode] = useState('')
  const [role, setRole] = useState<'a' | 'b'>('a')
  const [mode, setMode] = useState<'create' | 'join'>('create')

  const canContinue =
    yourName.trim().length > 0 &&
    partnerName.trim().length > 0 &&
    (mode === 'create' || coupleCode.trim().length >= 4)

  function handleStart() {
    if (!canContinue) return
    const code =
      mode === 'create'
        ? coupleCode.trim() || makeCoupleCode()
        : coupleCode.trim().toUpperCase()
    onComplete({
      yourName: yourName.trim(),
      partnerName: partnerName.trim(),
      coupleCode: code,
      role: mode === 'create' ? 'a' : role,
    })
  }

  return (
    <section className="onboard">
      <div className="onboard__sky" />
      <div className="onboard__content">
        <p className="onboard__brand">Morning Blooms</p>
        <h1 className="onboard__title">A little garden that travels the distance.</h1>
        <p className="onboard__lede">
          Every morning, send each other a digital bouquet, a handwritten note, and a video — one
          shared space for two hearts.
        </p>

        <div className="onboard__tabs" role="tablist">
          <button
            type="button"
            className={mode === 'create' ? 'is-active' : ''}
            onClick={() => setMode('create')}
          >
            Create your space
          </button>
          <button
            type="button"
            className={mode === 'join' ? 'is-active' : ''}
            onClick={() => setMode('join')}
          >
            Join with a code
          </button>
        </div>

        <form
          className="onboard__form"
          onSubmit={(e) => {
            e.preventDefault()
            handleStart()
          }}
        >
          <label>
            Your name
            <input
              value={yourName}
              onChange={(e) => setYourName(e.target.value)}
              placeholder="e.g. Aanya"
              autoComplete="name"
              required
            />
          </label>
          <label>
            Their name
            <input
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
              placeholder="e.g. Aarav"
              required
            />
          </label>

          {mode === 'join' ? (
            <>
              <label>
                Couple code
                <input
                  value={coupleCode}
                  onChange={(e) => setCoupleCode(e.target.value.toUpperCase())}
                  placeholder="ROSE-4242"
                  required
                />
              </label>
              <fieldset className="onboard__role">
                <legend>I am</legend>
                <label className="onboard__radio">
                  <input
                    type="radio"
                    name="role"
                    checked={role === 'a'}
                    onChange={() => setRole('a')}
                  />
                  Partner A
                </label>
                <label className="onboard__radio">
                  <input
                    type="radio"
                    name="role"
                    checked={role === 'b'}
                    onChange={() => setRole('b')}
                  />
                  Partner B
                </label>
              </fieldset>
            </>
          ) : (
            <label>
              Couple code <span>(optional — we can make one)</span>
              <input
                value={coupleCode}
                onChange={(e) => setCoupleCode(e.target.value.toUpperCase())}
                placeholder="Leave blank to generate"
              />
            </label>
          )}

          <button type="submit" className="btn btn--primary" disabled={!canContinue}>
            Open our garden
          </button>
        </form>
      </div>
    </section>
  )
}
