export function zeroPad(s, n) {
  s = '' + s
  n -= s.length
  while (n > 0) {
    s = '0' + s
    n--;
  }
  return s;
}

function _pickUnit(units, value, divisor = 1000, separator = '') {
  let m = 0
  while (m < units.length - 1 && value >= divisor) {
    value = value / divisor
    m++
  }
  return value.toPrecision(3) + separator + units[m]
}

export function formatNanoseconds(value) {
  return _pickUnit(['ns', 'µs', 'ms', 's'], value)
}

export function humanizeCount(count) {
  return _pickUnit(['', 'K', 'M'], count)
}

export function humanizeBytes(bytes) {
  return _pickUnit(['B', 'KB', 'MB', 'GB'], bytes, 1024, ' ')
}

