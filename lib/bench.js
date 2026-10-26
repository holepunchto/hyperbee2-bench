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

export async function bench({name, setup, teardown, cycle, count, warmup, bucketStepSize=5_000_000}) {
  console.log(`${name}`)

  const histogram = createHistogram()
  const wrapped = timerify(cycle, { histogram })
  const observer = new PerformanceObserver(() => {})
  observer.observe({ entryTypes: ['function'] })

  const context = {};
  await setup.call(context);

  await repeat('warmup', warmup, cycle.bind(context));
  await repeat('cycles', count, wrapped.bind(context));

  await teardown.call(context);

  observer.disconnect()

  console.log(`  mean: ${formatNanoseconds(histogram.mean)}`);
  console.log(`  min: ${formatNanoseconds(histogram.min)}`);
  console.log(`  max: ${formatNanoseconds(histogram.max)}`);
  console.log(`  stddev: ${formatNanoseconds(histogram.stddev)}`);
  console.log('');

  const linearBuckets = [];
  for (const [k, v] of histogram.linearBuckets(bucketStepSize)) {
    linearBuckets.push([Number(k), v]);
  }

  return {
    name,
    warmup,
    count,
    histogram,
    linearBuckets,
  };
}
