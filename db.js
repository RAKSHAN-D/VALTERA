// db.js
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "MAJOR_PROJECT",
  password: "rakshan@SDM069",
  port: 5432, // default PostgreSQL port
});

export default pool;
