import dns from "dns"
import dotenv from "dotenv"
import mongoose from "mongoose"

dotenv.config()

// Windows / some networks break Node's default DNS for mongodb+srv
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
  },
  { timestamps: true },
)

export const Couple = mongoose.models.Couple || mongoose.model("Couple", CoupleSchema)

let connecting = null

export function isDbReady() {
  return mongoose.connection.readyState === 1
}

/** If SRV DNS fails, fall back to direct shard hosts from env */
function buildUri() {
  const primary = process.env.MONGODB_URI
  const fallback = process.env.MONGODB_URI_STANDARD
  return { primary, fallback }
}

export async function connectDb() {
  const { primary, fallback } = buildUri()
  if (!primary && !fallback) {
    throw new Error(
      "MONGODB_URI is missing. Add it to backend/.env (MongoDB Atlas connection string).",
    )
  }

  if (isDbReady()) return mongoose.connection
  if (connecting) return connecting

  mongoose.set("strictQuery", true)

  const options = {
    serverSelectionTimeoutMS: 20000,
    maxPoolSize: 10,
    family: 4,
  }

  connecting = (async () => {
    const attempts = [primary, fallback].filter(Boolean)
    let lastError
    for (const uri of attempts) {
      try {
        await mongoose.connect(uri, options)
        console.log("MongoDB connected (durable storage ready)")
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

export function normalizeCode(rawCode) {
  return String(rawCode || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
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

/** Only she creates a space. He must join an existing code. */
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
    })
  }
  return couple
}

export function sortDeliveries(list) {
  return [...list].sort((a, b) => {
    if (a.dateKey === b.dateKey) return a.part === "night" ? -1 : 1
    return a.dateKey < b.dateKey ? 1 : -1
  })
}
