"use strict";
// Entirely invented performance scenarios. No original pin, source qualification,
// operator admission or professional judgement is manufactured by this fixture.
const assert=require("node:assert/strict"),crypto=require("node:crypto");
const P=require("../../lib/helmut/synthetik-500-profile");
const THEMES=["Wohnungsbau","Digitalisierung","Bildung","Pflege","Verkehr","Energie","Haushalt","Umwelt"];
const VIEWS=["Planungsnotiz","Anhoerungsprotokoll","Finanzuebersicht","Projektbericht"];
// Independent invented projects, rather than a shared document-form headline.
// Each name describes its own subject; the full context remains in the sources.
const PROJECT_TITLES=[
  ["Wohnhof Ulmenbogen","Mietquartier Kieselhang","Dachausbau Silberlinde","Genossenschaftshaus Moosgarten","Bauluecke Amselnest","Siedlung Wiesenrain","Azubiheim Fuchsbau","Seniorenhaus Eichenkrone","Mehrgenerationenhof Quellenblick","Sozialwohnungen Kranichufer","Laermschutzwohnen Rosenanger","Wohnraumberatung Tannengrund"],
  ["Buergerportal Wolkenpfad","Aktenregister Funkenspur","Datennetz Bernsteinknoten","Terminservice Mondwinkel","Bauaktenarchiv Birkenfeder","Ausweisautomat Morgenstern","Schuldatenverbund Nebeltau","Meldeplattform Rubinkreis","Datenkatalog Schwanenfeder","Barrierefreiforum Zedernhain","Verschluesselungsdienst Lotuskern","Funkloesung Drosseltal"],
  ["Lernwerkstatt Nordlicht","Schulcampus Auenstern","Lesemobil Faerberwiese","Ausbildungslabor Kobaltinsel","Inklusionsatelier Eschenpfad","Ganztagszentrum Hafenrose","Sprachfoerderung Erlenwind","Musikraum Sonnenfalter","Mathematikzirkel Lavendelhof","Schwimmkurs Otterbach","Bibliotheksbus Zimtbruecke","Medienkompetenz Pfefferhain"],
  ["Demenzgarten Buchfink","Kurzzeitstation Biberquell","Hebammenhaus Purpurweide","Rehaparcours Seidenweg","Nachbarschaftshilfe Wacholder","Palliativnetz Abendglanz","Tagespflegezentrum Steinmarder","Assistenzpool Regenquelle","Gesundheitslotsen Zaubernuss","Versorgungspraxis Perlensteg","Therapieraum Dattelpalme","Pflegeberatung Malachit"],
  ["Radbruecke Flusskiesel","Buswendeschleife Lerchenfeld","Bahnhofsrampe Kupfertor","Fussgaengertunnel Muschelpfad","Mobilpunkt Weidenstern","Guetertrasse Basaltkante","Ampelschaltung Feldspat","Schulwegsicherung Haselhecke","Fahrradgarage Loewenzahn","Strassenbahnbogen Smaragd","Parkleitsystem Safran","Faehrsteg Maronenbank"],
  ["Solarhalle Blautanne","Waermenetz Granitquelle","Windpark Zeisigwacht","Batteriespeicher Jadefels","Geothermiebohrung Kiebitzgrund","Biogasanlage Hopfengasse","Stromsparbuero Goldammer","Netzstation Korallenufer","Dachkollektor Zypressenhof","Heizungsverbund Wasserlinse","Lastmanagement Silizium","Wasserkraftstufe Schieferklamm"],
  ["Beteiligungsetat Felsenbirne","Investitionsfonds Sanddorn","Kassenbericht Pappelkrone","Zuschussprogramm Kreuzdorn","Ruecklagentopf Akazienring","Gebuehrenmodell Bergahorn","Vergabepruefung Hagebutte","Wirtschaftsplan Schneebeere","Controllingstelle Duftjasmin","Steuerbescheid Walnuss","Rechnungsarchiv Stachelbeere","Finanzausgleich Holzapfel"],
  ["Renaturierung Libellenau","Moorsteg Wollgras","Abfalltrennung Fliederbusch","Regenmulde Zaunkoenig","Baumkataster Ringelblume","Wildtierkorridor Feuerdorn","Messstation Glockenheide","Uferfilter Magnolienbucht","Artenwiese Storchschnabel","Kompostplatz Loewenmaul","Klimaanpassung Brombeerhang","Luftguetepruefung Schneeglanz"]];
const SCOPES=[{politicalLevel:"bund",name:"Deutschland",level:"bund",geography_id:"geo-bund"},
  {politicalLevel:"land",name:"Berlin",level:"land",geography_id:"geo-land-berlin"},
  {politicalLevel:"land",name:"Brandenburg",level:"land",geography_id:"geo-land-brandenburg"}];
const sha=x=>crypto.createHash("sha256").update(typeof x==="string"?x:JSON.stringify(x)).digest("hex");
function cases(epoch){
  assert.equal(new Date(epoch).toISOString(),epoch);
  const parties=[...new Set(P.erzeuge().profile.map(p=>p.partei))];
  return Array.from({length:96},(_,index)=>{
    const topic=THEMES[index%8],party=parties[Math.floor(index/8)%6],marker="CASE_R500_"+String(index).padStart(3,"0");
    const scope=SCOPES[(Math.floor((index%8)/3)+Math.floor(index/48))%3];
    const date=new Date(Date.parse(epoch)-1000).toISOString();
    const title=PROJECT_TITLES[index%8][Math.floor(index/8)];
    const documents=VIEWS.map((view,variant)=>{
      const facts=Array.from({length:3},(_,n)=>({abschnitt:n+1,
        region:scope.name,thema:topic,
        bestand:30+index*3+n,planung:8+variant*7+n,
        betragTausendEuro:120+index*11+n*17,
        bedingung:["nach abgeschlossener Pruefung","unter Vorbehalt der Beratung","bei verfuegbarer Kapazitaet"][n%3],
        hinweis:["Eine Entscheidung ist noch offen.","Die Berechnung gilt ausschliesslich fuer dieses fiktive Szenario.",
          "Das Protokoll trennt den Bestand von vorgeschlagenen Aenderungen.","Die Projektgruppe benennt weitere Pruefschritte."][n%4]}));
      const summary=[title+". "+marker+". Vollstaendig erfundene Diagnosequelle, kein Bericht ueber reale Politik.",
        view+" zum Thema "+topic+" im Modellprojekt "+index+".",
        "Ausschliesslich fiktive Beteiligung von "+party+" in diesem Modellvorgang; dies beschreibt kein reales Ereignis.",
        "Fiktive Entscheidungsebene "+scope.politicalLevel+"; betroffenes Gebiet "+scope.name+" ("+scope.geography_id+").",
        ...facts.map(f=>"Abschnitt "+f.abschnitt+": Im Szenario "+f.region+" werden "+f.bestand+
          " bestehende Einheiten und "+f.planung+" geplante Einheiten erfasst. Die Modellrechnung nennt "+
          f.betragTausendEuro+" Tausend Euro "+f.bedingung+". "+f.hinweis)].join("\n");
      const url="https://example.invalid/resource-diagnostic/"+index+"/"+variant;
      return {id:"rd-resource500-"+index+"-"+variant,title,
        summary,url,canonical_url:url,source_name:"Fiktive Diagnosequelle "+variant,
        source_type:"media",document_type:"article",confidence:"high",link_type:"direct",
        published_at:date,retrieved_at:epoch,created_at:epoch,content_hash:sha(summary),
        raw:{syntheticDiagnosticOnly:true,marker,variant,politicalLevel:scope.politicalLevel,geography_id:scope.geography_id,facts}};
    });
    const {politicalLevel,...geography}=scope;return {index,marker,topic,party,title,date,politicalLevel,geography,documents};
  });
}
function response(request,schema,epoch,prepared=cases(epoch)){
  assert(schema&&typeof schema==="object"&&!Array.isArray(schema),"diagnostic-mock-schema-required");
  const phase=requestPhase(schema);
  if(phase!=="understanding")return lageResponse(request,schema,prepared);
  const input=JSON.stringify(request?.input);
  const markers=[...new Set((typeof input==="string"?input:"").match(/CASE_R500_[0-9]{3}/g)||[])];
  assert.equal(markers.length,1,"diagnostic-one-explicit-case");
  const index=Number(markers[0].slice(-3)),data=prepared[index];
  assert(data&&data.marker===markers[0]&&data.index===index,"diagnostic-mock-case-binding");
  const value={id:"ko-resource500-"+data.index,vorgang_id:"vg-resource500-"+data.index,
    ko_version:1,status:"neu",confidence_score:85,source_document_count:4,
    headline:data.title,display_title:data.title,display_summary:"Im vollstaendig fiktiven Modellprojekt werden Bestand, Planung und offene Pruefschritte zu "+data.topic+" getrennt dargestellt.",
    was_ist_passiert:"Die fiktive Projektgruppe hat vier Diagnoseunterlagen zu "+data.topic+" vorgelegt. Eine Entscheidung ist noch offen.",
    warum_wichtig:"Der synthetische Vorgang betrifft das Testthema "+data.topic+" und ermoeglicht die Pruefung der profilbezogenen Verarbeitung.",
    wer_ist_betroffen:"Ausschliesslich fiktive Projektgruppen im Diagnosedatensatz.",zeitdruck:"mittel",
    handlungsempfehlung:"Unterlagen fuer eine spaetere Beratung vergleichen.",
    parteien:[data.party],ausschuesse:[],ministerien:[],risiken:["Ungeklaerte Modellannahmen"],chancen:["Nachvollziehbare Gegenueberstellung"],
    mentioned_people:[],mentioned_mps:[],mentioned_parties:[data.party],mentioned_committees:[],
    mentioned_ministries:[],mentioned_locations:[data.geography.name],mentioned_organizations:[],
    tags:[data.topic],policy_field:data.topic,political_level:data.politicalLevel,stage:"Beratung",instrument:"Modellprojekt",
    why_relevant:"Das Profilthema "+data.topic+" ist im fiktiven Quellenbestand enthalten.",recommendation:"Modellannahmen und offene Pruefschritte vergleichen.",
    display_category:"Synthetische Diagnose",risk_of_no_action:"Offene Modellannahmen bleiben ungeprueft.",
    opportunity_summary:"Die fiktiven Varianten erlauben einen nachvollziehbaren Vergleich.",recommended_communication:"Keine reale Kommunikation; ausschliesslich lokale Diagnose.",action_items:[],
    risk_level:"low",opportunity_level:"low",decision_level:data.politicalLevel,related_levels:[],event_type:"bericht",
    affected_geographies:[{...data.geography}],mentioned_geographies:[{...data.geography}],decision_entities:[],related_entities:[],
    classification_confidence:{level:"high",geography:"high",entities:"unknown",event_type:"medium"}};
  const validation=require("../../lib/helmut/understanding-schema").validateKnowledgeObject(value);
  assert.equal(validation.valid,true,"diagnostic-mock-current-understanding-schema");
  return value;
}
function specs(){return P.erzeuge().profile.map(p=>({id:p.mandatsId,name:p.vollname,
  party:p.partei,faction:p.fraktion,parliamentType:p.parlament==="bundestag"?"Bundestag":"Landtag",
  state:p.bundesland,constituency:p.wahlkreis,committees:[],focusTopics:p.themen,
  synthetischErlaubt:true,email:p.mandatsId+"@example.invalid"}));}
function selectedSpecs(count){assert([2,3,100].includes(count));const all=specs();
  return count===100?[...all.slice(0,66),...all.slice(330,354),...all.slice(450,460)]:count===3?[all[0],all[330],all[450]]:all.slice(0,count);}
function requestPhase(schema){return schema?.properties?.paragraphs?"entwurf":schema?.properties?.pruefungen?"pruefung":"understanding";}
function requestContext(request,schema){
  const prefix=requestPhase(schema)==="entwurf"?"Fachlicher Mandatskontext: ":"MANDAT: ";
  const line=String(request?.input||"").split("\n").find(x=>x.startsWith(prefix));
  assert(line,"diagnostic-mock-profile-binding");return JSON.parse(line.slice(prefix.length));
}
function lageResponse(request,schema,data){
  const input=String(request?.input||""),lines=input.split("\n"),context=requestContext(request,schema);
  const parse=prefix=>{const line=lines.find(x=>x.startsWith(prefix));assert(line,"diagnostic-mock-case-binding");return JSON.parse(line.slice(prefix.length));};
  const scopeMatches=item=>context.ebene==="Bundestag"?item.politicalLevel==="bund":item.politicalLevel==="land"&&item.geography.name===context.bundesland;
  const known=new Map(data.flatMap(item=>item.documents.map(doc=>[doc.url,{item,doc}])));
  const source=(q)=>{const match=known.get(q?.url);assert(match&&q.titel===match.doc.title
    &&typeof q.auszug==="string"&&q.auszug.length>20,"diagnostic-mock-case-binding");
    const topic=match.item.topic;assert(context.schwerpunkte?.includes(topic)&&scopeMatches(match.item),"diagnostic-mock-profile-binding");
    return{...match,topic};};
  if(requestPhase(schema)==="entwurf"){
    const sources=lines.filter(x=>/^\[[^\]]+\] \{/.test(x)).map(x=>JSON.parse(x.slice(x.indexOf(" ")+1)));
    const chosen=sources.flatMap(v=>(v.quellenbelege||[]).map(q=>({v,q,match:known.get(q.url)})))
      .find(x=>x.match&&context.schwerpunkte?.includes(x.match.item.topic)&&scopeMatches(x.match.item));
    assert(chosen,"diagnostic-mock-case-binding");const {v,q}=chosen,{topic}=source(q);
    const normalized=q.auszug.replace(/\s+/g," ");
    const inventory=normalized.match(/Im Szenario [^.]+ bestehende Einheiten und [^.]+ geplante Einheiten erfasst\./)?.[0];
    const budget=normalized.match(/Die Modellrechnung nennt [^.]+\./)?.[0];
    assert(inventory&&budget&&inventory!==budget,"diagnostic-mock-case-binding");
    return{paragraphs:[inventory,budget].map(text=>({vorgang_ids:[v.vorgang_id],quelle_id:q.quelle_id,
      auswahlbegruendung:"Der Schwerpunkt "+topic+" umfasst Bestand und Finanzierung des fiktiven Fachprojekts.",
      mandatsbezug:{feld:"schwerpunkt",wert:topic},text}))};
  }
  const sources=parse("QUELLEN: "),paragraphs=parse("ABSAETZE: ");assert.equal(paragraphs.length,2,"diagnostic-mock-case-binding");
  const docs=new Map(sources.flatMap(v=>(v.quellenbelege||[]).map(q=>[q.quelle_id,{v,q}])));
  const pruefungen=paragraphs.map((p,index)=>{const found=docs.get(p.quelle_id);assert(found,"diagnostic-mock-case-binding");
    const {topic}=source(found.q);assert(found.q.auszug.replace(/\s+/g," ").includes(p.text)
      &&p.vorgang_ids?.length===1&&p.vorgang_ids[0]===found.v.vorgang_id
      &&p.mandatsbezug?.feld==="schwerpunkt"&&p.mandatsbezug.wert===topic,"diagnostic-mock-case-binding");
    return{absatz:index,quelle_id:p.quelle_id,belegfeld:"auszug",pruefbegruendung:"Der Satz ist wortgleich im fiktiven Quellenauszug enthalten.",
      vollstaendig_belegt:true,themenrein:true,mandatsbegruendung:"Der Schwerpunkt "+topic+" umfasst Bestand und Finanzierung des fiktiven Fachprojekts.",
      profilbezug:true,textart:"konkreter_sachverhalt"};});
  assert(paragraphs[0].text.startsWith("Im Szenario ")&&paragraphs[1].text.startsWith("Die Modellrechnung nennt "),"diagnostic-mock-case-binding");
  return{pruefungen,vergleiche:[{erster_absatz:0,zweiter_absatz:1,eigenstaendige_sachverhalte:true,
    pruefbegruendung:"Der erste Satz nennt den Bestand und die Planung, der zweite den separaten Finanzbetrag und dessen Bedingung."}]};
}
function matches(item,spec){const scope=spec.parliamentType==="Bundestag"?SCOPES[0]:SCOPES.find(s=>s.name===spec.state);
  return scope&&item.geography.geography_id===scope.geography_id&&item.party===spec.party&&spec.focusTopics.includes(item.topic);}
function selectedCases(data,profiles){return [...new Map(profiles.map(spec=>{const item=data.find(c=>matches(c,spec));
  assert(item,"diagnostic-synthetic-profile-selector-required");return[item.index,item];})).values()];}
function manifest(epoch,count=100){
  const data=cases(epoch),documents=data.flatMap(c=>c.documents),profiles=selectedSpecs(count);
  return {schema:"helmut-mock100-synthetic-dataset/1",syntheticOnly:true,originalEquivalent:false,
    epoch,profileCount:profiles.length,profileDistribution:{bundestag:profiles.filter(p=>p.parliamentType==="Bundestag").length,berlin:profiles.filter(p=>p.state==="Berlin"&&p.parliamentType!=="Bundestag").length,brandenburg:profiles.filter(p=>p.state==="Brandenburg"&&p.parliamentType!=="Bundestag").length},caseCount:data.length,
    sourceDocumentCount:documents.length,sourceTextBytes:documents.reduce((n,d)=>n+Buffer.byteLength(d.summary),0),
    minimumSourceTextBytes:Math.min(...documents.map(d=>Buffer.byteLength(d.summary))),
    maximumSourceTextBytes:Math.max(...documents.map(d=>Buffer.byteLength(d.summary))),
    syntheticPublicationDays:[...new Set(documents.map(d=>d.published_at.slice(0,10)))].sort(),
    fixtureRequiredSelectors:{politicalLevels:["bund","land"],geographyIDs:SCOPES.map(s=>s.geography_id),
      preflightProfileIndices:[0,330,450],profileSelectorCoverage:profiles.filter(spec=>data.some(c=>matches(c,spec))).length},
    sourceDatasetSHA256:sha(documents),profileSpecsSHA256:sha(profiles),
    originalQualificationClaimed:false,professionalAcceptance:false,productionProof:false};
}
module.exports={requestPhase,requestContext,cases,response,specs,selectedSpecs,selectedCases,matches,manifest,sha};
