import index from "./results/index" with { type: 'text' };

const MAX_FILES = 6;

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
  entries.push(data);
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
  metadata('Commit', entry.commit)
  metadata('Date', entry.date)
}

const charts = {};
for (const entry of entries) {
  for (const result of entry.results) {
    if (!charts[result.name]) {
      charts[result.name] = {
        data: {
          columns: [],
          type: 'bar',
        }
      };
    }
    const chart = charts[result.name];
    const columns = chart.data.columns;
    const label = `${entry.package.name} ${entry.package.version} (${entry.commit.substring(0, 7)})`;
    let i = 0;
    for (; i < columns.length; i++) {
      if (columns[i][0] === label) break;
    }
    if (i === columns.length) {
      columns.push([label]);
    }
    columns[i].push(result.histogram.mean);
  }
}

console.log(charts);

for (const name in charts) {
  const chart = charts[name];
  const h3 = document.createElement('h3');
  h3.textContent = `${name} - mean operation time (ns)`;
  chartsDiv.append(h3);
  chart.bindto = document.createElement('div');
  chartsDiv.appendChild(chart.bindto);
  bb.generate(chart);
}
