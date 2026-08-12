export type FlowerId =
  | 'rose'
  | 'peony'
  | 'tulip'
  | 'sunflower'
  | 'lavender'
  | 'daisy'
  | 'lily'
  | 'orchid'

export interface FlowerOption {
  id: FlowerId
  name: string
  meaning: string
  colors: [string, string, string]
}

export interface MorningDelivery {
  id: string
  createdAt: string
  dateKey: string
  fromName: string
  toName: string
  note: string
  flowers: FlowerId[]
  videoUrl: string
  videoName?: string
}

export interface CoupleProfile {
  yourName: string
  partnerName: string
  coupleCode: string
  role: 'a' | 'b'
  createdAt: string
}

export type AppView = 'onboarding' | 'home' | 'compose' | 'reveal' | 'inbox'
