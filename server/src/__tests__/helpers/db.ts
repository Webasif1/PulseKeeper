import mongoose from 'mongoose';

/**
 * Test database helpers.
 *
 * Tests run against a real MongoDB rather than an in-memory substitute. The
 * behaviour that matters most here — partial unique indexes, text indexes, and
 * aggregation pipelines — is exactly what production relies on, and a stand-in
 * that approximates it would let real bugs through.
 *
 * Locally: `npm run db:up`. In CI: the mongo service container.
 */
const TEST_URI =
  process.env.MONGODB_URI_TEST ?? 'mongodb://localhost:27017/pulsekeeper-test';

export async function connectTestDb(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;

  try {
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 5000 });
  } catch (error) {
    throw new Error(
      `Could not reach MongoDB at ${TEST_URI}.\n` +
        'Start it with `npm run db:up`, or point MONGODB_URI_TEST at another instance.\n' +
        `Original error: ${(error as Error).message}`,
    );
  }

  // Indexes are declared on the schemas but built lazily; several tests assert
  // on constraints, so build them before anything runs.
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
}

/** Drop every document, keeping indexes, so each test starts from empty. */
export async function clearTestDb(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}

export async function disconnectTestDb(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
