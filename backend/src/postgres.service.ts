import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class PostgresService {
  public pool: Pool;

  constructor() {
    this.pool = new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: parseInt(process.env.DB_PORT || "5432"),
        ssl: {
    rejectUnauthorized: false
  }
    });
  }

  async query(sql: string, params?: any[]) {
    const result = await this.pool.query(sql, params);
    return result.rows;
  }
}