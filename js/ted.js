/* =========================================================================
 * Track Layout Creator + — Web Port
 * ted.js — TED binary file format reader/writer + track construction
 *          pipeline (port of resources/readfile_3.py and the construct_*
 *          functions of the MIT-licensed TLC+ source v1.2.0-beta2).
 *
 * Original tool: Copyright (c) 2017 eran0004, (c) 2026 daydrive7 (MIT)
 * ========================================================================= */
'use strict';

/* Road data per scenery (from resources/layoutConfig.py) */
const ROAD_TYPES_DATA = {
  andalusia: {
    start: [[12715350756442981649n, 200], [12405165332107838737n, 300], [10259481584642508049n, 200]],
    startsprint: [[11656723369034204433n, 200]],
    endsprint: [[10793158140485911825n, 200], [12349354703971655253n, 100], [11268490793402736213n, 100]],
    normal: [[12389965683365463313n, 100]],
    narrow: [[9433898354799217496n, 50], [10429475347424807768n, 50], [12293684118179482456n, 50]],
    startline: [1, 0.74],
    startlineP2P: [0, 0.88],
    finishlineP2P: [0, 0.1],
  },
  death_valley: {
    start: [[10413932764110376025n, 100], [13021798423334603865n, 100], [13521979456949439577n, 200],
            [13600510975451712601n, 200], [13607829324846189657n, 100], [9672527675454508121n, 100]],
    startsprint: [[12624918706172578905n, 100], [12427041797544987737n, 200],
                  [13367731169712000089n, 200], [12078575776377195609n, 100]],
    endsprint: [[10279106250265971801n, 100], [11855929069799066713n, 100], [11486633900354686041n, 100],
                [9334476228425010265n, 100], [9806509764368780377n, 100], [10043230219782442073n, 100],
                [10852752252802288729n, 100]],
    normal: [[10961401593812601945n, 100]],
    narrow: [[10634046195898109017n, 50], [12318673931511385177n, 50], [10492745757589359705n, 50]],
    startline: [2, 0.88],
    startlineP2P: [1, 0.88],
    finishlineP2P: [0, 0.8],
  },
  eifel: {
    start: [[11356711283892013768n, 100], [10513130778690177736n, 100], [12786885640558856904n, 100],
            [13035428044994366152n, 100], [9267041056792103624n, 100], [11445375901555870408n, 100]],
    startsprint: [[10462183807905549000n, 100], [10920706544967207624n, 100], [11024570811373439688n, 100]],
    endsprint: [[13198683531486546632n, 100], [11350237359427668680n, 100], [11292816464178694856n, 100],
                [10369015590614321864n, 100], [12439545519297907400n, 100], [11863366241971194568n, 100],
                [12951829976911301320n, 100]],
    normal: [[11774983099284048584n, 100]],
    narrow: [[10330172043828251336n, 50], [10441354659628960456n, 50], [11447346226392845000n, 50]],
    startline: [3, 0.95],
    startlineP2P: [1, 0.9],
    finishlineP2P: [0, 0.5],
  },
};
const ROAD_TYPES = { 1: ROAD_TYPES_DATA.death_valley, 2: ROAD_TYPES_DATA.eifel, 3: ROAD_TYPES_DATA.andalusia, 4: ROAD_TYPES_DATA.eifel, 5: ROAD_TYPES_DATA.eifel };

/* ------------------------------------------------------------------ */
/* PDIDATETIME — encoded creation timestamp (bit-packed)              */
/* ------------------------------------------------------------------ */
function PDIDATETIME(now) {
  now = now || new Date();
  function decimalToBits(decimal, bits) {
    let bitString = '';
    for (let i = bits; i > 0; i--) {
      const bitVal = Math.pow(2, i - 1);
      const bit = Math.floor(decimal / bitVal);
      bitString += String(bit);
      decimal -= bit * bitVal;
    }
    return bitString;
  }
  const Y = [now.getFullYear() - 1970, 6];
  const M = [now.getMonth() + 1, 4];
  const D = [now.getDate(), 5];
  const h = [now.getHours(), 5];
  const m = [now.getMinutes(), 6];
  const s = [now.getSeconds(), 6];
  let bits = '';
  for (const item of [Y, M, D, h, m, s]) bits += decimalToBits(item[0], item[1]);
  return parseInt(bits, 2) >>> 0;
}

/* ------------------------------------------------------------------ */
/* TED header spec: key -> [offset, size, format, value]              */
/* ------------------------------------------------------------------ */
function makeHeaderSpec() {
  return {
    'id': [0, 8, '>Q', 5139792810303815680n],
    'version': [8, 4, '>l', 104],
    'sceneryindex': [12, 4, '>L', null],
    'roadwidth': [16, 4, '>f', null],
    'm_trackwidth_a': [20, 4, '>f', 8],
    'm_trackwidth_b': [24, 4, '>f', 12],
    'tracklength': [28, 4, '>f', null],
    'datetime': [32, 4, '>L', 3113305090],
    'isloopcourse': [36, 4, '>L', null],
    'byte padding0': [40, 8, '>Q', 0n],
    'homestraightlength': [48, 4, '>f', null],
    'elevationdifference': [52, 4, '>f', null],
    'cornercount': [56, 4, '>l', null],
    'finishline': [60, 4, '>f', null],
    'startline': [64, 4, '>f', null],
    'byte padding1': [68, 8, '>Q', 0n],
    'cps_offset': [76, 4, '>L', null],
    'cps_entry_count': [80, 4, '>l', null],
    'reserved1_offset': [84, 4, '>L', null],
    'reserved1_entry_count': [88, 4, '>l', null],
    'reserved2_offset': [92, 4, '>L', null],
    'reserved2_entry_count': [96, 4, '>l', null],
    'reserved3_offset': [100, 4, '>L', null],
    'reserved3_entry_count': [104, 4, '>l', null],
    'banks_offset': [108, 4, '>L', null],
    'banks_entry_count': [112, 4, '>l', null],
    'heights_offset': [116, 4, '>L', null],
    'heights_entry_count': [120, 4, '>l', null],
    'checkpoints_offset': [124, 4, '>L', null],
    'checkpoints_entry_count': [128, 4, '>l', null],
    'roads_offset': [132, 4, '>L', null],
    'roads_entry_count': [136, 4, '>l', null],
    'decorations_offset': [140, 4, '>L', null],
    'decorations_entry_count': [144, 4, '>l', null],
    'byte padding2': [148, 8, '>Q', 0n],
  };
}

/* ------------------------------------------------------------------ */
/* TrackObject — parse a TED byte buffer                              */
/* ------------------------------------------------------------------ */
class TEDTrackObject {
  constructor(buffer, filename) {
    this.buffer = buffer;
    this.filename = filename || '';
    const dv = new DataView(buffer);
    this.dv = dv;
    this.header = this.extractHeader(dv);
    this.cps = this.extractCps(dv, this.header);
    this.banks = this.extractBanks(dv, this.header);
    this.heights = this.extractHeights(dv, this.header);
    this.checkpoints = this.extractCheckpoints(dv, this.header);
    this.roads = this.extractRoads(dv, this.header);
    this.decorations = this.extractDecorations(dv, this.header);
    this.measureTrack();
  }

  extractHeader(dv) {
    const spec = {
      'id': [0, 8, '>Q'], 'version': [8, 4, '>l'], 'sceneryindex': [12, 4, '>L'],
      'roadwidth': [16, 4, '>f'], 'm_trackwidth_a': [20, 4, '>f'], 'm_trackwidth_b': [24, 4, '>f'],
      'tracklength': [28, 4, '>f'], 'datetime': [32, 4, '>L'], 'isloopcourse': [36, 4, '>L'],
      'byte padding0': [40, 8, '>Q'], 'homestraightlength': [48, 4, '>f'],
      'elevationdifference': [52, 4, '>f'], 'cornercount': [56, 4, '>l'],
      'finishline': [60, 4, '>f'], 'startline': [64, 4, '>f'], 'byte padding1': [68, 8, '>Q'],
      'cps_offset': [76, 4, '>L'], 'cps_entry_count': [80, 4, '>l'],
      'reserved1_offset': [84, 4, '>L'], 'reserved1_entry_count': [88, 4, '>l'],
      'reserved2_offset': [92, 4, '>L'], 'reserved2_entry_count': [96, 4, '>l'],
      'reserved3_offset': [100, 4, '>L'], 'reserved3_entry_count': [104, 4, '>l'],
      'banks_offset': [108, 4, '>L'], 'banks_entry_count': [112, 4, '>l'],
      'heights_offset': [116, 4, '>L'], 'heights_entry_count': [120, 4, '>l'],
      'checkpoints_offset': [124, 4, '>L'], 'checkpoints_entry_count': [128, 4, '>l'],
      'roads_offset': [132, 4, '>L'], 'roads_entry_count': [136, 4, '>l'],
      'decorations_offset': [140, 4, '>L'], 'decorations_entry_count': [144, 4, '>l'],
      'byte padding2': [148, 8, '>Q'],
    };
    const out = {};
    for (const key in spec) {
      const [off, size, fmt] = spec[key];
      let value;
      if (fmt === '>Q') value = dv.getBigUint64(off);
      else if (fmt === '>l') value = dv.getInt32(off);
      else if (fmt === '>L') value = dv.getUint32(off);
      else value = dv.getFloat32(off);
      out[key] = [off, size, fmt, value];
    }
    return out;
  }

  extractCps(dv, header) {
    const offset = header['cps_offset'][3];
    const count = header['cps_entry_count'][3];
    const cps = [];
    for (let i = 0; i < count; i++) {
      const p = offset + i * 20;
      cps.push({
        formtype: dv.getUint32(p),
        x: dv.getFloat32(p + 4), y: dv.getFloat32(p + 8),
        x2: dv.getFloat32(p + 12), y2: dv.getFloat32(p + 16),
      });
    }
    return cps;
  }

  extractBanks(dv, header) {
    const offset = header['banks_offset'][3];
    const count = header['banks_entry_count'][3];
    const banks = [];
    for (let i = 0; i < count; i++) {
      const p = offset + i * 28;
      banks.push({
        m_bank: dv.getFloat32(p), m_shiftPrev: dv.getFloat32(p + 4), m_shiftNext: dv.getFloat32(p + 8),
        divNum: dv.getUint32(p + 12), unk: dv.getUint32(p + 16),
        vpos: dv.getFloat32(p + 20), vlen: dv.getFloat32(p + 24),
      });
    }
    return banks;
  }

  extractHeights(dv, header) {
    const offset = header['heights_offset'][3];
    const count = header['heights_entry_count'][3];
    const out = [];
    for (let i = 0; i < count; i++) out.push(dv.getFloat32(offset + i * 4));
    return out;
  }

  extractCheckpoints(dv, header) {
    const offset = header['checkpoints_offset'][3];
    const count = header['checkpoints_entry_count'][3];
    const out = [];
    for (let i = 0; i < count; i++) out.push(dv.getFloat32(offset + i * 4));
    return out;
  }

  extractRoads(dv, header) {
    const offset = header['roads_offset'][3];
    const count = header['roads_entry_count'][3];
    const out = [];
    for (let i = 0; i < count; i++) {
      const p = offset + i * 20;
      out.push({
        uuid: dv.getBigUint64(p), flag: dv.getInt32(p + 8),
        vposIncludeHeight: dv.getFloat32(p + 12), vposIncludeHeight2: dv.getFloat32(p + 16),
      });
    }
    return out;
  }

  extractDecorations(dv, header) {
    const offset = header['decorations_offset'][3];
    const count = header['decorations_entry_count'][3];
    const out = [];
    for (let i = 0; i < count; i++) {
      const p = offset + i * 24;
      out.push({
        m_arr_Cliff: dv.getBigUint64(p), railtype: dv.getInt32(p + 8),
        vposIncludeHeight: dv.getFloat32(p + 12), vposIncludeHeight2: dv.getFloat32(p + 16),
        tracktype: dv.getInt32(p + 20),
      });
    }
    return out;
  }

  measureTrack() {
    this.mod = this.heights.slice();
    this.banklengths2d = [];
    this.banklengths3d = [];
    this.tracklength2d = 0;
    this.tracklength3d = 0;
    this.measureTrackLength();

    this.checkpoints2d = this.checkpoints.map(cp => this.getDistance(cp, 0));
    this.finishline2d = this.getDistance(this.header['finishline'][3], 0);
    this.startline2d = this.getDistance(this.header['startline'][3], 0);
    for (const item of this.roads.concat(this.decorations)) {
      item.vposExcludeHeight = this.getDistance(item.vposIncludeHeight, 0);
      item.vposExcludeHeight2 = this.getDistance(item.vposIncludeHeight2, 0);
    }
  }

  getDistance(distance, mode) {
    let posKey, lenKey, bl;
    if (mode === 0) { posKey = 'vpos'; lenKey = 'vlen'; bl = this.banklengths2d; }
    else if (mode === 1) { posKey = 'vpos2d'; lenKey = 'vlen2d'; bl = this.banklengths3d; }
    else { posKey = 'vpos3d'; lenKey = 'vlen3d'; bl = this.banklengths2d; }

    const bankStarts = this.banks.map(b => b[posKey]);
    const prefix = [0.0];
    for (const v of bl) prefix.push(prefix[prefix.length - 1] + v);

    let bankIndex = bisectRight(bankStarts, distance) - 1;
    if (bankIndex < 0) bankIndex = 0;
    const bank = this.banks[bankIndex];
    const vlen = bank[lenKey];
    let fraction = (vlen === 0) ? 0.0 : (distance - bankStarts[bankIndex]) / vlen;
    if (fraction > 1.0) fraction = 1.0;
    return prefix[bankIndex] + bl[bankIndex] * fraction;
  }

  measureTrackLength() {
    const heights = this.mod;
    const nHeights = heights.length;
    this.tracklength2d = 0.0;
    this.tracklength3d = 0.0;
    this.banklengths2d = [];
    this.banklengths3d = [];

    let prevX = 0.0, prevY = 0.0;
    for (let index = 0; index < this.cps.length; index++) {
      const cp = this.cps[index];
      const thisX = cp.x, thisY = cp.y;
      if (index > 0) {
        let dist2d;
        if (cp.formtype === 0 || cp.formtype === 3) {
          dist2d = Math.hypot(thisX - prevX, thisY - prevY);
        } else {
          const cx = cp.x2, cy = cp.y2;
          const radius = Math.hypot(thisX - cx, thisY - cy);
          const chord = Math.hypot(thisX - prevX, thisY - prevY);
          const opp = chord / 2.0;
          const sinVal = radius > 0 ? Math.min(1.0, Math.max(-1.0, opp / radius)) : 0.0;
          dist2d = Math.asin(sinVal) * 2 * radius;
        }
        const bank = this.banks[index - 1];
        bank.vpos2d = this.tracklength2d;
        bank.vlen2d = dist2d;

        const div = bank.divNum;
        const step = div ? dist2d / div : 0.0;
        let dist3d = 0.0;
        for (let k = 0; k < div; k++) {
          const i0 = bank.unk + k;
          const i1 = i0 + 1;
          const dz = (i1 < nHeights) ? heights[i1] - heights[i0] : 0.0;
          dist3d += Math.sqrt(step * step + dz * dz);
        }
        bank.vpos3d = this.tracklength3d;
        bank.vlen3d = dist3d;

        this.tracklength2d += dist2d;
        this.tracklength3d += dist3d;
        this.banklengths2d.push(dist2d);
        this.banklengths3d.push(dist3d);
      }
      prevX = thisX; prevY = thisY;
    }
  }

  updateData() {
    const updateHeader = () => {
      this.header['tracklength'][3] = this.banks.reduce((s, b) => s + b.vlen3d, 0);
      this.header['elevationdifference'][3] = Math.max(...this.mod) - Math.min(...this.mod);
      this.header['finishline'][3] = this.getDistance(this.finishline2d, 1);
      this.header['startline'][3] = this.getDistance(this.startline2d, 1);

      const cpsOffset = 156;
      const cpsEntryCount = this.cps.length;
      const reservedsOffset = cpsOffset + cpsEntryCount * 20;
      const banksOffset = reservedsOffset;
      const banksEntryCount = this.banks.length;
      const heightsOffset = banksOffset + banksEntryCount * 28;
      const heightsEntryCount = this.mod.length;
      const checkpointsOffset = heightsOffset + heightsEntryCount * 4;
      const checkpointsEntryCount = this.checkpoints.length;
      const roadsOffset = checkpointsOffset + checkpointsEntryCount * 4;
      const roadsEntryCount = this.roads.length;
      const decorationsOffset = roadsOffset + roadsEntryCount * 20;
      const decorationsEntryCount = this.decorations.length;

      this.header['cps_offset'][3] = cpsOffset;
      this.header['cps_entry_count'][3] = cpsEntryCount;
      this.header['reserved1_offset'][3] = reservedsOffset;
      this.header['reserved1_entry_count'][3] = 0;
      this.header['reserved2_offset'][3] = reservedsOffset;
      this.header['reserved2_entry_count'][3] = 0;
      this.header['reserved3_offset'][3] = reservedsOffset;
      this.header['reserved3_entry_count'][3] = 0;
      this.header['banks_offset'][3] = banksOffset;
      this.header['banks_entry_count'][3] = banksEntryCount;
      this.header['heights_offset'][3] = heightsOffset;
      this.header['heights_entry_count'][3] = heightsEntryCount;
      this.header['checkpoints_offset'][3] = checkpointsOffset;
      this.header['checkpoints_entry_count'][3] = checkpointsEntryCount;
      this.header['roads_offset'][3] = roadsOffset;
      this.header['roads_entry_count'][3] = roadsEntryCount;
      this.header['decorations_offset'][3] = decorationsOffset;
      this.header['decorations_entry_count'][3] = decorationsEntryCount;
    };

    this.measureTrackLength();
    for (const bank of this.banks) {
      bank.vpos = bank.vpos3d;
      bank.vlen = bank.vlen3d;
    }
    this.checkpoints = this.checkpoints2d.map(c => this.getDistance(c, 1));
    for (const item of this.roads.concat(this.decorations)) {
      item.vposIncludeHeight = this.getDistance(item.vposExcludeHeight, 1);
      item.vposIncludeHeight2 = this.getDistance(item.vposExcludeHeight2, 1);
    }
    updateHeader();
  }
}

/* Editor TrackObject built from parts (not parsed) */
class EditorTrackObject {
  constructor(header, cps, banks, heights, checkpoints, roads, decorations) {
    this.header = header;
    this.cps = cps;
    this.banks = banks;
    this.heights = heights;
    this.checkpoints = checkpoints;
    this.roads = roads;
    this.decorations = decorations || [];
    this.filename = '';
  }
  updateData() { /* recomputed by construct pipeline */ }
}

/* ------------------------------------------------------------------ */
/* Serialise a TrackObject into TED bytes                             */
/* ------------------------------------------------------------------ */
function generateTedFile(track) {
  track.updateData();

  const nCps = track.cps.length;
  const nBanks = track.banks.length;
  const mod = track.mod || track.heights;
  track.mod = mod;
  const nHeights = mod.length;
  const nCheckpoints = track.checkpoints.length;
  const nRoads = track.roads.length;
  const nDecorations = track.decorations.length;
  const totalSize = 156 + nCps * 20 + nBanks * 28 + nHeights * 4 +
    nCheckpoints * 4 + nRoads * 20 + nDecorations * 24;
  const buf = new ArrayBuffer(totalSize);
  const dv = new DataView(buf);

  // header
  for (const key in track.header) {
    const item = track.header[key];
    const [off, , fmt, value] = item;
    if (fmt === '>Q') dv.setBigUint64(off, BigInt(value));
    else if (fmt === '>l') dv.setInt32(off, value);
    else if (fmt === '>L') dv.setUint32(off, value);
    else dv.setFloat32(off, value);
  }

  let pos = 156;
  for (const cp of track.cps) {
    dv.setUint32(pos, cp.formtype);
    dv.setFloat32(pos + 4, cp.x);
    dv.setFloat32(pos + 8, cp.y);
    dv.setFloat32(pos + 12, cp.x2);
    dv.setFloat32(pos + 16, cp.y2);
    pos += 20;
  }
  for (const bank of track.banks) {
    dv.setFloat32(pos, bank.m_bank);
    dv.setFloat32(pos + 4, bank.m_shiftPrev);
    dv.setFloat32(pos + 8, bank.m_shiftNext);
    dv.setUint32(pos + 12, bank.divNum);
    dv.setUint32(pos + 16, bank.unk);
    dv.setFloat32(pos + 20, bank.vpos);
    dv.setFloat32(pos + 24, bank.vlen);
    pos += 28;
  }
  for (let i = 0; i < nHeights; i++) { dv.setFloat32(pos, mod[i]); pos += 4; }
  for (let i = 0; i < nCheckpoints; i++) { dv.setFloat32(pos, track.checkpoints[i]); pos += 4; }
  for (const road of track.roads) {
    dv.setBigUint64(pos, BigInt(road.uuid));
    dv.setInt32(pos + 8, road.flag);
    dv.setFloat32(pos + 12, road.vposIncludeHeight);
    dv.setFloat32(pos + 16, road.vposIncludeHeight2);
    pos += 20;
  }
  for (const dec of track.decorations) {
    dv.setBigUint64(pos, BigInt(dec.m_arr_Cliff));
    dv.setInt32(pos + 8, dec.railtype);
    dv.setFloat32(pos + 12, dec.vposIncludeHeight);
    dv.setFloat32(pos + 16, dec.vposIncludeHeight2);
    dv.setInt32(pos + 20, dec.tracktype);
    pos += 24;
  }
  return buf;
}

/* ------------------------------------------------------------------ */
/* .TRK save files (TRK5 writer; TRK/TRK2/TRK3/TRK4/TRK5 reader)       */
/* ------------------------------------------------------------------ */
function makeTrk5(state, polygon) {
  // 36-byte header: 'TRK5' + >H scenery + 13x >h + 2x >h offsets
  const head = new ArrayBuffer(36);
  const dv = new DataView(head);
  const enc = new TextEncoder();
  new Uint8Array(head, 0, 4).set(enc.encode('TRK5'));

  const si = state.sceneryindex;
  const ic = state.circuit ? 1 : 0;
  const rw = state.roadWidth * 20;
  const ca = state.maxCamberAngle * 10;
  const cr = state.camberRate * 100;
  const ss = state.sectorScale;
  const rl = state.roadBaseLen * 10;
  const sh = state.shortStraight ? 1 : 0;
  const ct = 0, cm = 0;
  const cx = (1 + state.camberAxis) * 10;
  const nr = state.narrowRoad ? 1 : 0;
  const rFlag = state.roadFlag;

  dv.setUint16(4, si);
  const items = [si, ic, rw, ca, cr, ss, rl, sh, ct, cm, cx, nr, rFlag].map(v => Math.round(v));
  items.forEach((item, index) => {
    dv.setInt16(6 + 2 * index, item > 32767 ? item - 65536 : item, false);
  });
  dv.setInt16(32, Math.max(-32768, Math.min(32767, Math.round(state.startOffset))), false);
  dv.setInt16(34, Math.max(-32768, Math.min(32767, Math.round(state.pitOffset))), false);

  const parts = [head];
  for (const p of polygon) {
    const rec = new ArrayBuffer(24);
    const rdv = new DataView(rec);
    rdv.setFloat32(0, p.x, false);
    rdv.setFloat32(4, p.y, false);
    rdv.setFloat32(8, p.z || 0, false);
    rdv.setFloat32(12, p.radius, false);
    rdv.setFloat32(16, p.camber, false);
    rdv.setFloat32(20, p.segments, false);
    parts.push(rec);
  }
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(new Uint8Array(p), off); off += p.byteLength; }
  return out.buffer;
}

function parseTrkFile(buffer) {
  const dv = new DataView(buffer);
  const u8 = new Uint8Array(buffer);
  let id = '';
  try { id = new TextDecoder().decode(u8.subarray(0, 4)).replace(/\0+$/, ''); } catch (e) { return null; }

  const state = { startOffset: 0, pitOffset: 0, roadFlag: 0 };
  let polygonBytesStart = 32;
  let stride = 24, hasZ = true;

  if (id === 'TRK5') {
    const si = dv.getUint16(6, false);
    const data = [];
    for (let i = 0; i < 13; i++) data.push(dv.getInt16(6 + 2 * i, false));
    const [si2, ic, rw, ca, cr, ss, rl, sh, ct, cm, cx, nr, rFlag] = data;
    state.roadFlag = rFlag;
    state.startOffset = dv.getInt16(32, false);
    state.pitOffset = dv.getInt16(34, false);
    state.sceneryindex = si;
    state.circuit = !!ic;
    state.roadWidth = rw / 20;
    state.maxCamberAngle = ca / 10;
    state.camberRate = cr / 100;
    state.sectorScale = ss;
    state.roadBaseLen = rl / 10;
    state.shortStraight = !!sh;
    state.camberAxis = (cx / 10) - 1;
    state.narrowRoad = !!nr;
    polygonBytesStart = 36;
    stride = 24; hasZ = true;
  } else if (id === 'TRK4') {
    const si = dv.getUint16(4, false);
    const data = [];
    for (let i = 0; i < 13; i++) data.push(dv.getUint16(4 + 2 * i, false));
    const [si2, ic, rw, ca, cr, ss, rl, sh, ct, cm, cx, nr, rFlag] = data;
    state.roadFlag = rFlag;
    state.sceneryindex = si;
    state.circuit = !!ic;
    state.roadWidth = rw / 20;
    state.maxCamberAngle = ca / 10;
    state.camberRate = cr / 100;
    state.sectorScale = ss;
    state.roadBaseLen = rl / 10;
    state.shortStraight = !!sh;
    state.camberAxis = (cx / 10) - 1;
    state.narrowRoad = !!nr;
    polygonBytesStart = 32;
    stride = 24; hasZ = true;
  } else {
    // Old TRK/TRK2/TRK3
    const data = [];
    for (let i = 0; i < 12; i++) data.push(dv.getUint16(4 + 2 * i, false));
    const [si, ic, rw, ca, cr, ss, rl, sh, ct, cm, cx, nr] = data;
    state.roadFlag = 0;
    state.sceneryindex = si;
    state.circuit = !!ic;
    state.roadWidth = rw / 20;
    state.maxCamberAngle = ca / 10;
    state.camberRate = cr / 100;
    state.sectorScale = ss;
    state.roadBaseLen = rl / 10;
    state.shortStraight = !!sh;
    state.camberAxis = (cx / 10) - 1;
    state.narrowRoad = !!nr;
    polygonBytesStart = 32;
    if (id === 'TRK3') { stride = 20; }
    else if (id === 'TRK2') { stride = 16; }
    else { stride = 12; } // TRK
    hasZ = (id === 'TRK3');
  }

  const polygon = [];
  for (let off = polygonBytesStart; off + stride <= buffer.byteLength; off += stride) {
    if (stride === 24) {
      polygon.push(makeCoordinate(dv.getFloat32(off, false), dv.getFloat32(off + 4, false),
        dv.getFloat32(off + 8, false), dv.getFloat32(off + 12, false),
        dv.getFloat32(off + 16, false), parseInt(dv.getFloat32(off + 20, false))));
    } else if (stride === 20) {
      polygon.push(makeCoordinate(dv.getFloat32(off, false), dv.getFloat32(off + 4, false), 0,
        dv.getFloat32(off + 8, false), dv.getFloat32(off + 12, false), parseInt(dv.getFloat32(off + 16, false))));
    } else if (stride === 16) {
      polygon.push(makeCoordinate(dv.getFloat32(off, false), -dv.getFloat32(off + 4, false), 0,
        dv.getFloat32(off + 8, false), dv.getFloat32(off + 12, false), 1));
    } else {
      polygon.push(makeCoordinate(dv.getFloat32(off, false), -dv.getFloat32(off + 4, false), 0,
        dv.getFloat32(off + 8, false), -1, 1));
    }
  }
  return { state: state, polygon: polygon, id: id };
}

/* Coordinate factory (mirrors resources/layoutClasses.py Coordinate) */
function makeCoordinate(x, y, z, radius, camber, segments) {
  return {
    x: x, y: y, z: z,
    radius: radius,
    camber: camber,
    segments: segments,
    width: -1,
    get xy() { return [this.x, this.y]; },
    set xy(v) { this.x = v[0]; this.y = v[1]; },
  };
}

/* CP factory (mirrors layoutClasses.CP) */
function makeCP(end, center, formtype, radius, startAngle, sweepAngle, camber, camberFactor, z, width) {
  return {
    x: end[0], y: end[1],
    x2: center ? center[0] : 0, y2: center ? center[1] : 0,
    formtype: formtype || 0,
    radius: radius,
    startAngle: startAngle,
    sweepAngle: sweepAngle,
    camber: camber || 0,
    camberFactor: camberFactor || 0,
    z: z || 0,
    width: (width === undefined) ? -1 : width,
    get xy() { return [this.x, this.y]; },
    set xy(v) { this.x = v[0]; this.y = v[1]; },
    get center() { return [this.x2, this.y2]; },
    set center(v) { this.x2 = v[0]; this.y2 = v[1]; },
  };
}

/* ------------------------------------------------------------------ */
/* GPX / CSV path import (azimuthal equidistant projection)           */
/* ------------------------------------------------------------------ */
function greatCircleDistance(p0, p1) {
  const R = 6371.0;
  const lat0 = p0[0] * Math.PI / 180, lon0 = p0[1] * Math.PI / 180;
  const lat1 = p1[0] * Math.PI / 180, lon1 = p1[1] * Math.PI / 180;
  const dlon = lon1 - lon0, dlat = lat1 - lat0;
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat0) * Math.cos(lat1) * Math.sin(dlon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1000;
}

function getBearing(p0, p1) {
  const lat0 = p0[0] * Math.PI / 180, lon0 = p0[1] * Math.PI / 180;
  const lat1 = p1[0] * Math.PI / 180, lon1 = p1[1] * Math.PI / 180;
  const y = Math.sin(lon1 - lon0) * Math.cos(lat1);
  const x = Math.cos(lat0) * Math.sin(lat1) - Math.sin(lat0) * Math.cos(lat1) * Math.cos(lon1 - lon0);
  return Math.atan2(y, x);
}

function pointToCartesian(center, point) {
  const distance = greatCircleDistance(center, point);
  const bearing = getBearing(center, point);
  return [distance * Math.sin(bearing), distance * Math.cos(bearing)];
}

function projectPath(path) {
  if (!path.length) return [];
  const lats = path.map(p => p[0]), lons = path.map(p => p[1]);
  const center = [Math.min(...lats) + (Math.max(...lats) - Math.min(...lats)) / 2,
                  Math.min(...lons) + (Math.max(...lons) - Math.min(...lons)) / 2];
  return path.map(p => pointToCartesian(center, p));
}

function parseGPX(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const pts = [];
  const elements = doc.getElementsByTagName('*');
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.tagName.endsWith('trkpt') && el.hasAttribute('lat') && el.hasAttribute('lon')) {
      pts.push([parseFloat(el.getAttribute('lat')), parseFloat(el.getAttribute('lon'))]);
    }
  }
  return projectPath(pts);
}

function parseCSVPath(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length);
  if (!lines.length) return [];
  const header = lines.shift().split(',').map(h => h.trim().toLowerCase());
  let lat = -1, lon = -1;
  header.forEach((h, idx) => {
    if (h === 'latitude' || h === 'lat') lat = idx;
    else if (h === 'longitude' || h === 'lon' || h === 'lng') lon = idx;
  });
  if (lat === -1 || lon === -1) return null;
  const rawPath = [];
  for (const line of lines) {
    const parts = line.split(',');
    const latitude = parseFloat(parts[lat]);
    const longitude = parseFloat(parts[lon]);
    if (!isNaN(latitude) && !isNaN(longitude)) rawPath.push([latitude, longitude]);
  }
  return projectPath(rawPath);
}

/* Polygon CSV (.pgn) import/export */
function parsePolygonCSV(text) {
  const rawPolygon = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    const parts = s.split(',').map(parseFloat);
    if (parts.some(isNaN)) continue;
    rawPolygon.push(parts);
  }
  return rawPolygon;
}

function polygonToCSV(polygon) {
  const lines = [];
  for (const point of polygon) {
    const w = (point.width !== undefined) ? point.width : -1;
    lines.push([point.x, point.y, point.z, point.radius, point.camber, point.segments, w].join(','));
  }
  return lines.join('\n') + '\n';
}

/* Elevation profile CSV import/export */
function parseElevationProfile(text) {
  const floatData = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    const parts = s.split(',');
    if (parts.length < 2) continue;
    const x = parseFloat(parts[0]), z = parseFloat(parts[1]);
    if (isNaN(x) || isNaN(z)) continue;
    floatData.push([x, z]);
  }
  if (!floatData.length) return null;
  const firstZ = floatData[0][1];
  return { data: floatData.map(([x, z]) => [x, z - firstZ]) };
}

window.TLCTed = {
  ROAD_TYPES, ROAD_TYPES_DATA, PDIDATETIME, makeHeaderSpec, TEDTrackObject,
  EditorTrackObject, generateTedFile, makeTrk5, parseTrkFile, makeCoordinate, makeCP,
  greatCircleDistance, getBearing, pointToCartesian, projectPath, parseGPX,
  parseCSVPath, parsePolygonCSV, polygonToCSV, parseElevationProfile,
};
