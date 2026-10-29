import { createHistogram, timerify, PerformanceObserver, performance } from 'node:perf_hooks'
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

export async function bench({group, name, setup, teardown, cycle, count, warmup, bucketSize=1000}) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: ./run.js HYPERBEE2_REPO_PATH');
    process.exit(1);
  }

  const Corestore = (await import(path.resolve(dir, './node_modules/corestore/index.js'))).default;
  const Hyperbee = (await import(path.resolve(dir, './index.js'))).default;
  const sandbox = path.join(import.meta.dirname, '../sandbox')

  console.log(`[${group}] ${name}`)

  const wrapped = timerify(cycle)
  const durations = [];
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      // convert ms to ns
      durations.push(Math.floor(entry.duration * 1000 * 1000));
    }
  });
  observer.observe({ entryTypes: ['function'] })

  const context = {result: {
    name,
    warmup,
    count,
  }};

  fs.rmSync(sandbox, { recursive: true, force: true })
  fs.mkdirSync(sandbox, { recursive: true })

  const store = new Corestore(sandbox)
  const core = store.get({ name: 'docindex' });
  const bee = new Hyperbee(store, {core}); 
  await bee.ready()

  await setup.call(context, store, bee, sandbox);

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

  await teardown.call(context);
  checkMemory();

  const coreSize = (await core.info()).byteLength;
  await bee.close();
  await store.close();

  observer.disconnect()

  const histogram = createHistogram()
  for (const duration of durations) {
    histogram.record(duration);
  }

  const p25 = histogram.percentile(25);
  const p75 = histogram.percentile(75);
  const iqr = p75 - p25;
  const lowerFence = p25 - iqr * 3;
  const upperFence = p75 + iqr * 3;

  const withoutOutliers = createHistogram()
  for (const duration of durations) {
    if (duration >= lowerFence && duration <= upperFence) {
      withoutOutliers.record(duration);
    }
  }

  const buckets = [];
  for (const [k, v] of withoutOutliers.linearBuckets(bucketSize)) {
    if (v) buckets.push([Number(k), v]);
  }

  const duOutput = spawnSync('du', ['--summarize', '--bytes', sandbox], {encoding: 'utf8'});
  if (duOutput.status !== 0) {
    console.error(duOutput.stderr);
    throw new Error('Failed to calculate sandbox disk usage');
  }
  const diskUse = Number(duOutput.stdout.match(/\d+/)[0]);

  console.log(`  mean: ${formatNanoseconds(histogram.mean)}`);
  console.log(`  min: ${formatNanoseconds(histogram.min)}`);
  console.log(`  max: ${formatNanoseconds(histogram.max)}`);
  console.log(`  stddev: ${formatNanoseconds(histogram.stddev)}`);
  console.log(`  core size: ${humanizeBytes(coreSize)}`);
  console.log(`  disk use: ${humanizeBytes(diskUse)}`);
  console.log(`  memory use:`);
  console.log(`    peak heap used: ${humanizeBytes(peakHeapUsed)}`);
  console.log(`    peak external: ${humanizeBytes(peakExternal)}`);
  console.log(`    peak array buffers: ${humanizeBytes(peakArrayBuffers)}`);
  console.log('');

  context.result.histogram = histogram;
  context.result.buckets = buckets;
  context.result.disk = diskUse;
  context.result.coreSize = coreSize;
  context.result.memory = {
    peakHeapUsed,
    peakExternal,
    peakArrayBuffers,
  };
  return context.result;
}
