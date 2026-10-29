import fs from 'node:fs';
import path from 'node:path';
import cluster from 'node:cluster';
import { bench } from "../lib/bench.js";
import { randomGenerators, KeyGenerator } from "../lib/keygen.js";

function setup(initialCount, rand) {
  return async function (Corestore, Hyperbee) {
    const sandbox = path.join(import.meta.dirname, '../sandbox')
    fs.rmSync(sandbox, { recursive: true, force: true })
    fs.mkdirSync(sandbox, { recursive: true })

    this.store = new Corestore(sandbox)
    this.bee = new Hyperbee(this.store, { 
      core: this.store.get({ name: 'docindex' }),
    })
    await this.bee.ready()

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
  };
}

async function teardown() {
  // Commit remaining ops, if any - ideally count should divide cleanly by
  // batch size to avoid this.
  if (this.ops > 0) {
    console.warn('Flushing remaining ops as final batch (', this.ops, ')');
    await this.batch.flush();
  }
  await this.bee.close();
  await this.store.close();

  this.result.keyDistribution = this.keygen.buckets;
}

const group = {name: 'Delete', results: []};
const results = group.results;
for (const rand of randomGenerators) {
  for (const batchSize of [1000, 100, 1]) {
    results.push(await bench({
      group: group.name,
      name: `${rand.name} key generator, batch size = ${batchSize}`,
      count: 100_000,
      warmup: 20_000,
      setup: setup(120_000, rand),
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
    }));
  }
}

if (cluster.isWorker) {
  process.send(group);
}

process.exit(0);
