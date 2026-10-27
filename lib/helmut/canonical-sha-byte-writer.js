'use strict';
// Only a source-closed math/codec lease may use this finite byte sink. It does
// not validate values, mint authority or change the complete SHA preimage.
const BLOCK_BYTES=256*1024;
function create(digest) {
  const block=Buffer.allocUnsafe(BLOCK_BYTES);let at=0;
  const flush=()=>{if(at){digest.update(block.subarray(0,at));at=0;}};
  return Object.freeze({write(value){
    if(typeof value==='string'){
      if(value.length===1&&value.charCodeAt(0)<128){if(at===BLOCK_BYTES)flush();block[at++]=value.charCodeAt(0);return;}
      const length=Buffer.byteLength(value,'utf8');
      if(length>=BLOCK_BYTES){flush();digest.update(value,'utf8');return;}
      if(at+length>BLOCK_BYTES)flush();at+=block.write(value,at,length,'utf8');return;
    }
    if(!Buffer.isBuffer(value))throw TypeError('canonical-byte-writer-input');
    if(value.length>=BLOCK_BYTES){flush();digest.update(value);return;}
    if(at+value.length>BLOCK_BYTES)flush();value.copy(block,at);at+=value.length;
  },finish(){flush();return digest.digest('hex');}});
}
// The previously measured compact-DAG writer. Encode scalar literals once and
// fill bounded subtree buffers directly, avoiding per-punctuation allocations.
// All structural/size/depth/UTF8 checks remain with the original codec.
function dictionarySHA256(nodes, root, checked, memoCap, nodeCap, literalCap) {
  const crypto = require("node:crypto"), literals = new Array(nodes.length), memo = new Array(nodes.length);
  let literalBytes = 0, memoBytes = 0;
  for (let id = 0; id < nodes.length; id++) if (checked.scalar[id] !== undefined) {
    const bytes = Buffer.byteLength(checked.scalar[id]);
    if (literalBytes + bytes > literalCap) return null;
    literalBytes += bytes; literals[id] = Buffer.from(checked.scalar[id], "utf8");
  }
  const punctuation = { "{": Buffer.from("{"), "}": Buffer.from("}"), "[": Buffer.from("["),
    "]": Buffer.from("]"), ",": Buffer.from(","), ":": Buffer.from(":") };
  const writer = create(crypto.createHash("sha256"));
  function fill(id, destination, position) {
    const cached = memo[id] || literals[id];
    if (cached) return position + cached.copy(destination, position);
    const node = nodes[id], object = node[0] === "o";
    destination[position++] = object ? 123 : 91;
    for (let i = 0; i < node[1].length; i++) {
      if (i) destination[position++] = 44;
      if (object) { position = fill(node[1][i][0], destination, position); destination[position++] = 58;
        position = fill(node[1][i][1], destination, position); }
      else position = fill(node[1][i], destination, position);
    }
    destination[position++] = object ? 125 : 93;
    return position;
  }
  function write(id) {
    const cached = memo[id] || literals[id];
    if (cached) return writer.write(cached);
    if (checked.sizes[id] <= nodeCap && memoBytes + checked.sizes[id] <= memoCap) {
      const bytes = Buffer.allocUnsafe(checked.sizes[id]);
      if (fill(id, bytes, 0) !== bytes.length) throw Error("synthetik500-canonical-writer-size");
      memo[id] = bytes; memoBytes += bytes.length; return writer.write(bytes);
    }
    const node = nodes[id], object = node[0] === "o";
    writer.write(punctuation[object ? "{" : "["]);
    for (let i = 0; i < node[1].length; i++) {
      if (i) writer.write(punctuation[","]);
      if (object) { write(node[1][i][0]); writer.write(punctuation[":"]); write(node[1][i][1]); }
      else write(node[1][i]);
    }
    writer.write(punctuation[object ? "}" : "]"]);
  }
  write(root); return writer.finish();
}
module.exports=Object.freeze({BLOCK_BYTES,create,dictionarySHA256});
