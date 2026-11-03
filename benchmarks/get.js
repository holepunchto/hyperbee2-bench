import path from 'node:path';
import cluster from 'node:cluster';
import { bench } from "../lib/bench.js";
import { randomGenerators, KeyGenerator } from "../lib/keygen.js";

let rand;
for (const r of randomGenerators) {
  if (r.name === process.argv[3]) {
    rand = r;
  }
}

async function setup(store, bee, sandbox) {
  this.store = store;
  this.bee = bee;
  this.keygen = new KeyGenerator(rand.generate);
  this.result.keyGenerator = rand.name;
  this.keys = [];
  this.i = 0;

  for (let i = 0; i < 100; i++) {
    const batch = this.bee.write();
    for (let j = 0; j < 1000; j++) {
      const key = this.keygen.generateBytes(32);
      this.keys.push(key);
      batch.tryPut(key, key);
    }
    await batch.flush();
  }
}

async function teardown() {
  this.result.keyDistribution = this.keygen.buckets;
}

const result = await bench({
  name: `[Get] random order, ${rand.name} key generator (100k keys)`,
  count: 80_000,
  warmup: 20_000,
  setup,
  teardown,
  bucketSize: 100,
  async cycle() {
    await this.bee.get(this.keys[this.i++]);
  },
});

if (cluster.isWorker) {
  process.send(result);
}

process.exit(0);
