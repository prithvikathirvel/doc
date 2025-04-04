import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGO_URI as string;
const dbName = process.env.MONGO_DB_NAME as string;

if (!mongoUri || !dbName) {
  throw new Error("Environment variables MONGO_URI and MONGO_DB_NAME must be defined.");
}

const client = new MongoClient(mongoUri);
client.connect()
  .then(() => {
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
  });

export const dbConnection = client.db(dbName);