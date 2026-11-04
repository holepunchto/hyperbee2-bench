import path from 'node:path';
import cluster from 'node:cluster';
import { bench } from "../lib/bench.js";
import { randomGenerators, KeyGenerator } from "../lib/keygen.js";
import simulator from 'replication-simulator';

const { Replicator, Network } = simulator;

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
  this.net = new Network()

  this.writerStore = new Corestore(path.join(sandbox, 'writer'));
  const writerCore = this.writerStore.get({ name: 'docindex' });
  await writerCore.ready()

  this.readerStore = new Corestore(path.join(sandbox, 'reader'));
  const readerCore = this.readerStore.get({ key: writerCore.key });
  await readerCore.ready()

  const swarm1 = this.net.swarm()
  const swarm2 = this.net.swarm()

  swarm1.on('connection', conn => writerCore.replicate(conn));
  swarm2.on('connection', conn => readerCore.replicate(conn));

  await swarm1.join(writerCore.discoveryKey)
  await swarm2.join(readerCore.discoveryKey)

  // TODO: this is set very slow for testing
  this.interval = setInterval(() => this.net.tick(), 1000);

  this.writer = new Hyperbee(this.writerStore, {core: writerCore}); 
  this.reader = new Hyperbee(this.readerStore, {
    core: readerCore,
    // key: writerCore.key,
    writable: false,
    wait: true,
  });

  for (let i = 0; i < 100; i++) {
    const batch = this.writer.write();
    for (let j = 0; j < 1000; j++) {
      const key = this.keygen.generateBytes(32);
      this.keys.push(key);
      batch.tryPut(key, key);
    }
    await batch.flush();
  }

  await this.net.flush();
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
  bucketSize: 100,
  async cycle() {
    const result = await this.reader.get(this.keys[this.i++], {wait: true});
    if (!result) throw new Error('missing value');
  },
});

if (cluster.isWorker) {
  process.send(result);
}

process.exit(0);
