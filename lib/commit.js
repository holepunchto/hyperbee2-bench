import { execSync } from 'node:child_process';

export function commitInfo(dir) {
  return {
    full: execSync('git rev-parse --verify HEAD', {
      encoding: 'utf8',
      cwd: dir,
    }).trim(),
    short: execSync('git rev-parse --verify --short HEAD', {
      encoding: 'utf8',
      cwd: dir,
    }).trim(),
  };
}
