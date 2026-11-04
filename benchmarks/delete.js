import path from 'node:path';
import cluster from 'node:cluster';
import { bench } from "../lib/bench.js";
import { randomGenerators, KeyGenerator } from "../lib/keygen.js";


const batchSize = process.argv[3];

let rand;
for (const r of randomGenerators) {
  if (r.name === process.argv[4]) {
    rand = r;
  }
}

const initialCount = 120_000;

async function setup(sandbox, Corestore, Hyperbee) {
  const store = new Corestore(sandbox)
  this.core = store.get({ name: 'docindex' });
  const bee = new Hyperbee(store, {core: this.core}); 
  await bee.ready()

  this.store = store;
  this.bee = bee;
  this.keygen = new KeyGenerator(rand.generate);
  this.result.keyGenerator = rand.name;

  // Insert initial data
  const batch = this.bee.write();
  this.keys = [];
  for (let i = 0; i < initialCount; i++) {
    const key = this.keygen.generateBytes(32);
    this.keys.push(key);
    batch.tryPut(key, key);
  }
  await batch.flush();

  this.ops = 0;
  this.batch = this.bee.write();
  this.withBatch = async (size, cb) => {
    cb(this.batch);
    if (++this.ops >= size) {
      this.ops = 0;
      await this.batch.flush();
      this.batch = this.bee.write();
    }
  };
}

async function teardown() {
  // Commit remaining ops, if any - ideally count should divide cleanly by
  // batch size to avoid this.
  if (this.ops > 0) {
    console.warn('Flushing remaining ops as final batch (', this.ops, ')');
    await this.batch.flush();
  }
  this.result.keyDistribution = this.keygen.buckets;
  this.result.coreSize = (await this.core.info()).byteLength;
  await this.bee.close();
  await this.store.close();
}

const result = await bench({
  name: `[Delete] ${rand.name} key generator, batch size = ${batchSize}`,
  count: 100_000,
  warmup: 20_000,
  setup,
  teardown,
  bucketSize: ({
    1: 2000,
    100: 10,
    1000: 10,
  }[batchSize]),
  async cycle() {
    await this.withBatch(batchSize, batch => {
      const key = this.keys.pop();
      batch.tryDelete(key, key);
    });
  },
});

if (cluster.isWorker) {
  process.send(result);
}

process.exit(0);
