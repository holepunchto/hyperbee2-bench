#!/usr/bin/env node

import process from 'node:process';
import cluster from 'node:cluster';
import fs from 'node:fs';
import path from 'node:path';
import { writeResults } from "./lib/write.js";
import { commitInfo } from "./lib/commit.js";

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: ./run.js HYPERBEE2_REPO_PATH');
  process.exit(1);
}

const packagePath = path.resolve(dir, 'package.json');
const {name, version} = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const commit = commitInfo(dir);

console.log(`Running benchmarks for: ${dir}`);
console.log(`Commit: ${commit.full}`);
console.log(`Package: ${name} v${version}`);
console.log(`Runtime: ${process.title} ${process.version}`);
console.log('');

const groups = [];

function runBenchmark(filename) {
  return new Promise((resolve, reject) => {
    cluster.setupPrimary({
      exec: filename,
      args: [dir],
    });
    const worker = cluster.fork();
    worker.once('exit', resolve);
    worker.once('error', reject);
    worker.on('message', msg => {
      groups.push(msg);
    });
  });
}

await runBenchmark('./benchmarks/insert.js');
await runBenchmark('./benchmarks/delete.js');

writeResults(name, version, commit, groups);
