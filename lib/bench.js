import { createHistogram, timerify, PerformanceObserver, performance } from 'node:perf_hooks'
import { memoryUsage, stdout } from 'node:process';
import path from 'node:path';

function clearLine() {
  stdout.write('\x1b[1G\x1b[1K');
}

function printStep(name, current, total) {
  if (current > 0) {
    clearLine();
  }
  stdout.write(`  ${name}: ${current}/${total}`)
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

function _pickUnit(units, value, divisor = 1000, separator = '') {
  let m = 0
  while (m < units.length - 1 && value >= divisor) {
    value = value / divisor
    m++
  }
  return value.toPrecision(3) + separator + units[m]
}

function formatNanoseconds(value) {
  return _pickUnit(['ns', 'µs', 'ms', 's'], value)
}

export async function bench({group, name, setup, teardown, cycle, count, warmup, bucketSize=1000}) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: ./run.js HYPERBEE2_REPO_PATH');
    process.exit(1);
  }

  const Corestore = (await import(path.resolve(dir, './node_modules/corestore/index.js'))).default;
  const Hyperbee = (await import(path.resolve(dir, './index.js'))).default;

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
  await setup.call(context, Corestore, Hyperbee);

  // Note: When using Worker threads, rss will be a value that is valid for
  // the entire process, while the other fields will only refer to the
  // current thread.
  let {
    heapUsed: peakHeapUsed,
    external: peakExternal,
    arrayBuffers: peakArrayBuffers,
  } = memoryUsage();
  await repeat('warmup', warmup, cycle.bind(context));
  await repeat('cycles', count, () => {
    return wrapped.call(context);
    const {heapUsed, arrayBuffers, external} = memoryUsage();
    if (heapUsed > peakHeapUsed) peakHeapUsed = heapUsed;
    if (external > peakExternal) peakExternal = external;
    if (arrayBuffers > peakArrayBuffers) peakArrayBuffers = arrayBuffers;
  });

  await teardown.call(context);

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

  console.log(`  mean: ${formatNanoseconds(histogram.mean)}`);
  console.log(`  min: ${formatNanoseconds(histogram.min)}`);
  console.log(`  max: ${formatNanoseconds(histogram.max)}`);
  console.log(`  stddev: ${formatNanoseconds(histogram.stddev)}`);
  console.log(`  memory:`);
  console.log(`    peak heap used: ${peakHeapUsed}`);
  console.log(`    peak external: ${peakExternal}`);
  console.log(`    peak array buffers: ${peakArrayBuffers}`);
  console.log('');

  context.result.histogram = histogram;
  context.result.buckets = buckets;
  context.result.memory = {
    peakHeapUsed,
    peakExternal,
    peakArrayBuffers,
  };
  return context.result;
}
