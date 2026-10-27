#!/usr/bin/env node

import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { bench } from "./lib/bench.js";
import { writeResults } from "./lib/write.js";
import { commitInfo } from "./lib/commit.js";
import { zeroPad } from "./lib/util.js";

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: ./run.js HYPERBEE2_REPO_PATH');
  process.exit(1);
}

const packagePath = path.resolve(dir, 'package.json');
const {name, version} = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const commit = commitInfo(dir);

console.log(`Running benchmarks for: ${dir}`);
console.log(`Commit: ${commit}`);
console.log(`Package: ${name} v${version}`);
console.log(`Runtime: ${process.title} ${process.version}`);
console.log('');

const Hyperbee = (await import(path.resolve(dir, './index.js'))).default;
const Corestore = (await import(path.resolve(dir, './node_modules/corestore/index.js'))).default;

async function defaultSetup() {
  const sandbox = path.join(import.meta.dirname, 'sandbox')
  fs.rmSync(sandbox, { recursive: true, force: true })
  fs.mkdirSync(sandbox, { recursive: true })

  this.store = new Corestore(sandbox)
  this.bee = new Hyperbee(this.store, { 
    core: this.store.get({ name: 'docindex' }),
  })
  await this.bee.ready()
}

async function defaultSetupBatch() {
  await defaultSetup.call(this);
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

async function defaultTeardown() {
  await this.bee.close();
  await this.store.close();
}

async function defaultTeardownBatch() {
  // Commit remaining ops, if any - ideally count should divide cleanly by
  // batch size to avoid this.
  if (this.ops > 0) {
    console.warn('Flushing remaining ops as final batch (', this.ops, ')');
    await this.batch.flush();
  }
  await defaultTeardown.call(this);
}

const results = [];

for (const batchSize of [1, 100, 1000]) {
  results.push(await bench({
    name: `Insert (batch size ${batchSize})`,
    count: 100_000,
    warmup: 20_000,
    setup: defaultSetupBatch,
    teardown: defaultTeardownBatch,
    async cycle() {
      await this.withBatch(batchSize, batch => {
        const key = crypto.randomBytes(32);
        batch.tryPut(key, key);
      });
    },
  }));
}

writeResults(name, version, commit, results);
