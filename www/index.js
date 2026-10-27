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

const charts = {};
for (const entry of entries) {
  for (const result of entry.results) {
    if (!charts[result.name]) {
      charts[result.name] = {
        series: [
          {
            name: 'Operation time (ns)',
            type: 'boxPlot',
            data: [],
          },
        ],
        chart: {
          type: 'boxPlot',
          height: 350,
        },
        title: {
          text: result.name,
        },
        plotOptions: {
          bar: {
            horizontal: true,
          },
          boxPlot: {
            colors: {
              upper: '#5C4742',
              lower: '#A5978B',
            },
          },
        },
        // colors: ['#14b8a6', '#3B82F6', '#f59e0b', '#ef4444'],
        //stroke: { width: 1, colors: ['#888'] },
        legend: { show: false },
        xaxis: {
          title: { text: 'Operation time (ns)' },
        },
      };
    }
    const chart = charts[result.name];
    const data = chart.series[0].data;
    const label = `${entry.package.name} ${entry.package.version} (${entry.commit.short})`;
    data.push({x: label, y: [
        result.percentiles['1'],
        result.percentiles['25'],
        result.percentiles['50'],
        result.percentiles['75'],
        result.percentiles['99'],
    ]});
  }
}

console.log(charts);

for (const name in charts) {
  const el = document.createElement('div');
  chartsDiv.appendChild(el);
  const options = charts[name];
  const chart = new ApexCharts(el, options);
  chart.render();
}
