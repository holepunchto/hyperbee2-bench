import { createHistogram, timerify, PerformanceObserver, performance } from 'node:perf_hooks'
import { stdout } from 'node:process';

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

export async function bench({name, setup, teardown, cycle, count, warmup, bucketSize=1000}) {
  console.log(`${name}`)

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
  await setup.call(context);

  await repeat('warmup', warmup, cycle.bind(context));
  await repeat('cycles', count, wrapped.bind(context));

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
  console.log('');

  context.result.histogram = histogram;
  context.result.buckets = buckets;
  return context.result;
}
