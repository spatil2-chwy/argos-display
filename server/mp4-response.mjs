export function getMp4Response(size, rangeHeader) {
  const headers = {
    'Accept-Ranges': 'bytes',
    'Content-Length': size,
  };
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader ?? '');
  if (!match || (!match[1] && !match[2])) {
    return { status: 200, headers };
  }

  const [, first, last] = match;
  const start = first ? Number(first) : Math.max(0, size - Number(last));
  const end = first && last ? Math.min(size - 1, Number(last)) : size - 1;
  if (start >= size || start > end) {
    return {
      status: 416,
      headers: { ...headers, 'Content-Length': 0, 'Content-Range': `bytes */${size}` },
    };
  }

  return {
    status: 206,
    headers: {
      ...headers,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${size}`,
    },
    range: { start, end },
  };
}
