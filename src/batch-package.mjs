function crc32(bytes) {
  let c = -1;
  for (const b of bytes) {
    c ^= b;
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ -1) >>> 0;
}
function zipStore(files) {
  const chunks = [],
    central = [];
  let offset = 0,
    centralSize = 0;
  const header = (n) => {
    const a = new Uint8Array(n);
    return { a, v: new DataView(a.buffer) };
  };
  for (const file of files) {
    const name = new TextEncoder().encode(file.name),
      data = file.bytes,
      crc = crc32(data);
    const h = header(30);
    h.v.setUint32(0, 0x04034b50, true);
    h.v.setUint16(4, 20, true);
    h.v.setUint16(6, 0x800, true);
    h.v.setUint32(14, crc, true);
    h.v.setUint32(18, data.length, true);
    h.v.setUint32(22, data.length, true);
    h.v.setUint16(26, name.length, true);
    chunks.push(h.a, name, data);
    const d = header(46);
    d.v.setUint32(0, 0x02014b50, true);
    d.v.setUint16(4, 20, true);
    d.v.setUint16(6, 20, true);
    d.v.setUint16(8, 0x800, true);
    d.v.setUint32(16, crc, true);
    d.v.setUint32(20, data.length, true);
    d.v.setUint32(24, data.length, true);
    d.v.setUint16(28, name.length, true);
    d.v.setUint32(42, offset, true);
    central.push(d.a, name);
    centralSize += 46 + name.length;
    offset += 30 + name.length + data.length;
  }
  const end = header(22);
  end.v.setUint32(0, 0x06054b50, true);
  end.v.setUint16(8, files.length, true);
  end.v.setUint16(10, files.length, true);
  end.v.setUint32(12, centralSize, true);
  end.v.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end.a], { type: "application/zip" });
}

export async function downloadBatch(batch) {
  const encoder = new TextEncoder();
  let index = 0;
  const prompt =
    "Use the attached reference images listed below. These local files do not expire. If an attachment is missing, stop and ask for it.\n\n" +
    batch.prompt
      .replace(
        /https?:\/\/[^\s]+\/api\/reference\/[^\s]+/g,
        () => `reference-${++index}.jpg`,
      )
      .replace(
        /These reference links expire in 24 hours\.[^]*?Never silently ignore the references\./,
        "Open every attached image before creating pins. Never silently ignore the references.",
      );
  const files = [
    { name: "prompt.txt", bytes: encoder.encode(prompt) },
    {
      name: "README.txt",
      bytes: encoder.encode(
        "1. Unzip this folder.\n2. Attach the reference JPG images to your Codex conversation.\n3. Paste prompt.txt into the same conversation.\n4. Review the pins before filling your Sheet.\n",
      ),
    },
  ];
  for (const [i, reference] of (batch.references || []).entries()) {
    const response = await fetch(reference.url, { credentials: "same-origin" });
    if (
      !response.ok ||
      !response.headers.get("Content-Type")?.startsWith("image/jpeg")
    )
      throw Error("Reference unavailable. Sign in and copy the batch again.");
    files.push({
      name: `reference-${i + 1}.jpg`,
      bytes: new Uint8Array(await response.arrayBuffer()),
    });
  }
  const url = URL.createObjectURL(zipStore(files)),
    link = document.createElement("a");
  link.href = url;
  link.download = `pin-batch-${batch.id.slice(0, 8)}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
