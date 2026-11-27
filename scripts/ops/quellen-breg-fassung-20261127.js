"use strict";

// Inerter lokaler Vorpruefer. Keine Freigabe, kein Netz, kein Workerstart.
// Bestandsbindung ist keine historische KI-Lektuere und kein Neufetchbeleg.
const fs = require("node:fs");
const { isDeepStrictEqual: gleich } = require("node:util");
const R = require("../../lib/helmut/roh-quellenstaende");
const B = require("../../lib/helmut/ko-quellenfassung");
const Budget = require("../../lib/helmut/betriebskosten-budget");
const { createHash } = require("node:crypto");
const ZIEL = Object.freeze({
  raw: "rd-0477967d342ba91bd337044bd1a6ff70f7db589f8b7bd03ae35bfbf1a3054068",
  alt: "add680be81a04d0e6f3c9de92adc2c55d258401d4a2428191527ed7fc8fd5160",
  neu: "0968e51ad7faa8d8f2d74416e55ebcbb5a86312b6d2a8c1ba1d4ff44dbe6a795",
  kos: ["ko-vg-bundesregierung-20241119-743c6b", "ko-vg-entlastungen-20260417-6517e5"],
  kostenvertrag: "8c98b2e18ee5dc21c73561bbf5bad2d8cb6c76f8ccd533b3153270bbd7d9a348",
  alteCasHash: "76f8a7856e80e9ea9b614c1aa11b57af3029ad764570027c3f7ea9b13252af18",
  policyHash: "23e4bb853f7de2faafc471c0408e7de1e51875e8bc8e740d760796ee5dfb7bff",
  anker: {"archive":["0988609f9d2781689d2307af7b956aa651b21689cb69d51364a8edbbb4f86887","12a873c9483f3b95c831de07c96a423fbe4748af7d0a8c2d519081f3db77592c","183b7723db8ee943be02f479d2341d6d040cb1b205a8453b9fabb7e986f8550e","20430384a2a3319693892bcb5e383507127d0451cc589ee927083a9030b9a04d","239ace2aae6ab2ad9ff39e17583f9c2fc1f4ef8ea07b5cdb23b3c2338124d5ca","3b562e2d6a341e3820bd4c662604ee2092801897914f5ff4b63c39531ed7f309","5a988ac330a70333c12f4506627d924a784f4a8ea63d1cf1af34d7325bdf551d","609bdf233fe3c0979114d1f536818cd00e3d42bb9377431f7458692e5237a101","849cde9058163b0cbe7c05fa91ea555a7f17f982c44428fd7ff44709dc00e2d4","90c26af71b8b964042d78e8d967098b850f998b1ef4a3add3ad1a16a7e510360","966d9e3c28dfa1e5a95e450b9ee3b476a60ec8ef42c69c4384a2c6eedf2d6dde","ab4821fd905165b4ec2f9d01beb62fa7ef43f905ffaa3a145961e7682243a47b","ae5d98cbc7e3425e38abb00148b4cb41859e443a40ae3a10bf4e4a19d8b90c16","b0095dcd4e502d5393622b39df8847ab23183ad2e5e4b8dd33af24c168d009d6","c3149918bdaf363d563f53c2410b0fc5555d8dcc7bf44259b65b4f8d1e546021","db67da31bbc89d11e5f07828b0bcb63bda492e9d6baaacd1b1d8df0100f4f907","fa086caadc1bd5ddcc45f7b0f25789ebd7d0da57a7b3cbab62ff8ef61dbe0529"],"findings":["016934585597bf398b5a6ae0aaced084287cccf12c9d262a15a0b2f10ca00690","061d5a13e628e92148c6cadf56bd27d94fd65c87e4a95419d5367d5f983cf3d7","076b3175f81dbd08a64b0a00f753330fc5ed1655e50abfcb1eb1c4562b91c0f5","0e1c42228c6cddd9d821834aa03db57c96de510a39e93a1acb1f739fbf1d112a","144d25c7f454119e6282a26aece348d4d780d4aee07fefbb2100bbd27557e695","17bad0aab331c4449c552d09ccf62bb45d83f5146a0a8d34892255ee49554de6","17f4a1d01f549b51320ca632ed0fe4247d9e56c6cbebb4941c816d78fabcc22f","1845984c62d0631a69f0ab57712adeeef956f68b51bb2cdbb0f0d54f781d34fb","19e50431adf11ea8903bb6de05d6818fac6f13f59a6a72f101d808ce793c4ec7","1a75ae6b0fd0d5c04a62752b7d5df63f0e077d8d0290011cafefca307910ca51","1ff5b7e6c804136d877f38f45ec47a3a7dffaa9b01fe1440400b4a237e2c3155","20dbad3d05e3aee5abd60ca05ea682718252ca595ba5580e63e1bc7d1bcd18fe","220deee3339fada7ff936a316151730d9bf69bb6a80b091c5ca90f8fab778fc3","22f7892833be920fef8c5d98e4fdc430be4227c3fcd66b1756c408b282e0b4a8","2606f30fe290c290a16c773cbddfb128f12a4d61046bfc96a3c3ee89d6134433","273b7c94c1ed8a0a3b118a832f1e5dcf48a7e7cc6f33c5441c0146408d948bdd","29583413c604de3b6de91a544350c8e788aecded02460a7b812e2a6fe849c3e2","2b7c3840f2a51cc1b3e8ae1e42435797d63e0580671be54241e121c39966da07","2c6d158e62fffecb93fe4b752cbc521068c4f810d4abc832f2dd47903d79d718","2dbf01ec17547ee991869e763ec117427b21c033304d17532d5f51f457db9ad9","2e9f55b7e1f1af9b20b1926d5d67acbf2fc1fdbc7f63f7d73aa24b98322fffc9","2f435874b785a6bcd2edb0d740a1e2fdd47fd6075517dd12ebace8c2ebf872b5","3250b1c2f1a1b68fde1759d459b144ebef3b9ae3fdef30ffe908d85eee56466e","36c001a130bf6d7288cdbd75e0566fa3b1e4caa518e957b910c9a21c2298d876","375644f4f9e90f0774b0087dafc92a8c9da23bacb121fb918997316a93aff66c","38581e574e7dca2dd414bdca61c8d0a0dbcddbfa4e1c376b2cc71be2db85f0a2","398e566c82cc3931a7457426b8f2ab80c23cc7be518025841647aeca49668562","3a93f6850edcaee45436d57d290ae8f46e5ce88c43aa48b2910a6c212d047d91","3b7f68a1f528f87ee14ef45d646b69beff26ad5f4003f5f68adb5f1dc445dfaa","3f363e7efdc876e1ef406d7fa71efaeb81a074a3f171b6061c16f40bd2895f0a","406810c5880413475e3e81a641ca2ca83c43eb2e1c6a8d83a4508cd035b2c3fe","41b161a10710895e50351df602a84b8d56c1440288585c059eceb537bae59b93","45d83cef038986745db7958383f8aa0c48105ffae2b1f600eb8d4627cd52991a","4c7383d2d79ddb365f946bb2b79bcf647cf3095b79f380cef265d9a5e881d7e4","5104b7d0f351640eea13aaf5ba0a73737d850416a11aef0a6d37b0cb1eb3e23c","5246bf3b82b14b9bfe4a320936c58dfffffc571b083b26c79badacfb4b87df97","55406e566664fe71f412ac70f6a9f5e046c66d2d6dc39cb66e6c64a16c2ec917","591ea6a8b8091e209c431d20f2337b84be2904f66969c37d1d8755cb10a15839","59ae0583f43e4a92ab530721b4c662a221f90e9ff362ab94c664528cf298e463","5bae0c4adbe36d6fadd5ab3d5442d157d98ab8fc36d70a093da903cadf5e11e7","5bc6547a2d7a56e0055a2326b6ae9c70fe95a3c76f89eec47736d6b458d9caae","60e94475d5400d1340962da34d8b8c0295a46e04474d7340308c48c998d41810","6351b4c6aac7cce63206e2c449570d09f28b2843e261f325f9c9bdbecfed106d","687d3eb2f62ee335b6bb961efd35ce510aaac56f8bebc670bc4552bdbf101a91","6b5b35ecc87a9d3e7809bee0b46f83e3ffdac8a2161adba56e9aa2f794cf4df4","6bae642c80d8e5fddace3e8b2911c87e43aa2c80666c0d040d1769f2290d6103","6ef5698a7487dc95b5c574e265ab3c903c5355fb73f290f79c2cb41dfdbde4c4","6fc66341107bce5a433c64312bad135d112c40b38b6bf9e2838ddc79bd90904d","71a52509ecff280ab60d2cdd4a89eb04ac3be3e76010a023b0906e1df50ed5c0","73766c7e529f8a82cdee5ab07e75f4a701a2e5c5635f5fc36b39f57257649b39","75d7ecd13c33de04d7639c3742ae67238d69987b1cfda790d664e55057fcfb2e","76b41c42431ce3ba110da19fb904f51c073afc372dce35860cc61c15d39e8e46","7ac82dec0894bb1c7dc185007e4355f0836b674518377609e62a807dc451e01c","7d4607dfec49e3b7af70432ce4c45c2f581e88c35a01b9ef7d4ad816e65f52d7","80b35122095e3b96be9780588da242284fb8e75484bf2ef79954919c4062a770","829ae6cae7353d278f44aae5dc785e601f540cce7b788512cb64c18bcb1d3b84","88c6799d91a74f5de6e70511074ef3d67af085866b58e1da07cb064920276b8e","8af685ce09c7175a147ee0a540c621bb29b639170f93316c94193d4c7894b6a8","906707bc05a7ccc13cb4ae326b1be383d4516ea2ef74e54e2c44d2a43458bcb8","95e315c8c3484d4f9cc2acc4cc7fbc80135ba92c4ec5ba9f8aecae899540c938","971263893d21c80f77c497504e9d1d62c9777e6c6738ca24a387591d430b13a9","99dec8fb252a93963243ea9b9a1c52ad2815722cb2290699a2fce395773cd018","9fd7d7625617fd449dca8a7fe17a68029a0aa4bdc3b67862641f9713b273dde1","a0b3122227bf09842b3f467b3c918b9152e7a46933a7744aeb1873e5244cd386","a10f7b8447f84e5ac13b03d0a1a4edf4990b4dee88b9cec3793c1172d498d97b","a14c258a3fadea21866d5307846764cc82ca39e55d5cf6903da2062dbe32038b","a6de2d41b6ad6ea1482b039e719a5498f020a6aaef9d438d3bf46e09f84aad74","abc130d9d21b43d43014a6904276cbabb3c9fc65da8a14a5324104c6aad655cb","ac79a02da3c5e0145dff39d3f7a9b9dde4b0bd0c4e4f9c215d683ea844cfbbf5","ad0f476732c71e821c4d20fe3d7513114f8cfdc29e3b11b60a9249cfba90942d","ad8add298e845b28e553f56aa0b808955c0c98770704f72d42f3098edf418f4e","af1fc5df6c67cd5a030d638db74e60d06243d8f445b2481cecc1ea38608208fd","afc801d25f016d78d3a5e42d46a7760de2870c76930e7803f2c65e15eec0c4b1","b14a32fd0d197dd0e8e0138fab846d3d0a71f8248a2b9a71aab31ba8e9856a5e","b2b9fa6aec1b7744ac88df07a74fdb289acaac501fe03ab902cc1f87cc832999","b41674cdca7e8d01fbab75a5543196219ac9defd3c73bf30ed1a5d0ace4d53df","b828da76e886c0dc786a2e43ed26f7f189bbb866c65705fe48225890ea435c93","bacbc0065115a01833e80bdd693d508104500587ccfb5ee3b77594d923ab6f13","bce9b656ab2e50a0fad846381cbf36494eba52473248920c1c58d371c18f7865","bdee98d5a3dea8c0bb0f7104eda6b44b65fdd71c840ed6ad583120d0c826cbb5","bdf81b3d54c24cf239c958c798ee777b0eb0b58b4f14fca29fdb5e414818c16c","c33f1661c7aa1e642b573e3c10362ba7745f6a387344624ba3b40c5a8adbee70","c443e6c9fe1dcb5952baa92ffe311e821348ad8a7044c7c30d972068241630f2","c6ed65384a103621d1e0e27bede8d6bbfa57ec4828bdc1f90f56228a3a70ca28","c865e0a081020bde6b2ac6e62641f4eea46de6d0da4b8baa60b3563dfe193ecc","c992cf08a9f98ab8f0956d0bb9927816d6ac7aba6b5a635c2dfb039a89e86ef6","c9abc9146fffdb5896f4655d379b43cf8671bcbaadbc8a38f06aa1842ca718c2","cb36c020157baaede392c44262baebc1758502dd5d5842f3effb6c311e53458a","cbb75214707cf31ccc8352245025104783e715106c77cc06e07888e0a4e0f71b","cc9ba6c9b2fc48bc65f506e05c3fce7946f58c5cc937b859f54f6f938b95eec7","d3ae646e59cd61fd74b2a727a89aeddc44fb0d6085aa8399f69b55bdc7bae6c5","d66497ec0bd235c6c85d1d87209afebcb56d048e5b96db4f177541ea5c6c3958","d6ac240a37a7759732a581fc88b861c7ee520c23ffe942f1b6c75f067766f5df","dbc40d64578bb495b9a273d0f24df0bf9e7519e191afb1e94a653b64e9e68228","dc8b7bed5dddf6b9f474d7cb441a4497a974e62ca64a106e834e1ef29aeccff1","e73ff6aa3d09b4bf4bf6d7bf3adf23f9e6a2fcce58b997883f33b97212033f73","eb3e41a9516e5c85d0208fb22f9196d0064385a461841e5c2df8c65f6d60f79d","edde7fb78a2ecf50471de05c4c35ff8bc1c96a80f2ff194a8ae0b411ab162afa","f115a22f71281581494217ec7f4e1391836b0d68134244cb334c5281c8714ecb","f55e249ff926c5ff10e4d8487602503c7c4f427366956adc304b1e804609f3bf","f76b24743ebd0983e9f4a2ed59644ae1299f08caae4d4bb80a369df67ea0f07d","f789e94f3ac2d3eca77bdf77a4f58e9f25070ce0b871647a0d055430cbff7d73","f8d7b6c1ab514a3b0168b743d257ca5e75642410ee2880c01de841315fca0490","fd927b1e2bda71979414937f407b73ac34105c6da96e294fd282f5964a547cd9","ff96818d92f4f6c540910f6ef4274020f5f91bb2ecc9b227a9ee165f76cee803"]},
  bestand: {"rawIds":"79487a377f2c9c41f84e46fc3213a052c4b5311a237949be0797febdd341b3f5","roh":"79cf43d3047b04c7058ab1d6964f226ee6ee5db76f82836ade583206d57b3012","kos":"bc3f4a5149fde1c30c93b407f3fb95d3550691ddcf021e221f16c3c5754b0461","kanten":"de63110037f2e603ba24d16e13c191899f5d4c732f62fe26e869e136823a1c28","zielKanten":"02b4c92e93e82a32d28d3cc893aa818a6a6af5446272c3ef693bbe18396c7110","archive":"81870ffc255031db45b29a2346f0d5edff9cbdb81cb8d8065ab86ec12fba5cac","findings":"0f1cdd8d050e69c25bf34022e90b6e3c11403c88902f35e13cd54fbae61dd530"}
});
const fordere = (ok, grund) => { if (!ok) throw Error("breg-fassung: " + grund); };
const hash = text => createHash("sha256").update(text).digest("hex");
const sort = (rows, key) => [...rows].sort((a,b)=>a[key]<b[key]?-1:a[key]>b[key]?1:0);
const daten = d => Object.fromEntries(Object.entries(d).map(([k,v]) =>
  [k, ["created_at","retrieved_at","published_at"].includes(k) && v != null
    ? new Date(v).toISOString() : v]));
function typgleich(archiv, raw) {
  return gleich(daten(Object.fromEntries(Object.keys(raw).map(k=>[k,archiv[k]??null]))), daten(raw));
}
function pruefeAnker(rows, anker, art) {
  fordere(Array.isArray(rows)&&Array.isArray(anker),"Originalanker "+art);
  const vorhanden=rows.map(B.digest);
  for(const h of anker){const i=vorhanden.indexOf(h);
    fordere(i>=0,"unveraenderte Originalanker "+art);vorhanden.splice(i,1);}
}
function autoritaet(d) {
  return [d.source_id??null,d.source_name??null,d.source_type??null,d.link_type??null,d.publisher_id??null,
    d.raw?.retrievalPathId??null,d.raw?.sourcePriority??null,d.raw?.originalUrl??null];
}
// Generischer, rein lokaler Fachkern fuer synthetische Gegenfaelle. Der
// Produktwrapper darunter bindet zusaetzlich ausschliesslich den festen Bestand.
function plane(s, ziel) {
  fordere(Array.isArray(s.roh) && s.roh.length === 60 && new Set(s.roh.map(r=>r.id)).size === 60
    && Array.isArray(s.kos) && s.kos.length === 2 && Array.isArray(s.kanten) && s.kanten.length === 61
    && Array.isArray(s.archive) && s.archive.length >= 17 && Array.isArray(s.findings)
    && gleich(s.bindungen, []), "Bestand60/2/61 mit Originalankern ohne Vorbindung");
  const ids = sort(s.roh,"id").map(r=>r.id);
  fordere(gleich(ids,ziel.rawIds) && gleich(sort(s.kos,"id").map(k=>k.id),ziel.kos)
    && new Set(s.kanten.map(l=>l.knowledge_object_id+"|"+l.raw_document_id)).size === 61,
  "feste Quellen-/Kantenmenge");
  for (const [i,id] of ziel.kos.entries()) {
    const k=s.kos.find(k=>k.id===id), links=s.kanten.filter(l=>l.knowledge_object_id===id);
    fordere(k.ko_version===1 && k.understanding_status==="complete" && links.length===(i?1:60)
      && k.verstehen_fencing===(i?1:null) && (i?links[0].raw_document_id===ziel.raw:
        gleich(links.map(l=>l.raw_document_id).sort(),ids)), "vollstaendige alte KO-Versionen");
  }
  fordere(gleich(sort(s.zielKanten,"knowledge_object_id"),sort(s.kanten.filter(l=>l.raw_document_id===ziel.raw),"knowledge_object_id")),
    "keine weiteren ungeschuetzten Zielkanten");
  pruefeAnker(s.archive,ziel.anker.archive,"archive");
  pruefeAnker(s.findings,ziel.anker.findings,"findings");
  fordere(new Set(s.archive.map(a=>a.id)).size===s.archive.length
    && s.findings.every(f=>ids.includes(f.raw_document_id)),"eindeutige Archive und feste Findings-Identitaeten");
  for(const a of s.archive) {
    const data=a.data,d=data?.dokument,raw=s.roh.find(r=>r.id===d?.id);
    fordere(data?.version===1 && Object.keys(data).sort().join()==="dokument,quellenHash,version"
      && raw && data.quellenHash===R.standHash(d) && a.id===B.pointer(d.id,data.quellenHash)
      && !Object.hasOwn(d,B.FELD),"Archivschema/RawID/Standhash");
    if(!ziel.anker.archive.includes(B.digest(a)))
      fordere(d.url===raw.url && d.canonical_url===raw.canonical_url && gleich(autoritaet(d),autoritaet(raw)),
        "zusaetzliches Archiv mit gleicher Quellenautoritaet");
  }
  const neueArchive=[], zuordnung=new Map();
  for(const raw of s.roh) {
    const stand=R.standHash(raw), id=B.pointer(raw.id,stand);
    const a=s.archive.find(a=>a.id===id);
    if(a) {
      fordere(a.data.version===1 && a.data.quellenHash===stand && R.standHash(a.data.dokument)===stand
        && typgleich(a.data.dokument,raw), "bestehender Archivkonflikt");
      zuordnung.set(raw.id,{id,sha256:B.digest(a.data)});
    } else {
      // Kein blindes Wiederverwenden einer anderen historischen Fassung.
      const data={version:1,quellenHash:stand,dokument:raw};
      neueArchive.push({id,data});zuordnung.set(raw.id,{id,sha256:B.digest(data)});
    }
  }
  fordere(neueArchive.length<=47 && zuordnung.size===60,"hoechstens47 fehlende heutige Bestandssnapshots");
  const alt=s.roh.find(r=>r.id===ziel.raw), neu=s.archive.find(a=>a.id===B.pointer(ziel.raw,ziel.neu));
  fordere(R.standHash(alt)===ziel.alt && neu?.data?.quellenHash===ziel.neu
    && R.standHash(neu.data.dokument)===ziel.neu && neu.data.dokument.id===ziel.raw
    && alt.url===neu.data.dokument.url && alt.canonical_url===neu.data.dokument.canonical_url,
  "exakte Alt-/Neufassung derselben Quelle");
  const bindungen=[];
  for(const k of s.kos) {
    const links=s.kanten.filter(l=>l.knowledge_object_id===k.id).map(l=>({
      raw_document_id:l.raw_document_id,raw_source_version_id:zuordnung.get(l.raw_document_id).id,
      raw_source_version_sha256:zuordnung.get(l.raw_document_id).sha256}));
    const manifest=B.manifest(links), digest=B.digest(manifest);
    bindungen.push(...manifest.map(l=>({...l,knowledge_object_id:k.id,ko_version:1,quellen_count:links.length,manifest_sha256:digest})));
  }
  const nach={...alt};
  for(const key of ["title","source_id","source_name","source_type","published_at","summary","retrieved_at","raw"])
    nach[key]=neu.data.dokument[key]??null;
  nach.content_fingerprint=null;
  for(const key of ["published_at","retrieved_at"])
    if(nach[key]!=null) nach[key]=new Date(nach[key]).toISOString().replace(/(\.\d*?)0+Z$/,"$1Z").replace(/\.Z$/,"Z").replace(/Z$/,"+00:00");
  fordere(R.standHash(nach)===ziel.neu,"Promotionsfelder");
  return {neueArchive:sort(neueArchive,"id"),bindungen:bindungen.sort((a,b)=>
    (a.knowledge_object_id+"|"+a.raw_document_id).localeCompare(b.knowledge_object_id+"|"+b.raw_document_id)),alt,nach,
    anzahl:{vorarchive:s.archive.length,neueArchive:neueArchive.length,findings:s.findings.length,bindungen:61,promotionen:1}};
}
function pruefe(v,{jetztMs=Date.now()}={}) {
  fordere(v?.version===1 && v.modus==="vorschau" && typeof v.inhalt==="string"
    && Buffer.byteLength(v.inhalt)<=16*1024*1024 && hash(v.inhalt)===v.digest,"Vorschauhash");
  fordere(Number.isFinite(jetztMs) && Date.parse(v.gelesenAm)<=jetztMs
    && Date.parse(v.gelesenAm)>=jetztMs-300000
    && new Date(jetztMs).toISOString().slice(0,10)===v.tag,"frischer Fuenfminuten-Vorwert");
  const s=JSON.parse(v.inhalt);
  for(const key of ["roh","kos","kanten","zielKanten"])
    fordere(B.digest(s[key])===ZIEL.bestand[key],"fester Originalbestand "+key);
  const ruhe=s.sicherung;
  fordere(ruhe && ["aktiveJobs","aktiveSlots","aktiveLlm","aktiveLocks"].every(k=>gleich(ruhe[k],[])),
    "keine aktive Workerarbeit");
  const cas=ruhe.aktiveCas;
  fordere(Array.isArray(cas) && (!cas.length || cas.length===7 && B.digest(cas)===ZIEL.alteCasHash
    && cas.every(c=>["reserviert","modell-laeuft"].includes(c.zustand) && typeof c.besitzer==="string"
      && c.besitzer && Number.isFinite(Date.parse(c.lease_bis)) && Date.parse(c.lease_bis)<jetztMs)),
  "nur exakt bekannte abgelaufene CAS");
  const buch=ruhe.kostenBuch, stand=Budget.pruefeBuch(buch,buch?.contract);
  fordere(buch.contractHash===ZIEL.kostenvertrag && buch.contract.dailyLimitUsd===1
    && buch.contract.totalLimitUsd===30 && buch.frozen===null && stand.total<=30000000
    && (stand.days[v.tag]||0)<=1000000 && Number.isSafeInteger(ruhe.globalUsed) && ruhe.globalUsed<=100
    && ruhe.globalUsed>=0 && Number.isSafeInteger(ruhe.originalUsed) && ruhe.originalUsed>=0
    && ruhe.originalUsed<=16,"unveraenderter1/30USD/100/16-Vertrag");
  const ziel={...ZIEL,rawIds:s.roh.map(r=>r.id).sort()};
  const plan=plane(s,ziel), d=s.archive.find(a=>a.id===B.pointer(ZIEL.raw,ZIEL.neu)).data.dokument;
  fordere(d.source_id==="bundesregierung" && d.source_name==="Bundesregierung" && d.source_type==="ministry"
    && d.raw?.retrievalPathId==="rp-bundesregierung" && typeof d.summary==="string" && d.summary.trim(),
  "gespeicherte amtliche RSSfassung");
  return {version:1,modus:"vorbereitet",aktiviert:false,gelesenAm:v.gelesenAm,tag:v.tag,
    digest:v.digest,planDigest:B.digest(plan),
    hinweis:"Kein GO. Vollstaendige Vorschau privat erhalten. Erst nach Migration und beiden frischen Plattformbelegen aktivieren."};
}
module.exports={ZIEL,plane,pruefe,typgleich,pruefeAnker};
if(require.main===module)try{console.log(JSON.stringify(pruefe(JSON.parse(fs.readFileSync(0,"utf8")))));}
catch(e){console.error(e.message);process.exitCode=1;}

