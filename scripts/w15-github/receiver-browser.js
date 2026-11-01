'use strict';
function startReceiverBrowser(settings) {
  const input = document.getElementById('passphrase'), start = document.getElementById('check');
  const status = document.getElementById('status');
  const links = ['key-download', 'phrase-download', 'report-download'].map(id => document.getElementById(id));
  const recipient = '7E3998A6C2CB948C69A2EE51F4267ABF26796EDC';
  const control = new TextEncoder().encode('HELMUT W15 existing 7E recipient control only 20261029\n');
  const config = { maxDecompressedMessageSize: 65536, allowUnauthenticatedMessages: false, allowUnauthenticatedStream: false };
  let urls = [];
  function need(value) { if (!value) throw new Error('LOCAL_RECEIVER_CHECK_REJECTED'); }
  function bytes(text, maximum) {
    need(typeof text === 'string' && text.length > 0 && text.length <= Math.ceil(maximum / 3) * 4);
    need(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text));
    const raw = atob(text); need(btoa(raw) === text && raw.length <= maximum);
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  }
  async function sha(value) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value)), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function clearKey(key) {
    if (!key) return;
    for (const packet of [key.keyPacket, ...(key.subkeys || []).map(value => value.keyPacket)]) {
      try { packet?.clearPrivateParams?.(); } catch { /* Continue clearing other packets. */ }
    }
  }
  function reset() {
    urls.forEach(url => URL.revokeObjectURL(url)); urls = [];
    links.forEach(link => { link.hidden = true; link.removeAttribute('href'); });
  }
  function download(index, content, filename, type) {
    const url = URL.createObjectURL(new Blob([content], { type })); urls.push(url);
    links[index].href = url; links[index].download = filename; links[index].hidden = false;
  }
  if (location.protocol !== 'file:' || !globalThis.crypto?.subtle || !globalThis.openpgp) {
    status.textContent = 'Bitte die heruntergeladene HTML-Datei lokal im Browser öffnen. Die Drive-Vorschau genügt nicht.';
    return;
  }
  input.disabled = false; start.disabled = false;
  status.textContent = 'Bereit. Internet kann ausgeschaltet bleiben. Keine Daten werden hochgeladen.';
  start.addEventListener('click', async () => {
    if (start.disabled) return;
    reset();
    let archivePhrase = input.value, protectedB64 = '', receiverPhrase = '', parsed;
    let dcf, protectedKey, unlocked;
    const buffers = [];
    const keep = value => { need(value instanceof Uint8Array); buffers.push(value); return value; };
    input.value = ''; input.disabled = true; start.disabled = true;
    try {
      need(archivePhrase.length >= 32 && archivePhrase.length <= 256 && /^[\x20-\x7e]+$/.test(archivePhrase));
      status.textContent = 'Bestehender Empfängerschlüssel wird ausschließlich lokal vorbereitet …';
      const cipher = keep(bytes(settings.dcfCipherBase64, 569));
      need(cipher.length === 569 && await sha(cipher) === settings.dcfCipherSHA256);
      const recovered = await openpgp.decrypt({ message: await openpgp.readMessage({ binaryMessage: cipher, config }), passwords: archivePhrase, format: 'binary', config });
      archivePhrase = '';
      const plainKey = keep(recovered.data);
      need(plainKey.length > 0 && plainKey.length <= 65536 && await sha(plainKey) === settings.dcfExportSHA256);
      dcf = await openpgp.readPrivateKey({ binaryKey: plainKey, config });
      need(dcf.getFingerprint().toUpperCase() === settings.dcfFingerprint && dcf.isDecrypted());
      const wrapper = keep(bytes(settings.wrapperBase64, 3298));
      need(wrapper.length === 3298 && await sha(wrapper) === settings.wrapperSHA256);
      const opened = await openpgp.decrypt({ message: await openpgp.readMessage({ binaryMessage: wrapper, config }), decryptionKeys: dcf, format: 'binary', config });
      clearKey(dcf); dcf = undefined; plainKey.fill(0);
      const wrapperPlain = keep(opened.data); need(wrapperPlain.length > 0 && wrapperPlain.length <= 65536);
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(wrapperPlain));
      need(parsed && !Array.isArray(parsed) && typeof parsed === 'object');
      const markers = ['schema', 'version'].filter(key => Object.hasOwn(parsed, key));
      need(markers.length === 1 && parsed[markers[0]] === 'helmut-w15-receiver-key-recovery/1');
      protectedB64 = parsed.protectedSecretKeyBase64;
      const keyBytes = keep(bytes(protectedB64, 36864));
      const phraseBytes = keep(bytes(parsed.secretKeyPassphraseBase64, 4096));
      receiverPhrase = new TextDecoder('utf-8', { fatal: true }).decode(phraseBytes);
      need(receiverPhrase.length > 0 && !/[\0\r\n]/.test(receiverPhrase));
      parsed = undefined; wrapperPlain.fill(0); phraseBytes.fill(0);
      const prefix = new TextDecoder('utf-8').decode(keyBytes.subarray(0, 40));
      protectedKey = await openpgp.readPrivateKey(prefix.startsWith('-----BEGIN PGP PRIVATE KEY BLOCK-----')
        ? { armoredKey: new TextDecoder('utf-8', { fatal: true }).decode(keyBytes), config }
        : { binaryKey: keyBytes, config });
      need(protectedKey.getFingerprint().toUpperCase() === recipient && !protectedKey.isDecrypted());
      unlocked = await openpgp.decryptKey({ privateKey: protectedKey, passphrase: receiverPhrase, config });
      need(unlocked.getFingerprint().toUpperCase() === recipient && unlocked.isDecrypted());
      const encrypted = keep(await openpgp.encrypt({ message: await openpgp.createMessage({ binary: control }), encryptionKeys: unlocked.toPublic(), format: 'binary', config }));
      need(encrypted.length > 0 && encrypted.length <= 16384);
      const checked = await openpgp.decrypt({ message: await openpgp.readMessage({ binaryMessage: encrypted, config }), decryptionKeys: unlocked, format: 'binary', config });
      const actual = keep(checked.data);
      need(actual.length === control.length && actual.every((value, index) => value === control[index]));
      download(0, protectedB64, 'HELMUT_W15_RECEIVER_PROTECTED_KEY_B64.PRIVATE.txt', 'text/plain;charset=utf-8');
      download(1, receiverPhrase, 'HELMUT_W15_RECEIVER_PASSPHRASE.PRIVATE.txt', 'text/plain;charset=utf-8');
      const report = { status: 'PASS_BROWSER_EXISTING_RECIPIENT_CONTROL_ONLY', recipientFingerprint: recipient,
        wrapperSHA256: settings.wrapperSHA256, originalCipherDecrypted: false, archiveRestoreAccepted: false,
        end500Acceptance: false, mock500Acceptance: false, executionAuthority: false };
      download(2, JSON.stringify(report) + '\n', 'HELMUT_RECEIVER_CONTROL.SAFE.json', 'application/json');
      status.textContent = 'Empfängerprüfung erfolgreich. Speichere die zwei privaten Dateien und behandle sie wie Passwörter. Der SAFE-Beleg enthält keine Geheimwerte. Kein 500er-Start wurde freigegeben.';
    } catch {
      reset();
      status.textContent = 'Lokale Wiederherstellung gestoppt. Keine Übergabedateien freigegeben. Keine Passphrase oder Schlüsselwerte zur Fehlersuche weitergeben.';
    } finally {
      archivePhrase = ''; protectedB64 = ''; receiverPhrase = ''; parsed = undefined; input.value = '';
      buffers.forEach(value => value.fill(0));
      clearKey(dcf); clearKey(protectedKey); clearKey(unlocked);
      dcf = protectedKey = unlocked = undefined;
      input.disabled = false; start.disabled = false;
    }
  });
  globalThis.addEventListener('pagehide', reset);
}
