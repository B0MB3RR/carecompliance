const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(1);
});

/**
 * Convenience query wrapper. Always pass parameterised values ($1, $2...)
 * to avoid SQL injection - never interpolate raw strings into query text.
 */
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  if (process.env.NODE_ENV === 'development') {
    const duration = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log('executed query', { text, duration, rows: res.rowCount });
  }
  return res;
}

module.exports = { pool, query };
