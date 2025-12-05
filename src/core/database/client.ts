import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { env } from '../../shared/config/env';
import { PrismaClient } from '@prisma/client';

const pool = new Pool({ connectionString: env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

export default prisma;

