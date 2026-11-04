import { createHistogram, performance } from 'node:perf_hooks'
import { memoryUsage, stdout } from 'node:process';
import { spawnSync } from 'node:child_process';
import { formatNanoseconds, humanizeBytes } from '../www/util.js';
import path from 'node:path';
import fs from 'node:fs';

function clearLine() {
  stdout.write('\x1b[1G\x1b[1K');
}

function printStep(name, current, total) {
  if (current > 0) {
    clearLine();
  }
  stdout.write(`  ${name}: ${current}/${total} (${(current/total*100).toFixed(0)}%)`)
}

async function repeat(name, total, fn) {
  if (total === 0) return;
  let lastPrint = performance.now();
  printStep(name, 0, total);
  for (let i = 1; i <= total; i++) {
    await fn();
    const now = performance.now();
    if (i === total || now - lastPrint >= 200) {
      printStep(name, i, total);
      lastPrint = now;
    }
  }
  console.log('');
}

function splitBuckets(sortedData, bucketSize) {
  const i25 = Math.floor(sortedData.length / 4);
  const p25 = sortedData[i25];
  const p75 = sortedData[sortedData.length - i25];

  const iqr = p75 - p25;
  const lowerFence = p25 - iqr * 3;
  const upperFence = p75 + iqr * 3;

  const buckets = [];
  let i = 0;
  let end = sortedData.length;
  let count = 0;

  while (sortedData[i] < lowerFence) i++;
  while (end > 0 && sortedData[end - 1] > upperFence) end--; 

  const min = sortedData[i];
  let bucketStart = min - (min % bucketSize);

  while (i < end) {
    const bucketEnd = bucketStart + bucketSize;
    while (i < end && sortedData[i] < bucketEnd) {
      count++;
      i++;
    }
    if (count) {
      buckets.push([bucketStart, count]);
    }
    bucketStart = bucketEnd;
    count = 0;
  }
  if (count) {
    buckets.push([bucketStart, count]);
  }
  return buckets;
}

function calculateStats(durations) {
  let total = 0;
  for (let d of durations) total += d;
  const mean = total / durations.length;
  const min = durations[0];
  const max = durations[durations.length - 1];

  let totalDeviations = 0;
  for (const d of durations) {
    totalDeviations += (d - mean) ** 2;
  }
  const variance = totalDeviations / durations.length;
  const stddev = Math.sqrt(variance);

  return {mean, min, max, stddev};
}

export async function bench({name, setup, teardown, cycle, count, warmup, bucketSize=1000}) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: ./run.js HYPERBEE2_REPO_PATH');
    process.exit(1);
  }

  const Hypercore = (await import(path.resolve(dir, './node_modules/hypercore/index.js'))).default;
  const Corestore = (await import(path.resolve(dir, './node_modules/corestore/index.js'))).default;
  const Hyperbee = (await import(path.resolve(dir, './index.js'))).default;
  const sandbox = path.join(import.meta.dirname, '../sandbox')

  console.log(name);

  const durations = [];
  const wrapped = async function () {
    const start = performance.now();
    const result = await cycle.call(this);
    const duration = Math.floor((performance.now() - start) * 1000 * 1000);
    durations.push(duration);
    return result;
  };

  const context = {result: {
    name,
    warmup,
    count,
  }};

  fs.rmSync(sandbox, { recursive: true, force: true })
  fs.mkdirSync(sandbox, { recursive: true })

  if (setup) {
    await setup.call(context, sandbox, Corestore, Hyperbee);
  }

  // Note: When using Worker threads, rss will be a value that is valid for
  // the entire process, while the other fields will only refer to the
  // current thread.
  let {
    heapUsed: peakHeapUsed,
    external: peakExternal,
    arrayBuffers: peakArrayBuffers,
  } = memoryUsage();

  function checkMemory() {
    const {heapUsed, arrayBuffers, external} = memoryUsage();
    if (heapUsed > peakHeapUsed) peakHeapUsed = heapUsed;
    if (external > peakExternal) peakExternal = external;
    if (arrayBuffers > peakArrayBuffers) peakArrayBuffers = arrayBuffers;
  }

  await repeat('warmup', warmup, cycle.bind(context));
  await repeat('cycles', count, () => {
    const result = wrapped.call(context);
    checkMemory();
    return result;
  });

  if (teardown) {
    await teardown.call(context);
  }
  checkMemory();

  durations.sort((a, b) => a - b);

  const stats = calculateStats(durations);
  const buckets = splitBuckets(durations, bucketSize);

  const duOutput = spawnSync('du', ['--summarize', '--bytes', sandbox], {encoding: 'utf8'});
  if (duOutput.status !== 0) {
    console.error(duOutput.stderr);
    throw new Error('Failed to calculate sandbox disk usage');
  }
  const diskUse = Number(duOutput.stdout.match(/\d+/)[0]);

  console.log(`  mean: ${formatNanoseconds(stats.mean)}`);
  console.log(`  min: ${formatNanoseconds(stats.min)}`);
  console.log(`  max: ${formatNanoseconds(stats.max)}`);
  console.log(`  stddev: ${formatNanoseconds(stats.stddev)}`);
  if (context.result.coreSize) {
    console.log(`  core size: ${humanizeBytes(coreSize)}`);
  }
  console.log(`  disk use: ${humanizeBytes(diskUse)}`);
  console.log(`  memory use:`);
  console.log(`    peak heap used: ${humanizeBytes(peakHeapUsed)}`);
  console.log(`    peak external: ${humanizeBytes(peakExternal)}`);
  console.log(`    peak array buffers: ${humanizeBytes(peakArrayBuffers)}`);
  console.log('');

  context.result.buckets = buckets;
  context.result.disk = diskUse;
  context.result.memory = {
    peakHeapUsed,
    peakExternal,
    peakArrayBuffers,
  };
  return context.result;
}
