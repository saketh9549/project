const { connectDB, mongoose } = require('./db');
const Catalog = require('../models/Catalog');
const Index = require('../models/Index');
const Summary = require('../models/Summary');

const runTest = async () => {
  console.log('[Test] Starting MongoDB & Mongoose validation tests (Restructured)...');
  
  // 1. Connect
  await connectDB();
  
  try {
    // Drop collections to clear legacy index cache
    try {
      await mongoose.connection.db.dropCollection('medias');
    } catch (e) {}
    try {
      await mongoose.connection.db.dropCollection('chapters');
    } catch (e) {}
    try {
      await mongoose.connection.db.dropCollection('summaries');
    } catch (e) {}
    console.log('[Info] Dropped legacy collection indexes to ensure fresh constraints.');

    // Ensure Mongoose constructs all defined schema indexes in MongoDB before testing
    await Catalog.ensureIndexes();
    await Index.ensureIndexes();
    await Summary.ensureIndexes();
    console.log('[Info] Indexes synchronized successfully.');

    // Clean up any residual test items in Catalog
    await Catalog.deleteMany({ ownerEmail: 'test_architect@summarix.io' });
    
    console.log('\n--- Test 1: Creating Catalog Document ---');
    const catalog = await Catalog.create({
      fileName: 'test_lecture.mp4',
      fileType: 'video',
      filePath: '/abs/path/to/test_lecture.mp4',
      duration: 120.5,
      uploadStatus: 'uploaded',
      history: ['uploaded via drag-and-drop', 'assigned database slot'],
      ownerEmail: 'test_architect@summarix.io'
    });
    console.log(`[Success] Catalog document created. ID: ${catalog._id}`);
    console.log(`[Info] File type: ${catalog.fileType}, History length: ${catalog.history.length}`);
    
    console.log('\n--- Test 2: Creating Valid Index Document ---');
    const index = await Index.create({
      catalogId: catalog._id,
      startTime: 0,
      endTime: 60,
      topicTitle: 'Introduction to Datastores',
      text: 'Today we will discuss local vs cloud databases.',
      status: 'raw'
    });
    console.log(`[Success] Index document created. ID: ${index._id}`);
    
    console.log('\n--- Test 3: Pre-Save Validation (Invalid Time Range) ---');
    try {
      await Index.create({
        catalogId: catalog._id,
        startTime: 100,
        endTime: 50, // Invalid: endTime <= startTime
        topicTitle: 'Invalid Index Range',
        text: 'This should fail validation.',
        status: 'raw'
      });
      console.error('[Error] Validation failed: Created index with invalid range.');
    } catch (validationErr) {
      console.log(`[Success] Validation error caught correctly: ${validationErr.message}`);
    }
    
    console.log('\n--- Test 4: Creating Summary Document ---');
    const summary = await Summary.create({
      catalogId: catalog._id,
      indexId: index._id,
      rawTextChunk: index.text,
      summaryText: 'Introduced local vs cloud database paradigms.',
      bulletPoints: ['paradigms compared', 'introductory remarks']
    });
    console.log(`[Success] Summary document created. ID: ${summary._id}`);
    
    console.log('\n--- Test 5: Unique Compound Index Validation (Duplicate Summary) ---');
    try {
      await Summary.create({
        catalogId: catalog._id,
        indexId: index._id, // Duplicate reference
        rawTextChunk: index.text,
        summaryText: 'This duplicate should fail index validation.',
        bulletPoints: []
      });
      console.error('[Error] Unique index failed: Created duplicate summary.');
    } catch (indexErr) {
      console.log(`[Success] Unique index error caught correctly: ${indexErr.message}`);
    }
    
    // Clean up test data
    console.log('\n--- Clean up: Removing Mock Documents ---');
    const deletedIndexes = await Index.deleteMany({ catalogId: catalog._id });
    const deletedSummaries = await Summary.deleteMany({ catalogId: catalog._id });
    await catalog.deleteOne();
    console.log(`[Success] Cleaned up ${deletedIndexes.deletedCount} index points, ${deletedSummaries.deletedCount} summaries, and the catalog record.`);
    
  } catch (err) {
    console.error(`[Fatal Test Error] Test execution encountered an error: ${err.message}`);
  } finally {
    await mongoose.connection.close();
    console.log('\n[Test] Closed database connection. Verification completed.');
  }
};

runTest();
