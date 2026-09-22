const { Pool, types } = require('pg');
const config = require('./config');

types.setTypeParser(1082, v => v);            // date -> 'YYYY-MM-DD'
types.setTypeParser(20, v => parseInt(v, 10)); // bigint (count) -> number

const pool = new Pool({ connectionString: config.databaseUrl });

function wrap(runner) {
  return {
    q: async (text, params) => (await runner.query(text, params)).rows,
    one: async (text, params) => (await runner.query(text, params)).rows[0] || null,
  };
}

const db = wrap(pool);

/** รันหลายคำสั่งใน transaction เดียว */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(wrap(client));
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, db, tx };
