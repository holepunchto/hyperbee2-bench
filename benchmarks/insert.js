import path from 'node:path';
import cluster from 'node:cluster';
import { bench } from "../lib/bench.js";
import { randomGenerators, KeyGenerator } from "../lib/keygen.js";

function setup(rand) {
  return async function (store, bee, sandbox) {
    this.store = store;
    this.bee = bee;
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

    this.keygen = new KeyGenerator(rand.generate);
    this.result.keyGenerator = rand.name;
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
}

const group = {name: 'Insert', results: []};
const results = group.results;
for (const rand of randomGenerators) {
  for (const batchSize of [1000, 100, 1]) {
    results.push(await bench({
      group: group.name,
      name: `${rand.name} key generator, batch size = ${batchSize}`,
      count: 100_000,
      warmup: 20_000,
      setup: setup(rand),
      teardown,
      bucketSize: ({
        1: 2000,
        100: 10,
        1000: 10,
      }[batchSize]),
      async cycle() {
        await this.withBatch(batchSize, batch => {
          const key = this.keygen.generateBytes(32);
          batch.tryPut(key, key);
        });
      },
    }));
  }
}

if (cluster.isWorker) {
  process.send(group);
}

process.exit(0);
