#!/usr/bin/env node

import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { bench } from "./lib/bench.js";

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: ./run.js HYPERBEE2_REPO_PATH');
  process.exit(1);
}

const packagePath = path.resolve(dir, 'package.json');
const {name, version} = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const commit = execSync('git rev-parse --verify HEAD', {
  encoding: 'utf8',
  cwd: dir,
}).trim();

const commitShort = execSync('git rev-parse --verify --short HEAD', {
  encoding: 'utf8',
  cwd: dir,
}).trim();

console.log(`Running benchmarks for: ${dir}`);
console.log(`Commit: ${commit}`);
console.log(`Package: ${name} v${version}`);
console.log(`Runtime: ${process.title} ${process.version}`);
console.log('');

function zeroPad(s, n) {
  s = '' + s
  n -= s.length
  while (n > 0) {
    s = '0' + s
    n--;
  }
  return s;
}

const now = new Date();

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

async function defaultTeardown() {
  await this.bee.close();
  await this.store.close();
}

const results = [];

results.push(await bench({
  name: 'Insert (batch size 1)',
  count: 100_000,
  warmup: 20_000,
  setup: defaultSetup,
  teardown: defaultTeardown,
  async cycle() {
    const batch = this.bee.write();
    const key = crypto.randomBytes(32);
    batch.tryPut(key, key);
    await batch.flush();
  },
}));

results.push(await bench({
  name: 'Insert (batch size 100)',
  count: 100_000,
  warmup: 20_000,
  setup() {
    defaultSetup.call(this);
    this.i = 0;
    this.batch = this.bee.write();
  },
  teardown: defaultTeardown,
  async cycle() {
    if (++this.i % 100 === 0) {
      await this.batch.flush();
      this.batch = this.bee.write();
    }
    const key = crypto.randomBytes(32);
    this.batch.tryPut(key, key);
  },
}));

results.push(await bench({
  name: 'Insert (batch size 1000)',
  count: 100_000,
  warmup: 20_000,
  setup() {
    defaultSetup.call(this);
    this.i = 0;
    this.batch = this.bee.write();
  },
  teardown: defaultTeardown,
  async cycle() {
    if (++this.i % 1000 === 0) {
      await this.batch.flush();
      this.batch = this.bee.write();
    }
    const key = crypto.randomBytes(32);
    this.batch.tryPut(key, key);
  },
}));

const year = zeroPad(now.getFullYear(), 4);
const month = zeroPad(now.getMonth() + 1, 2);
const day = zeroPad(now.getDate(), 2)
const date = `${year}${month}${day}`

const hr = zeroPad(now.getHours(), 2)
const min = zeroPad(now.getMinutes(), 2)
const sec = zeroPad(now.getSeconds(), 2)
const time = `${hr}${min}${sec}`

const resultsDir = path.join(import.meta.dirname, 'www/results')
fs.mkdirSync(resultsDir, { recursive: true })

const outputFile = `${date}_${time}_${name}_v${version}_${commitShort}.json`;
const outputPath = path.resolve(resultsDir, outputFile);
console.log(`Writing: ${path.relative(process.cwd(), outputPath)}`);

fs.writeFileSync(outputPath, JSON.stringify({
  format: 1,
  date: now.toISOString(),
  package: {
    name,
    version,
  },
  runtime: {
    name: process.title,
    version: process.version,
  },
  commit,
  results,
}));

const lockPath = path.resolve(resultsDir, "index.lock");
const indexPath = path.resolve(resultsDir, "index");
fs.openSync(lockPath, 'ax');
try {
  console.log(`Appending entry to: ${path.relative(process.cwd(), indexPath)}`);
  fs.appendFileSync(indexPath, `${outputFile}\n`);
} finally {
  fs.rmSync(lockPath)
}
