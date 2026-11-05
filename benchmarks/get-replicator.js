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

async function setup(sandbox, Corestore, Hyperbee) {
  this.keygen = new KeyGenerator(rand.generate);
  this.result.keyGenerator = rand.name;
  this.keys = [];
  this.i = 0;

  this.writerStore = new Corestore(path.join(sandbox, 'writer'));
  const writerCore = this.writerStore.get({ name: 'docindex' });
  await writerCore.ready()

  this.readerStore = new Corestore(path.join(sandbox, 'reader'));
  const readerCore = this.writerStore.get({ name: 'docindex' });
  await readerCore.ready()

  this.writer = new Hyperbee(this.writerStore, {core: writerCore}); 
  this.reader = new Hyperbee(this.readerStore, {core: readerCore});

  const s1 = this.writer.replicate(true)
  const s2 = this.reader.replicate(false)

  s1.pipe(s2).pipe(s1)

  for (let i = 0; i < 100; i++) {
    const batch = this.writer.write();
    for (let j = 0; j < 1000; j++) {
      const key = this.keygen.generateBytes(32);
      this.keys.push(key);
      batch.tryPut(key, key);
    }
    await batch.flush();
  }

  this.bee = this.reader.checkout(this.writer.head());
}

async function teardown() {
  this.result.keyDistribution = this.keygen.buckets;
  await this.reader.close();
  await this.writer.close();
  await this.readerStore.close();
  await this.writerStore.close();
}

const result = await bench({
  name: `[Replicated get] random order, ${rand.name} key generator (100k keys)`,
  count: 1000,
  warmup: 0,
  setup,
  teardown,
  bucketSize: 500000,
  async cycle() {
    const result = await this.bee.get(this.keys[this.i++], {wait: true});
    if (!result) throw new Error('missing value');
  },
});

if (cluster.isWorker) {
  process.send(result);
}

process.exit(0);
