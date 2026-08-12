import { useCallback, useEffect, useMemo, useState } from 'react'
import { nanoid } from 'nanoid'
import type { CoupleProfile, FlowerId, MorningDelivery } from '../types'
import { todayKey } from '../lib/flowers'
import {
  buildShareUrl,
  decodeDelivery,
  getInbox,
  getOpenedIds,
  getProfile,
  getSent,
  markOpened,
  saveProfile,
  saveSent,
  saveToInbox,
} from '../lib/storage'

export function useCoupleApp() {
  const [profile, setProfile] = useState<CoupleProfile | null>(() => getProfile())
  const [inbox, setInbox] = useState<MorningDelivery[]>(() => getInbox())
  const [sent, setSent] = useState<MorningDelivery[]>(() => getSent())
  const [openedIds, setOpenedIds] = useState<string[]>(() => getOpenedIds())
  const [activeDelivery, setActiveDelivery] = useState<MorningDelivery | null>(null)
  const [pendingReceive, setPendingReceive] = useState<MorningDelivery | null>(null)

  useEffect(() => {
    const hash = window.location.hash.replace(/^#\/?/, '')
    if (hash.startsWith('receive/')) {
      const token = hash.slice('receive/'.length)
      const delivery = decodeDelivery(token)
      if (delivery) {
        saveToInbox(delivery)
        setInbox(getInbox())
        setPendingReceive(delivery)
        setActiveDelivery(delivery)
      }
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [])

  const completeOnboarding = useCallback(
    (data: Omit<CoupleProfile, 'createdAt'>) => {
      const next: CoupleProfile = { ...data, createdAt: new Date().toISOString() }
      saveProfile(next)
      setProfile(next)
    },
    [],
  )

  const todaysFromPartner = useMemo(() => {
    if (!profile) return null
    const key = todayKey()
    return (
      inbox.find(
        (d) =>
          d.dateKey === key &&
          d.fromName.toLowerCase() === profile.partnerName.toLowerCase(),
      ) ??
      inbox.find((d) => d.dateKey === key) ??
      null
    )
  }, [inbox, profile])

  const createDelivery = useCallback(
    async (input: {
      note: string
      flowers: FlowerId[]
      videoUrl: string
      videoName?: string
    }) => {
      if (!profile) throw new Error('No profile')
      const delivery: MorningDelivery = {
        id: nanoid(10),
        createdAt: new Date().toISOString(),
        dateKey: todayKey(),
        fromName: profile.yourName,
        toName: profile.partnerName,
        note: input.note.trim(),
        flowers: input.flowers,
        videoUrl: input.videoUrl.trim(),
        videoName: input.videoName,
      }
      saveSent(delivery)
      setSent(getSent())
      const shareUrl = buildShareUrl(delivery)
      return { delivery, shareUrl }
    },
    [profile],
  )

  const openDelivery = useCallback((delivery: MorningDelivery) => {
    markOpened(delivery.id)
    setOpenedIds(getOpenedIds())
    setActiveDelivery(delivery)
  }, [])

  const clearActive = useCallback(() => {
    setActiveDelivery(null)
    setPendingReceive(null)
  }, [])

  return {
    profile,
    inbox,
    sent,
    openedIds,
    activeDelivery,
    pendingReceive,
    todaysFromPartner,
    completeOnboarding,
    createDelivery,
    openDelivery,
    clearActive,
    setActiveDelivery,
  }
}
