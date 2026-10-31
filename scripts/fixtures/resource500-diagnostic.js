"use strict";
// Entirely invented performance scenarios. No original pin, source qualification,
// operator admission or professional judgement is manufactured by this fixture.
const assert=require("node:assert/strict"),crypto=require("node:crypto");
const P=require("../../lib/helmut/synthetik-500-profile");
const THEMES=["Wohnungsbau","Digitalisierung","Bildung","Pflege","Verkehr","Energie","Haushalt","Umwelt"];
const VIEWS=["Planungsnotiz","Anhoerungsprotokoll","Finanzuebersicht","Projektbericht"];
const sha=x=>crypto.createHash("sha256").update(typeof x==="string"?x:JSON.stringify(x)).digest("hex");
function cases(epoch){
  assert.equal(new Date(epoch).toISOString(),epoch);
  const parties=[...new Set(P.erzeuge().profile.map(p=>p.partei))];
  return Array.from({length:96},(_,index)=>{
    const topic=THEMES[index%8],party=parties[Math.floor(index/8)%6],marker="CASE_R500_"+String(index).padStart(3,"0");
    const date=new Date(Date.parse(epoch)-(index%3)*86400000-3600000).toISOString();
    const title=topic+": synthetischer Projektbericht "+String(index).padStart(3,"0");
    const documents=VIEWS.map((view,variant)=>{
      const facts=Array.from({length:12},(_,n)=>({abschnitt:n+1,
        region:["Berlin","Brandenburg","Bund"][index%3],thema:topic,
        bestand:30+index*3+n,planung:8+variant*7+n,
        betragTausendEuro:120+index*11+n*17,
        bedingung:["nach abgeschlossener Pruefung","unter Vorbehalt der Beratung","bei verfuegbarer Kapazitaet"][n%3],
        hinweis:["Eine Entscheidung ist noch offen.","Die Berechnung gilt ausschliesslich fuer dieses fiktive Szenario.",
          "Das Protokoll trennt den Bestand von vorgeschlagenen Aenderungen.","Die Projektgruppe benennt weitere Pruefschritte."][n%4]}));
      const summary=[marker+". Vollstaendig erfundene Diagnosequelle, kein Bericht ueber reale Politik.",
        view+" zum Thema "+topic+" im Modellprojekt "+index+".",
        ...facts.map(f=>"Abschnitt "+f.abschnitt+": Im Szenario "+f.region+" werden "+f.bestand+
          " bestehende Einheiten und "+f.planung+" geplante Einheiten erfasst. Die Modellrechnung nennt "+
          f.betragTausendEuro+" Tausend Euro "+f.bedingung+". "+f.hinweis)].join("\n");
      const url="https://example.invalid/resource-diagnostic/"+index+"/"+variant;
      return {id:"rd-resource500-"+index+"-"+variant,title:title+" / "+view,
        summary,url,canonical_url:url,source_name:"Fiktive Diagnosequelle "+variant,
        source_type:"media",document_type:"article",confidence:"high",link_type:"direct",
        published_at:date,retrieved_at:epoch,created_at:epoch,content_hash:sha(summary),
        raw:{syntheticDiagnosticOnly:true,marker,variant,facts}};
    });
    return {index,marker,topic,party,title,date,documents};
  });
}
function response(request,schema,epoch,prepared=cases(epoch)){
  assert(schema&&typeof schema==="object");
  const markers=[...new Set(JSON.stringify(request.input).match(/CASE_R500_[0-9]{3}/g)||[])];
  assert.equal(markers.length,1,"diagnostic-one-explicit-case");
  const data=prepared[Number(markers[0].slice(-3))];assert(data&&data.marker===markers[0]);
  const value={id:"ko-resource500-"+data.index,vorgang_id:"vg-resource500-"+data.index,
    ko_version:1,status:"neu",confidence_score:85,source_document_count:4,
    headline:data.title,display_title:data.title,display_summary:"Im vollstaendig fiktiven Modellprojekt werden Bestand, Planung und offene Pruefschritte zu "+data.topic+" getrennt dargestellt.",
    was_ist_passiert:"Die fiktive Projektgruppe hat vier Diagnoseunterlagen zu "+data.topic+" vorgelegt. Eine Entscheidung ist noch offen.",
    warum_wichtig:"Der synthetische Vorgang betrifft das Testthema "+data.topic+" und ermoeglicht die Pruefung der profilbezogenen Verarbeitung.",
    wer_ist_betroffen:"Ausschliesslich fiktive Projektgruppen im Diagnosedatensatz.",zeitdruck:"mittel",
    handlungsempfehlung:"Unterlagen fuer eine spaetere Beratung vergleichen.",
    parteien:[data.party],ausschuesse:[],ministerien:[],risiken:["Ungeklaerte Modellannahmen"],chancen:["Nachvollziehbare Gegenueberstellung"],
    mentioned_people:[],mentioned_mps:[],mentioned_parties:[data.party],mentioned_committees:[],
    mentioned_ministries:[],mentioned_locations:[],mentioned_organizations:[],
    tags:[data.topic],policy_field:data.topic,political_level:"bund",stage:"Beratung",instrument:"Modellprojekt",
    why_relevant:"Das Profilthema "+data.topic+" ist im fiktiven Quellenbestand enthalten.",recommendation:"Modellannahmen und offene Pruefschritte vergleichen.",
    display_category:"Synthetische Diagnose",risk_of_no_action:"Offene Modellannahmen bleiben ungeprueft.",
    opportunity_summary:"Die fiktiven Varianten erlauben einen nachvollziehbaren Vergleich.",recommended_communication:"Keine reale Kommunikation; ausschliesslich lokale Diagnose.",action_items:[],
    risk_level:"low",opportunity_level:"low",decision_level:"bund",related_levels:[],event_type:"bericht",
    affected_geographies:[],mentioned_geographies:[],decision_entities:[],related_entities:[],
    classification_confidence:{level:"medium",geography:"unknown",entities:"unknown",event_type:"medium"}};
  const validation=require("../../lib/helmut/understanding-schema").validateKnowledgeObject(value);
  assert.equal(validation.valid,true,"diagnostic-mock-current-understanding-schema");
  return value;
}
function specs(){return P.erzeuge().profile.map(p=>({id:p.mandatsId,name:p.vollname,
  party:p.partei,faction:p.fraktion,parliamentType:p.parlament==="bundestag"?"Bundestag":"Landtag",
  state:p.bundesland,constituency:p.wahlkreis,committees:[],focusTopics:p.themen,
  synthetischErlaubt:true,email:p.mandatsId+"@example.invalid"}));}
function manifest(epoch){
  const data=cases(epoch),documents=data.flatMap(c=>c.documents);
  return {schema:"helmut-resource500-synthetic-dataset/1",syntheticOnly:true,originalEquivalent:false,
    epoch,profileCount:500,profileDistribution:P.VERTEILUNG,caseCount:data.length,
    sourceDocumentCount:documents.length,sourceTextBytes:documents.reduce((n,d)=>n+Buffer.byteLength(d.summary),0),
    minimumSourceTextBytes:Math.min(...documents.map(d=>Buffer.byteLength(d.summary))),
    maximumSourceTextBytes:Math.max(...documents.map(d=>Buffer.byteLength(d.summary))),
    syntheticPublicationDays:[...new Set(documents.map(d=>d.published_at.slice(0,10)))].sort(),
    sourceDatasetSHA256:sha(documents),profileSpecsSHA256:sha(specs()),
    originalQualificationClaimed:false,professionalAcceptance:false,productionProof:false};
}
module.exports={cases,response,specs,manifest,sha};
