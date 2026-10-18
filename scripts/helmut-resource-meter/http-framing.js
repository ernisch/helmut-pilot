'use strict';
// Bounded passive HTTP/1 response framing. Stores at most 64KiB of an unfinished
// header, never a body. Unknown/malformed framing is explicit, never success.
class ResponseCounter {
  constructor(methods, totals) {
    this.methods = methods; this.totals = totals; this.state = 'header';
    this.lineBuffer = Buffer.alloc(65540); this.lineLength = 0;
    this.remaining = 0; this.failed = false;
    this.closed = false;
    this.totals.connectionResetErrors ??= 0;
    this.totals.idleConnectionResetErrors ??= 0;
    this.totals.incompleteConnectionResetErrors ??= 0;
  }
  fail() { this.failed = true; this.totals.parseErrors++; }
  line(buffer, offset, delimiter, limit) {
    while (offset < buffer.length) {
      if (this.lineLength >= limit + delimiter.length) { this.fail(); return null; }
      this.lineBuffer[this.lineLength++] = buffer[offset++];
      if (this.lineLength < delimiter.length) continue;
      let match = true;
      for (let i = 0; i < delimiter.length; i++) {
        if (this.lineBuffer[this.lineLength - delimiter.length + i] !== delimiter.charCodeAt(i)) { match = false; break; }
      }
      if (match) {
        const text = this.lineBuffer.subarray(0, this.lineLength - delimiter.length).toString('latin1');
        this.lineLength = 0; return {text, next: offset};
      }
    }
    return null;
  }
  feed(input) {
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
    this.totals.responseTCPDeliveredBytes += buffer.length;
    if (this.failed) { this.totals.unparsedResponseBytes += buffer.length; return; }
    let offset = 0;
    while (offset < buffer.length && !this.failed) {
      if (this.state === 'header') {
        const oldPartial = this.lineLength;
        const line = this.line(buffer, offset, '\r\n\r\n', 65536);
        if (!line) break;
        const lines = line.text.split('\r\n'), first = lines.shift();
        const match = /^HTTP\/1\.[01] ([1-5][0-9]{2})(?: |$)/.exec(first);
        if (!match) { this.fail(); break; }
        const headers = Object.create(null);
        for (const text of lines) {
          const i = text.indexOf(':');
          if (i < 1) { this.fail(); break; }
          const key = text.slice(0, i).toLowerCase(), value = text.slice(i + 1).trim();
          if (Object.hasOwn(headers, key) && ['content-length', 'transfer-encoding'].includes(key)) { this.fail(); break; }
          headers[key] = Object.hasOwn(headers, key) ? headers[key] + ', ' + value : value;
        }
        if (this.failed) break;
        this.totals.responseHeaderBytes += oldPartial + line.next - offset;
        offset = line.next; const status = Number(match[1]);
        if (status < 200) {
          if (status === 101) { this.fail(); break; }
          continue;
        }
        this.totals.responses++;
        const method = this.methods.length ? this.methods.shift() : null;
        if (!method) { this.fail(); break; }
        if (method === 'HEAD' || status === 204 || status === 304) continue;
        if (headers['transfer-encoding']) {
          if (headers['transfer-encoding'].toLowerCase() !== 'chunked' || headers['content-length']) { this.fail(); break; }
          this.state = 'chunk-size';
        } else if (headers['content-length'] !== undefined) {
          if (!/^(0|[1-9][0-9]*)$/.test(headers['content-length'])) { this.fail(); break; }
          this.remaining = Number(headers['content-length']);
          if (!Number.isSafeInteger(this.remaining)) { this.fail(); break; }
          this.state = this.remaining ? 'body' : 'header';
        } else this.state = 'until-close';
      } else if (this.state === 'body' || this.state === 'chunk-body') {
        const n = Math.min(this.remaining, buffer.length - offset);
        this.totals.responseBodyReceivedBytes += n; this.remaining -= n; offset += n;
        if (!this.remaining) {
          if (this.state === 'body') this.state = 'header';
          else { this.state = 'chunk-crlf'; this.remaining = 2; }
        }
      } else if (this.state === 'until-close') {
        this.totals.responseBodyReceivedBytes += buffer.length - offset; offset = buffer.length;
      } else if (this.state === 'chunk-crlf') {
        const expected = this.remaining === 2 ? 13 : 10;
        if (buffer[offset++] !== expected) { this.fail(); break; }
        this.totals.responseFramingBytes++; this.remaining--;
        if (!this.remaining) this.state = 'chunk-size';
      } else if (this.state === 'chunk-size') {
        const previous = this.lineLength, line = this.line(buffer, offset, '\r\n', 128);
        if (!line) break;
        this.totals.responseFramingBytes += previous + line.next - offset; offset = line.next;
        const token = "[!#$%&'*+.^_`|~0-9A-Za-z-]+";
        const quoted = '"(?:[\\x09\\x20\\x21\\x23-\\x5b\\x5d-\\x7e\\x80-\\xff]|\\\\[\\x09\\x20-\\x7e\\x80-\\xff])*"';
        const chunkSize = new RegExp('^[0-9a-fA-F]+(?:[ \\t]*;[ \\t]*' + token + '(?:[ \\t]*=[ \\t]*(?:' + token + '|' + quoted + '))?)*$');
        if (!chunkSize.test(line.text)) { this.fail(); break; }
        this.remaining = parseInt(line.text.split(';')[0], 16);
        if (!Number.isSafeInteger(this.remaining)) { this.fail(); break; }
        this.state = this.remaining ? 'chunk-body' : 'trailers';
      } else if (this.state === 'trailers') {
        const previous = this.lineLength, line = this.line(buffer, offset, '\r\n', 65536);
        if (!line) break;
        this.totals.responseFramingBytes += previous + line.next - offset; offset = line.next;
        if (!line.text) this.state = 'header';
        else {
          const colon = line.text.indexOf(':'), name = line.text.slice(0, colon);
          if (colon < 1 || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)
              || /[\x00-\x08\x0a-\x1f\x7f]/.test(line.text.slice(colon + 1))
              || ['content-length', 'transfer-encoding'].includes(name.toLowerCase())) this.fail();
        }
      }
    }
    if (this.failed) this.totals.unparsedResponseBytes += buffer.length - offset;
  }
  close(hadError = false) {
    if (this.closed) return;
    this.closed = true;
    if (hadError) {
      this.totals.connectionResetErrors++;
      // A reset cannot truncate an already completely framed response with no
      // queued request. Keep the transport error, and classify at this exact
      // close event; aggregate end-of-process totals cannot prove this later.
      if (this.idle()) this.totals.idleConnectionResetErrors++;
      else this.totals.incompleteConnectionResetErrors++;
    }
    if (!this.failed && ((this.state === 'until-close' && hadError) ||
        this.methods.length || (this.state !== 'until-close' && (this.state !== 'header' || this.lineLength)))) this.totals.incompleteResponses++;
  }
  idle() { return !this.failed && this.state === 'header' && this.lineLength === 0 && this.methods.length === 0; }
}
module.exports = {ResponseCounter};
