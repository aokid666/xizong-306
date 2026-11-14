/* ============================================================
   zip.js — 极简 ZIP 读写（store 模式 + deflate-raw 读取）
   ============================================================ */
(function () {
  'use strict';

  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function enc(str) { return new TextEncoder().encode(str); }

  function dosTime(d) {
    return {
      time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xFFFF,
      date: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF
    };
  }

  /* entries: [{name, data:Uint8Array}] -> Blob */
  function create(entries) {
    const chunks = [], central = [];
    let offset = 0;
    const d = new Date();
    const dt = dosTime(d);

    entries.forEach(function (e) {
      const name = enc(e.name);
      const data = e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data);
      const crc = crc32(data);

      const local = new Uint8Array(30 + name.length);
      const dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);        // version
      dv.setUint16(6, 0x0800, true);    // UTF-8 flag
      dv.setUint16(8, 0, true);         // store
      dv.setUint16(10, dt.time, true);
      dv.setUint16(12, dt.date, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, name.length, true);
      dv.setUint16(28, 0, true);
      local.set(name, 30);

      chunks.push(local, data);

      const c = new Uint8Array(46 + name.length);
      const cv = new DataView(c.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, dt.time, true);
      cv.setUint16(14, dt.date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      c.set(name, 46);
      central.push(c);

      offset += local.length + data.length;
    });

    let cdSize = 0;
    central.forEach(function (c) { cdSize += c.length; });
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);

    return new Blob(chunks.concat(central, [end]), { type: 'application/zip' });
  }

  /* blob -> [{name, data:Uint8Array}] */
  async function read(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const dv = new DataView(buf.buffer);
    // 找 EOCD
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 zip 文件');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = [];
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const compSize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
      // local header
      const lnameLen = dv.getUint16(localOff + 26, true);
      const lextraLen = dv.getUint16(localOff + 28, true);
      const start = localOff + 30 + lnameLen + lextraLen;
      const raw = buf.subarray(start, start + compSize);
      let data;
      if (method === 0) data = raw;
      else if (method === 8 && typeof DecompressionStream !== 'undefined') {
        const ds = new DecompressionStream('deflate-raw');
        const stream = new Blob([raw]).stream().pipeThrough(ds);
        data = new Uint8Array(await new Response(stream).arrayBuffer());
      } else {
        throw new Error('zip 使用了不支持的压缩方式');
      }
      out.push({ name: name, data: data });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }

  function dataUrlToBytes(dataUrl) {
    const b64 = String(dataUrl).split(',')[1] || '';
    const bin = atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  function bytesToDataUrl(bytes, mime) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return 'data:' + (mime || 'image/png') + ';base64,' + btoa(bin);
  }

  function mimeOf(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    return 'image/png';
  }
  function extOf(mime) {
    if (/jpeg/.test(mime)) return 'jpg';
    if (/webp/.test(mime)) return 'webp';
    if (/gif/.test(mime)) return 'gif';
    return 'png';
  }

  window.ZIP = {
    create: create, read: read,
    dataUrlToBytes: dataUrlToBytes, bytesToDataUrl: bytesToDataUrl,
    mimeOf: mimeOf, extOf: extOf, crc32: crc32
  };
})();
