import fs from 'node:fs';
import path from 'node:path';
import {zeroPad} from "./util.js";

export function writeResults(name, version, commit, results) {
  const now = new Date();
  const year = zeroPad(now.getFullYear(), 4);
  const month = zeroPad(now.getMonth() + 1, 2);
  const day = zeroPad(now.getDate(), 2)
  const date = `${year}${month}${day}`

  const hr = zeroPad(now.getHours(), 2)
  const min = zeroPad(now.getMinutes(), 2)
  const sec = zeroPad(now.getSeconds(), 2)
  const time = `${hr}${min}${sec}`

  const resultsDir = path.join(import.meta.dirname, '../www/results')
  fs.mkdirSync(resultsDir, { recursive: true })

  const outputFile = `${date}_${time}_${name}_v${version}_${commit.short}.json`;
  const outputPath = path.resolve(resultsDir, outputFile);
  console.log(`Writing: ${path.relative(process.cwd(), outputPath)}`);

  fs.writeFileSync(outputPath, JSON.stringify({
    format: 2,
    date: now.toISOString(),
    package: {
      name,
      version,
    },
    runtime: {
      name: process.title,
      version: process.version,
    },
    commit,
    results,
  }));

  const lockPath = path.resolve(resultsDir, "index.lock");
  const indexPath = path.resolve(resultsDir, "index");
  fs.openSync(lockPath, 'ax');
  try {
    console.log(`Appending entry to: ${path.relative(process.cwd(), indexPath)}`);
    fs.appendFileSync(indexPath, `${outputFile}\n`);
  } finally {
    fs.rmSync(lockPath)
  }
}
