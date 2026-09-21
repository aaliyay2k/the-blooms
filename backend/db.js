import dns from "dns"
import dotenv from "dotenv"
import mongoose from "mongoose"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, ".env") })

try {
  dns.setDefaultResultOrder("ipv4first")
  dns.setServers(["8.8.8.8", "1.1.1.1"])
} catch (_) {}

const CoupleSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    herName: { type: String, default: "" },
    hisName: { type: String, default: "" },
    week: { type: [mongoose.Schema.Types.Mixed], default: [] },
    deliveries: { type: [mongoose.Schema.Types.Mixed], default: [] },
    pushSubscriptions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    herPushSubscriptions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    notifySent: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    activity: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        appOpens: 0,
        lastOpenAt: null,
        reads: {},
      }),
    },
  },
  { timestamps: true, strict: false },
)

export const Couple = mongoose.models.Couple || mongoose.model("Couple", CoupleSchema)

let connecting = null

export function isDbReady() {
  return mongoose.connection.readyState === 1
}

export function normalizeCode(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
}

export function sortDeliveries(list) {
  return [...(list || [])].sort((a, b) => {
    const da = String(a?.dateKey || "")
    const db = String(b?.dateKey || "")
    if (da !== db) return da < db ? 1 : -1
    if (a?.part === b?.part) return 0
    return a?.part === "night" ? -1 : 1
  })
}

export async function connectDb() {
  const primary = process.env.MONGODB_URI || process.env.DATABASE_URL || ""
  const fallback = process.env.MONGODB_URI_STANDARD || ""
  if (!primary && !fallback) {
    throw new Error("Set MONGODB_URI in backend/.env (MongoDB Atlas connection string)")
  }

  if (isDbReady()) return mongoose.connection
  if (connecting) return connecting

  mongoose.set("strictQuery", true)

  const opts = {
    serverSelectionTimeoutMS: 20000,
    maxPoolSize: 10,
    family: 4,
  }

  connecting = (async () => {
    let lastError
    for (const uri of [primary, fallback].filter(Boolean)) {
      try {
        await mongoose.connect(uri, opts)
        console.log("MongoDB connected")
        return mongoose.connection
      } catch (err) {
        lastError = err
        console.error("MongoDB attempt failed:", err.message)
        try {
          await mongoose.disconnect()
        } catch (_) {}
      }
    }
    throw lastError
  })()

  try {
    return await connecting
  } finally {
    connecting = null
  }
}

export async function findCouple(rawCode) {
  const code = normalizeCode(rawCode)
  if (!code || code.length < 4) {
    const error = new Error("Couple code must be at least 4 characters.")
    error.status = 400
    throw error
  }
  const couple = await Couple.findOne({ code })
  if (!couple) {
    const error = new Error("Wrong couple code. Ask her for the correct one.")
    error.status = 404
    throw error
  }
  return couple
}

/** She creates the space; he must join an existing code. */
export async function getOrCreateCouple(rawCode) {
  const code = normalizeCode(rawCode)
  if (!code || code.length < 4) {
    const error = new Error("Couple code must be at least 4 characters.")
    error.status = 400
    throw error
  }

  let couple = await Couple.findOne({ code })
  if (!couple) {
    couple = await Couple.create({
      code,
      herName: "",
      hisName: "",
      week: [],
      deliveries: [],
      pushSubscriptions: [],
      herPushSubscriptions: [],
      notifySent: {},
      activity: { appOpens: 0, lastOpenAt: null, reads: {} },
    })
  }
  return couple
}
