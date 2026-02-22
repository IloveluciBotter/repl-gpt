import { db } from "./db";
import { sql } from "drizzle-orm";
import { getEmbeddingConfig } from "./services/embedding";
import { logger } from "./middleware/logger";

export async function initDatabase(): Promise<void> {
  const { dimension } = getEmbeddingConfig();

  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

    await db.execute(
      sql.raw(
        `ALTER TABLE corpus_chunks ADD COLUMN IF NOT EXISTS embedding vector(${dimension})`
      )
    );

    logger.info({ message: `Database extensions initialized (pgcrypto, vector), embedding dimension=${dimension}` });
  } catch (error: any) {
    logger.error({ error: error.message, message: "Database initialization failed" });
    throw new Error(`Database initialization failed: ${error.message}`);
  }
}
