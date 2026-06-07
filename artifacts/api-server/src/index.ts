import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS parties (
        id serial PRIMARY KEY,
        name text NOT NULL,
        name_bn text,
        phone text,
        address text,
        type text NOT NULL DEFAULT 'customer',
        balance numeric(12,2) NOT NULL DEFAULT 0,
        last_transaction_date text,
        created_at timestamp DEFAULT now() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cash_entries (
        id serial PRIMARY KEY,
        date text NOT NULL,
        amount numeric(12,2) NOT NULL,
        type text NOT NULL,
        category text NOT NULL,
        party_id integer,
        buyer_name text,
        sale_items text,
        note text,
        created_at timestamp DEFAULT now() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ledger_entries (
        id serial PRIMARY KEY,
        party_id integer NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
        date text NOT NULL,
        type text NOT NULL,
        amount numeric(12,2) NOT NULL,
        description text NOT NULL,
        item_type text,
        item_qty_kg numeric(10,3),
        price_per_kg numeric(10,2),
        running_balance numeric(12,2) NOT NULL DEFAULT 0,
        created_at timestamp DEFAULT now() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS batches (
        id serial PRIMARY KEY,
        batch_code text NOT NULL UNIQUE,
        start_date text NOT NULL,
        expected_end_date text NOT NULL,
        sugar_input_kg numeric(10,3) NOT NULL,
        trays_count integer NOT NULL,
        worker_name text,
        notes text,
        status text NOT NULL DEFAULT 'boiling',
        grade1_output_kg numeric(10,3),
        grade2_output_kg numeric(10,3),
        byproduct_kg numeric(10,3),
        loss_kg numeric(10,3),
        yield_percent numeric(5,2),
        harvested_at timestamp,
        created_at timestamp DEFAULT now() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS stock_transactions (
        id serial PRIMARY KEY,
        item_type text NOT NULL,
        tx_type text NOT NULL,
        quantity_kg numeric(10,3) NOT NULL,
        date text NOT NULL,
        note text,
        batch_id integer REFERENCES batches(id),
        created_at timestamp DEFAULT now() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS stock_rates (
        id serial PRIMARY KEY,
        item_type text NOT NULL UNIQUE,
        rate_per_kg numeric(12,2) NOT NULL DEFAULT 0,
        updated_at timestamp DEFAULT now() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS image_uploads (
        id serial PRIMARY KEY,
        original_filename text NOT NULL,
        storage_path text NOT NULL,
        mime_type text NOT NULL,
        size_bytes integer NOT NULL,
        status text NOT NULL DEFAULT 'queued',
        extracted_rows_json text,
        page_summary_json text,
        failure_reason text,
        committed_at timestamp,
        committed_entry_ids text,
        created_at timestamp DEFAULT now() NOT NULL
      );
    `);
    logger.info("Database tables ready");
  } finally {
    client.release();
  }
}

runMigrations()
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Migration failed, aborting startup");
    process.exit(1);
  });
