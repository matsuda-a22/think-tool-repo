import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { migrate } from "drizzle-orm/neon-http/migrator"

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL!)
    const db = drizzle(sql)
    await migrate(db, { migrationsFolder: "./lib/db/migrations" })
    return NextResponse.json({ ok: true, message: "Migrations applied successfully" })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
