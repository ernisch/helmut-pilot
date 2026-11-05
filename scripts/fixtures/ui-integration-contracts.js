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
module.exports={integrationPayload};
