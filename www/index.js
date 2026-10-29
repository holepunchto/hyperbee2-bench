import index from "./results/index" with { type: 'text' };

const MAX_FILES = 6;
const FORMAT = 5;

const entries = [];

const files = index
  // Remove empty lines
  .replace(/\n+/g, '\n')
  .replace(/^\n|\n$/g, '')
  // Split lines
  .split('\n')
  // Take last MAX_FILES entries
  .slice(-MAX_FILES);

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

const chartGroups = {};
for (const entry of entries) {

  for (const group of entry.groups) {
    if (!chartGroups[group.name]) {
      chartGroups[group.name] = {};
    }
    const charts = chartGroups[group.name];

    for (const result of group.results) {
      if (!(result.name in charts)) {
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
              text: 'Operation time (ns)',
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
              text: 'Key distribution (first nibble)'
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
          },
          peakMemory: {
            series: [
              { name: 'Max heap used', data: [], },
              { name: 'Max external', data: [], },
              { name: 'Max array buffers', data: [], },
            ],
            xaxis: {
              categories: [],
            },
            chart: {
              type: 'bar',
              height: 350,
              stacked: true,
            },
            title: {
              text: 'Peak memory use in each category (bytes)',
            },
            plotOptions: {
              bar: {
                horizontal: true,
                // Give each catgory its own color
                // distributed: true
              },
            },
            legend: { show: false },
          },
          diskUse: {
            series: [
              { name: 'Disk use (bytes)', data: [], },
            ],
            chart: {
              type: 'bar',
              height: 350,
            },
            title: {
              text: 'Disk use (bytes)',
            },
            plotOptions: {
              bar: {
                horizontal: true,
                // Give each catgory its own color
                distributed: true
              },
            },
            legend: { show: false },
          },
        };
      }
      const chart = charts[result.name];
      const durations = chart.durations.series[0].data;
      const label = `${entry.package.version} (${entry.commit.short})`;
      durations.push({x: label, y: { density: result.buckets }});
      const peakMemory = chart.peakMemory.series;
      peakMemory[0].data.push(result.memory.peakHeapUsed);
      peakMemory[1].data.push(result.memory.peakExternal);
      peakMemory[2].data.push(result.memory.peakArrayBuffers);
      chart.peakMemory.xaxis.categories.push(label);
      const diskUse = chart.diskUse.series[0].data;
      diskUse.push({x: label, y: result.disk});
    }
  }
}

for (const group in chartGroups) {
  const h2 = document.createElement('h2');
  h2.textContent = group;
  chartsDiv.appendChild(h2);
  const charts = chartGroups[group];

  for (const name in charts) {
    const section = document.createElement('section');
    const h3 = document.createElement('h3');
    h3.textContent = `[${group}] ${name}`;
    section.appendChild(h3);
    chartsDiv.appendChild(section);
    for (const options of Object.values(charts[name])) {
      const el = document.createElement('div');
      section.appendChild(el);
      const c = new ApexCharts(el, options);
      c.render();
    }
  }
}
