import index from "./results/index" with { type: 'text' };

const MAX_FILES = 6;
const FORMAT = 2;

const entries = [];

const files = index
  // Remove empty lines
  .replace(/\n+/g, '\n')
  .replace(/^\n|\n$/g, '')
  // Split lines
  .split('\n')
  // Take last MAX_FILES entries
  .slice(-MAX_FILES);

console.log(files)

for (const f of files) {
  const url = `./results/${f}`;
  const res = await fetch(url);
  if (res.status !== 200) {
    console.warn(`Skipping file in index ${url} (status code ${res.status})`);
    continue;
  }
  const data = await res.json();
  // Skip incompatible file formats
  if (data.format === FORMAT) {
    entries.push(data);
  } else {
    console.warn(`Skipping incompatible file format ${url} (version ${data.format})`);
  }
}

const chartsDiv = document.getElementById('charts');

console.log(entries);

const comparing = document.getElementById('comparing');

for (const entry of entries) {
  const dl = document.createElement('dl');
  comparing.appendChild(dl);

  function metadata(key, value) {
    const dt = document.createElement('dt');
    dt.textContent = key + ':';
    dl.appendChild(dt);
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.appendChild(dd);
  }

  metadata('Runtime', `${entry.runtime.name} ${entry.runtime.version}`);
  metadata('Package', `${entry.package.name} v${entry.package.version}`);
  metadata('Commit', entry.commit.full)
  metadata('Date', entry.date)
}

// TODO: repeated in lib/util.js
function zeroPad(s, n) {
  s = '' + s
  n -= s.length
  while (n > 0) {
    s = '0' + s
    n--;
  }
  return s;
}

const charts = {};
const keyDistributions = {};
for (const entry of entries) {
  for (const result of entry.results) {
    if (!charts[result.name]) {
      const keyCategories = [];
      for (let i = 0; i < 16; i++) {
        keyCategories.push(i.toString(16));
      }
      charts[result.name] = {
        durations: {
          series: [
            {
              name: 'Operation time (ns)',
              data: [],
            },
          ],
          chart: {
            type: 'violin',
            height: 350,
          },
          title: {
            text: result.name,
          },
          plotOptions: {
            bar: {
              horizontal: true,
              // Give each catgory its own color
              distributed: true
            },
            violin: {
              // scale each violin to its own peak regardless of sample size
              normalize: 'group',
              points: {
                // do not plot individual points on top
                show: false,
              }
            },
          },
          legend: { show: false },
          xaxis: {
            title: { text: 'Operation time (ns)' },
          },
        },
        keyDistribution: {
          series: [
            {
              name: 'Keys starting with nibble',
              data: result.keyDistribution,
              color: '#cccccc',
            }
          ],
          title: {
            text: `${result.name} - key distribution by first nibble`,
          },
          chart: {
            type: 'bar',
            height: 350,
          },
          dataLabels: {
            enabled: false,
          },
          xaxis: {
            categories: keyCategories
          },
          yaxis: {
            max: result.histogram.count
          }
        }
      };
    }
    const chart = charts[result.name];
    const data = chart.durations.series[0].data;
    const label = `${entry.package.version} (${entry.commit.short})`;
    data.push({x: label, y: { density: result.buckets }});

    if (!keyDistributions[result.name]) {
      keyDistributions[result.name] = result.keyDistribution;
    }
  }
}

console.log(charts);

for (const name in charts) {
  {
    const el = document.createElement('div');
    chartsDiv.appendChild(el);
    const durations = new ApexCharts(el, charts[name].durations);
    durations.render();
  }
  {
    const el = document.createElement('div');
    chartsDiv.appendChild(el);
    const keydist = new ApexCharts(el, charts[name].keyDistribution);
    keydist.render();
  }
}
