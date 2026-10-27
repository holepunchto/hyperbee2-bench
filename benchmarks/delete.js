import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { bench } from "../lib/bench.js";

export async function run(Corestore, Hyperbee, results) {

  function setup(initialCount) {
    return async function () {
      const sandbox = path.join(import.meta.dirname, '../sandbox')
      fs.rmSync(sandbox, { recursive: true, force: true })
      fs.mkdirSync(sandbox, { recursive: true })

      this.store = new Corestore(sandbox)
      this.bee = new Hyperbee(this.store, { 
        core: this.store.get({ name: 'docindex' }),
      })
      await this.bee.ready()

      // Insert initial data
      const batch = this.bee.write();
      for (let i = 0; i < initialCount; i++) {
        const key = crypto.randomBytes(32);
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
  }

  for (const batchSize of [1, 100, 1000]) {
    results.push(await bench({
      name: `Delete (batch size ${batchSize})`,
      count: 100_000,
      warmup: 20_000,
      setup: setup(120_000),
      teardown,
      async cycle() {
        await this.withBatch(batchSize, batch => {
          const key = crypto.randomBytes(32);
          batch.tryPut(key, key);
        });
      },
    }));
  }

}
