const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const runCleanup = async () => {
  console.log('[Cleanup] Starting database cleanup...');
  
  // Use the URI from .env, or fallback to local
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/summarix_test';
  
  try {
    const conn = await mongoose.connect(MONGODB_URI);
    console.log('[Cleanup] Connected successfully to database:', conn.connection.name);
    
    const client = conn.connection.client;
    
    // 1. Clean up "test" database (drop it completely)
    const testDb = client.db('test');
    try {
      console.log('[Cleanup] Dropping "test" database...');
      await testDb.dropDatabase();
      console.log('[Cleanup] Database "test" dropped successfully.');
    } catch (e) {
      console.warn('[Cleanup Warning] Could not drop "test" database:', e.message);
    }
    
    // 2. Clean up "indexes" collection inside "summarix_test" database
    const summarixTestDb = client.db('summarix_test');
    try {
      const collections = await summarixTestDb.listCollections({ name: 'indexes' }).toArray();
      if (collections.length > 0) {
        console.log('[Cleanup] Dropping duplicate "indexes" collection inside "summarix_test"...');
        await summarixTestDb.dropCollection('indexes');
        console.log('[Cleanup] Collection "indexes" dropped successfully.');
      } else {
        console.log('[Cleanup] Duplicate "indexes" collection not found in "summarix_test".');
      }
    } catch (e) {
      console.warn('[Cleanup Warning] Could not drop "indexes" collection:', e.message);
    }
    
  } catch (err) {
    console.error('[Cleanup Error] Connection or operation failed:', err.message);
  } finally {
    await mongoose.connection.close();
    console.log('[Cleanup] Database connection closed.');
  }
};

runCleanup();
