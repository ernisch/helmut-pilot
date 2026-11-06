"use strict";
const { payloadFor } = require("./ui-office-binding");

// App-start and projection fields match server.js, lage.mapSource and
// radarState/briefing-bereichsvertrag. Synthetic data only, no backend imports.
function integrationPayload() {
  const payload=payloadFor();
  const now=new Date().toISOString(), yesterday=new Date(Date.now()-864e5).toISOString();
  payload.profile.officeFormats=[];
  payload.version="ui-contract-fixture";
  payload.tasks=[{id:"task-contract",title:"Synthetische Aufgabe",status:"open"}];
  payload.notes=[{id:"note-contract",text:"Synthetische Notiz"}];
  payload.briefing.lageBriefing={available:false,demo:false,reason:"no-current-sources",generatedAt:now,
    latestUpdatedAt:yesterday,paragraphs:[],vorgaenge:[{
      id:"vorgang-a",vorgangId:"vorgang-a",title:"Älterer belegter Vorgang",displayTitle:"Älterer belegter Vorgang",
      displayCategory:"Synthetische Quelle",status:"beobachtung",whyRelevant:"Synthetischer Mandatsbezug.",
      summary:{wasIstPassiert:"Vorhandener belegter Sachstand.",warumWichtig:"Synthetische Einordnung.",werIstBetroffen:"Synthetische Betroffene."},
      sources:[{name:"Synthetische amtliche Quelle",type:"Amtliche Quelle",host:"example.test",url:"https://example.test/ui/lage",
        dateLabel:"Synthetisches Quelldatum",publishedAt:"",documentType:"Web"}],chronologie:[],documents:[]
    }]};
  const mention={documentId:"doc-curated",vorgangId:"vorgang-curated",title:"Synthetisches UI Profil wird erwähnt",
    sourceName:"Synthetische Radarquelle",sourceUrl:"https://example.test/ui/curated",publishedAt:yesterday,
    linkType:"direct",relationTypes:["mention"],mentionLabel:"Name in der Quelle",mentionTone:"unknown",
    evidence:"Die Quelle nennt deinen Namen. Eine Bewertung des Tons oder der Resonanz liegt nicht vor.",
    beobachtungsBeleg:{art:"eigenerwaehnung",documentIds:["doc-curated"]}};
  const raw={...mention,documentId:"doc-raw",vorgangId:"vorgang-raw",title:"ROHKANDIDAT NICHT ANZEIGEN",sourceUrl:"https://example.test/ui/raw",publishedAt:now};
  payload.briefing.currentRadarState={generatedAt:now,profileId:payload.profile.id,status:"fresh",lastUpdated:now,
    summary:{line1:"ROHE ZUSAMMENFASSUNG NICHT ANZEIGEN"},mentions:[mention,raw],
    environment:{party:[],constituency:[],committees:[]},dynamics:[],articles:[raw],
    anzeige:{status:"stale",lastUpdated:yesterday,summary:{line1:"Kuratierter Radarhinweis."},mentions:[mention],
      environment:{party:[],constituency:[],committees:[]},dynamics:[],articles:[]},
    quality:{status:"fresh",reason:null,sourcesLoaded:true,lastUpdated:now}};
  return payload;
}
function quietIntegrationPayload() {
  const payload=integrationPayload();
  const receiptAt="2026-11-06T05:15:00.000Z", sourceAt="2026-11-05T09:20:00.000Z";
  const vorgaenge=Array.from({length:10},(_,index)=>({
    id:`quiet-vorgang-${index+1}`,vorgangId:`quiet-vorgang-${index+1}`,
    title:`Synthetischer belegter Sachstand ${index+1}`,displayTitle:`Synthetischer belegter Sachstand ${index+1}`,
    displayCategory:"Synthetische amtliche Quelle",status:"beobachtung",updatedLabel:"05. Nov. 2026",
    displaySummary:`Vorhandener synthetischer Sachstand ${index+1} aus dem gespeicherten Lagebericht.`,
    summary:{wasIstPassiert:`Vorhandener synthetischer Sachstand ${index+1}.`,warumWichtig:"Synthetischer Mandatsbezug.",werIstBetroffen:"Synthetische Betroffene."},
    sources:[{name:`Synthetische Quelle ${index+1}`,url:`https://${index===0 ? "www." : ""}example.test/ui/quiet/beleg-${index+1}`,
      publishedAt:sourceAt,dateLabel:"05. Nov. 2026",type:"Amtliche Quelle",host:"example.test"}],
    chronologie:[],documents:[]
  }));
  payload.briefing.generatedAt="2026-11-06T14:37:00.000Z"; // HTTP projection time is not the stored run time.
  payload.briefing.items=[];
  payload.briefing.personalizedRecommendations=[];
  payload.briefing.themeOfDay=null;
  payload.briefing.currentHelmutState={profileId:payload.profile.id,status:"empty",available:false,
    generatedAt:payload.briefing.generatedAt,briefingType:"morning",primaryItem:null,primaryVorgangId:null,
    recommendation:"",items:[],emptyState:{kind:"quiet"},qualityStatus:"partial",staleState:false,
    frischeVertrag:{aktuell:true,ruhelage:true,berlinTag:"2026-11-06",lauf:{erzeugtAm:receiptAt},
      hinweis:"Heute liegt keine neue Meldung vor. Ältere Vorgänge stehen unten als weiterhin relevant oder Hintergrund."}};
  payload.briefing.lageBriefing={available:true,demo:false,fromCache:true,generatedAt:"2026-11-06T05:00:00.000Z",
    paragraphs:vorgaenge.slice(0,2).map((v,index)=>({
      text:index===0 ? "Der synthetische Lagebericht enthält den belegten Sachstand zur Ausschussberatung. Eine zusätzliche Tagespriorität ist darin nicht ausgewiesen."
        : "Der zweite synthetische Absatz dokumentiert die vorhandene Beratung zum Förderprogramm. Eine neue Entscheidung oder Frist ist nicht belegt.",
      vorgangIds:[v.vorgangId],sources:v.sources.map(q=>({...q,url:q.url.replace("//www.","//"),publishedAt:"2026-11-05T09:20:00+00:00"}))
    })),vorgaenge};
  return payload;
}
function pendingQuietIntegrationPayload() {
  const payload=quietIntegrationPayload();
  const lage=payload.briefing.lageBriefing;
  lage.fromCache=false;
  lage.pendingNarrative=true;
  lage.generatedAt=payload.briefing.generatedAt; // cacheOnly response time is not narrative creation time.
  lage.paragraphs=[];
  lage.vorgaenge=lage.vorgaenge.slice(0,9);
  for (const index of [1,3,4,6,8]) {
    const v=lage.vorgaenge[index];
    v.displaySummary=index===3 ? "Keine nutzbaren Quellentexte für eine Zusammenfassung."
      : "Artikelauszug fehlt; nur Quellentitel verfügbar.";
    v.summary.wasIstPassiert=v.displaySummary;
  }
  lage.vorgaenge[4].displayCategory="Quellenhinweis";
  lage.vorgaenge[4].displaySummary="Dieser synthetische Quellenhinweis ist kein belastbarer Sachstand.";
  lage.vorgaenge[8].displaySummary="";
  lage.vorgaenge[8].summary.wasIstPassiert="";
  // One valid item uses the existing structured summary instead of displaySummary.
  lage.vorgaenge[5].displaySummary="";
  lage.vorgaenge[5].summary.wasIstPassiert="Der gespeicherte synthetische Sachstand sechs bleibt aus der strukturierten Zusammenfassung lesbar.";
  return payload;
}
module.exports={integrationPayload,quietIntegrationPayload,pendingQuietIntegrationPayload};
