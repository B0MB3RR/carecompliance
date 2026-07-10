/**
 * Simple migration runner: executes schema.sql against DATABASE_URL.
 * For a production system, swap this for a versioned migration tool
 * (node-pg-migrate, Prisma Migrate, Knex migrations, etc.) - this script
 * is intentionally minimal for MVP bootstrapping.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('Running schema migration...');
  try {
    await pool.query(sql);
    console.log('✔ Migration completed successfully.');
  } catch (err) {
    console.error('✘ Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
