#!/usr/bin/env node

import process from 'node:process';
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

const Corestore = (await import(path.resolve(dir, './node_modules/corestore/index.js'))).default;
const Hyperbee = (await import(path.resolve(dir, './index.js'))).default;

const groups = [];

async function runBenchmark(filename) {
  await (await import(filename)).run(Corestore, Hyperbee, groups);
}

await runBenchmark('./benchmarks/insert.js');
await runBenchmark('./benchmarks/delete.js');

writeResults(name, version, commit, groups);
