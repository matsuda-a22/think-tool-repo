import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { migrate } from "drizzle-orm/neon-http/migrator"
import { config } from "dotenv"

config({ path: ".env.local" })

async function main() {
  const sql = neon(process.env.DATABASE_URL!)
  const db = drizzle(sql)
  console.log("Running migrations...")
  await migrate(db, { migrationsFolder: "./lib/db/migrations" })
  console.log("✅ Migrations applied successfully")
  process.exit(0)
}

main().catch(err => {
  console.error("Migration failed:", err)
  process.exit(1)
})
