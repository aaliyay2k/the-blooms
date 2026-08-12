import type { FlowerOption } from '../types'

export const FLOWERS: FlowerOption[] = [
  {
    id: 'rose',
    name: 'Rose',
    meaning: 'deep love',
    colors: ['#C45C6A', '#E8A0A8', '#8B3A45'],
  },
  {
    id: 'peony',
    name: 'Peony',
    meaning: 'romance',
    colors: ['#E5A4B8', '#F3D0DC', '#B86B84'],
  },
  {
    id: 'tulip',
    name: 'Tulip',
    meaning: 'care',
    colors: ['#E07A5F', '#F0A990', '#B8513A'],
  },
  {
    id: 'sunflower',
    name: 'Sunflower',
    meaning: 'warmth',
    colors: ['#E8B84A', '#F5D76E', '#C48A1A'],
  },
  {
    id: 'lavender',
    name: 'Lavender',
    meaning: 'devotion',
    colors: ['#8B7BB8', '#B5A8D4', '#5F4F8A'],
  },
  {
    id: 'daisy',
    name: 'Daisy',
    meaning: 'joy',
    colors: ['#F5F0E1', '#FFF9EF', '#E8D9B0'],
  },
  {
    id: 'lily',
    name: 'Lily',
    meaning: 'promise',
    colors: ['#F2E6F0', '#FFFFFF', '#D4B8D0'],
  },
  {
    id: 'orchid',
    name: 'Orchid',
    meaning: 'you & me',
    colors: ['#9B5B8A', '#C489B0', '#6E3A60'],
  },
]

export const MAX_FLOWERS = 5

export function getFlower(id: string): FlowerOption {
  return FLOWERS.find((f) => f.id === id) ?? FLOWERS[0]
}

export function todayKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatMorningDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export function makeCoupleCode(): string {
  const words = ['ROSE', 'DAWN', 'PETAL', 'HONEY', 'MOON', 'SOFT', 'KISS', 'BLOOM']
  const word = words[Math.floor(Math.random() * words.length)]
  const num = Math.floor(1000 + Math.random() * 9000)
  return `${word}-${num}`
}
