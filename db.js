// db.js
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: 'rakshan',
  host: 'dpg-d0j3jh7diees73cvotpg-a',
  database: 'major_project_cx19',
  password: process.env.DB_PASSWORD,  // set this in your Render environment variables
  port: 5432,
  ssl: {
    rejectUnauthorized: false
  }
});

export default pool; 
