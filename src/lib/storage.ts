import type { CoupleProfile, MorningDelivery } from '../types'

const PROFILE_KEY = 'morning-blooms:profile'
const SENT_KEY = 'morning-blooms:sent'
const INBOX_KEY = 'morning-blooms:inbox'
const OPENED_KEY = 'morning-blooms:opened'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function getProfile(): CoupleProfile | null {
  return read<CoupleProfile | null>(PROFILE_KEY, null)
}

export function saveProfile(profile: CoupleProfile) {
  write(PROFILE_KEY, profile)
}

export function clearProfile() {
  localStorage.removeItem(PROFILE_KEY)
}

export function getSent(): MorningDelivery[] {
  return read<MorningDelivery[]>(SENT_KEY, [])
}

export function getInbox(): MorningDelivery[] {
  return read<MorningDelivery[]>(INBOX_KEY, [])
}

export function saveSent(delivery: MorningDelivery) {
  const next = [delivery, ...getSent().filter((d) => d.id !== delivery.id)]
  write(SENT_KEY, next)
}

export function saveToInbox(delivery: MorningDelivery) {
  const next = [delivery, ...getInbox().filter((d) => d.id !== delivery.id)]
  write(INBOX_KEY, next)
}

export function getOpenedIds(): string[] {
  return read<string[]>(OPENED_KEY, [])
}

export function markOpened(id: string) {
  const ids = new Set(getOpenedIds())
  ids.add(id)
  write(OPENED_KEY, [...ids])
}

export function encodeDelivery(delivery: MorningDelivery): string {
  const json = JSON.stringify(delivery)
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeDelivery(token: string): MorningDelivery | null {
  try {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/')
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
    const binary = atob(padded + pad)
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    const json = new TextDecoder().decode(bytes)
    const data = JSON.parse(json) as MorningDelivery
    if (!data?.id || !data?.note || !Array.isArray(data.flowers)) return null
    return data
  } catch {
    return null
  }
}

export function buildShareUrl(delivery: MorningDelivery): string {
  const token = encodeDelivery(delivery)
  const url = new URL(window.location.href)
  url.hash = `receive/${token}`
  return url.toString()
}
