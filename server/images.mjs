export function cleanJpeg(bytes) {
  const invalid = () => {
    throw new Error("Choose a JPG, PNG or WebP image that opens normally.");
  };
  if (
    bytes.length < 32 ||
    bytes.length > 300000 ||
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    bytes.at(-2) !== 255 ||
    bytes.at(-1) !== 217
  )
    invalid();
  let offset = 2,
    width = 0,
    height = 0,
    scan = false;
  const parts = [bytes.slice(0, 2)];
  while (offset < bytes.length - 2) {
    const start = offset;
    if (bytes[offset++] !== 255) invalid();
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 218) {
      scan = true;
      parts.push(bytes.slice(start));
      break;
    }
    if (marker === 216 || marker === 217 || marker === 0) invalid();
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length - 2) invalid();
    if ([192, 193, 194].includes(marker)) {
      if (length < 8) invalid();
      height = bytes[offset + 3] * 256 + bytes[offset + 4];
      width = bytes[offset + 5] * 256 + bytes[offset + 6];
    }
    if (!((marker >= 224 && marker <= 239) || marker === 254))
      parts.push(bytes.slice(start, offset + length));
    offset += length;
  }
  if (
    !scan ||
    !width ||
    !height ||
    width > 2500 ||
    height > 3000 ||
    width * height > 4000000
  )
    invalid();
  const output = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    output.set(part, at);
    at += part.length;
  }
  return { bytes: output, width, height };
}
