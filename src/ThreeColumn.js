import { useState, useEffect, useCallback, useRef, useMemo } from "react";

const uid = () => Math.random().toString(36).slice(2, 10);

const BOXES = [
  { id:1, label:"Seldom Experiences", lo:0, hi:6, color:"#DC2626", bg:"rgba(220,38,38,.10)", thirds:[{v:0,t:""},{v:3,t:""},{v:6,t:""}] },
  { id:2, label:"Rarely Discovers", lo:7, hi:29, color:"#F97316", bg:"rgba(249,115,22,.10)", thirds:[{v:7,t:"Some/Some"},{v:14,t:"Some/Some"},{v:22,t:"Most/Most"}] },
  { id:3, label:"Sometimes Knows", lo:30, hi:59, color:"#EAB308", bg:"rgba(234,179,8,.10)", thirds:[{v:30,t:"Some/Some"},{v:40,t:"Some/Some"},{v:50,t:"Most/Most"}] },
  { id:4, label:"Frequently Understands", lo:60, hi:89, color:"#22C55E", bg:"rgba(34,197,94,.10)", thirds:[{v:60,t:"Some/Some"},{v:70,t:"Most/Most"},{v:80,t:"All/All"}] },
  { id:5, label:"Always Applies", lo:90, hi:100, color:"#3B82F6", bg:"rgba(59,130,246,.10)", thirds:[{v:90,t:"All/All to 4"},{v:94,t:"All/All to 5"},{v:98,t:"All/All"}] },
];
const CAPTIONS = [
  { key:"eq", label:"Equipment", short:"EQ", sub1:"Vocabulary", sub2:"Excellence", clr:"#3B82F6" },
  { key:"mv", label:"Movement", short:"MV", sub1:"Vocabulary", sub2:"Excellence", clr:"#22C55E" },
  { key:"da", label:"Design Analysis", short:"DA", sub1:"Composition", sub2:"Excellence", clr:"#A855F7" },
  { key:"ge", label:"General Effect", short:"GE", sub1:"Repertoire", sub2:"Performance", clr:"#F59E0B" },
];
const DEFAULT_CLASSES = ["Scholastic Regional A","Scholastic A","Scholastic Open","Scholastic World","Independent Regional A","Independent A","Independent Open","Independent World"];
const CLASS_COLORS = {"Scholastic Regional A":"#3B82F6","Scholastic A":"#6366F1","Scholastic Open":"#8B5CF6","Scholastic World":"#A855F7","Independent Regional A":"#F59E0B","Independent A":"#F97316","Independent Open":"#EF4444","Independent World":"#EC4899"};
const colorFor = c => CLASS_COLORS[c] || "#6C8AFF";
const ABBREV_MAP = { SRA:"Scholastic Regional A",SA:"Scholastic A",SO:"Scholastic Open",SW:"Scholastic World",IRA:"Independent Regional A",IA:"Independent A",IO:"Independent Open",IW:"Independent World",IS:"Independent Open",SAA:"Scholastic A" };
const PERC = new Set(["PSA","PIA","PSO","PIO","PSW","PIW","PSC","PIC","PSRA","PIRA","PA","PO","PW"]);
const SHORT = c => c.replace("Scholastic ","S/").replace("Independent ","I/");
const ordinal = n => { const s=["th","st","nd","rd"],v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); };
const fmtTotal = n => { const s = String(n); return s.length >= 2 ? s.slice(0,-1) + "." + s.slice(-1) : "0." + s; };

const Store = {
  async save(k,d){try{localStorage.setItem(`wg3:${k}`,JSON.stringify(d))}catch{}},
  async load(k,fb){try{const s=localStorage.getItem(`wg3:${k}`);return s?JSON.parse(s):fb}catch{return fb}},
};

/* ═══ PARSER ═══ */
const TIME_PAT = /\d{1,2}:\d{2}\s*(AM|PM)/i;
const TIME_EXACT = /^\d{1,2}:\d{2}\s*(AM|PM)$/i;
const BREAK_RE = /^(break|class break)$/i;

function resolveClass(raw, cc) {
  const s = raw.trim();
  const compound = s.match(/^([A-Z]{2,6})\s*[-\u2013\u2014]\s*(.+)$/i);
  if (compound) {
    const a = compound[1].toUpperCase();
    if (PERC.has(a)) return null;
    if (ABBREV_MAP[a]) return { cls: ABBREV_MAP[a], round: compound[2].trim() };
  }
  const plain = s.replace(/\s/g,"").toUpperCase();
  if (PERC.has(plain)) return null;
  if (ABBREV_MAP[plain]) return { cls: ABBREV_MAP[plain], round: "" };
  const all = [...DEFAULT_CLASSES, ...(cc||[])];
  const full = all.find(c => s.toLowerCase() === c.toLowerCase());
  if (full) return { cls: full, round: "" };
  return undefined;
}

/* US state codes for city detection */
const US_STATES = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));
const TEAM_SUFFIXES = /(?:HS|High School|Winterguard|Winter Guard|WG|Guard|Independent|University|Academy|Prep|Combined|Varsity|JV|Ensemble|Band|Arts|PAC|Senior|World|Open|School|Color Guard|Performing)\s*(?:\(.*\))?\s*$/i;

function stripCity(raw) {
  const commas = [];
  for (let i = 0; i < raw.length; i++) if (raw[i] === ",") commas.push(i);
  if (!commas.length) return raw;
  const fc = commas[0];
  const beforeComma = raw.substring(0, fc).trim();
  const afterComma = raw.substring(fc + 1).trim().split(/\s/)[0] || "";
  const words = beforeComma.split(/\s+/);
  const isUS = US_STATES.has(afterComma.toUpperCase().replace(/[.,]/g, ""));

  const candidates = [];
  for (let n = 1; n < Math.min(4, words.length); n++) {
    const name = words.slice(0, -n).join(" ");
    if (name.length >= 2) candidates.push({ n, name });
  }
  for (const c of candidates) { if (TEAM_SUFFIXES.test(c.name)) return c.name; }
  if (isUS && candidates.length >= 2) return candidates[1].name;
  if (candidates.length) return candidates[0].name;
  return beforeComma;
}

function parseSchedule(text, cc) {
  const rawLines = text.split(/\r?\n|\r/).map(l => l.trim()).filter(l => l.length > 0);
  let teams = [];
  let debugLog = [];

  const ABBREV_KEYS = Object.keys(ABBREV_MAP);
  const PERC_ARR = [...PERC];
  const ALL_ABBREV = [...ABBREV_KEYS, ...PERC_ARR];
  const abbrevJoined = ALL_ABBREV.sort((a, b) => b.length - a.length).join("|");

  // Regex: find class abbreviation (optionally with " - Round X") + time at end of line
  const endPat = new RegExp(
    "\\s(" + abbrevJoined + ")(\\s*[-\\u2013]\\s*[\\w][\\w\\s]*?)?" +
    "\\s+(\\d{1,2}:\\d{2}\\s*(?:AM|PM))\\s*$", "i"
  );
  const breakPat = /^(?:break|class break)\s*\d/i;
  const pureBreak = /^(?:break|class break)$/i;

  // PRIMARY: Single-line parse (how CompetitionSuite actually pastes)
  debugLog.push("Single-line scan...");
  let order = 1;
  for (const line of rawLines) {
    if (pureBreak.test(line) || breakPat.test(line)) continue;
    if (TIME_EXACT.test(line)) continue;

    const m = endPat.exec(line);
    if (!m) continue;

    const clsAbbr = m[1].toUpperCase();
    if (PERC.has(clsAbbr)) continue;

    const roundPart = (m[2] || "").replace(/^[\s\-\u2013]+/, "").trim();
    const time = m[3].trim();
    const before = line.substring(0, m.index).trim();
    if (!before || before.length < 2) continue;

    const teamName = stripCity(before);
    const mapped = ABBREV_MAP[clsAbbr];
    if (!mapped) continue;

    teams.push({ id: uid(), name: teamName, className: mapped, round: roundPart, order: order++, time });
  }

  if (teams.length > 0) {
    debugLog.push("Found " + teams.length + " teams");
    return { teams, debug: debugLog.join("\n") };
  }

  // FALLBACK 1: Forward 4-line scan (in case paste has separate lines)
  debugLog.push("Forward 4-line scan...");
  teams = [];
  order = 1;
  let i = 0;
  while (i < rawLines.length) {
    const L = rawLines[i];
    if (BREAK_RE.test(L)) { i++; if (i < rawLines.length && TIME_EXACT.test(rawLines[i])) i++; continue; }
    if (TIME_EXACT.test(L)) { i++; continue; }
    const selfCr = resolveClass(L, cc);
    if (selfCr !== undefined) { i++; continue; }
    if (i + 3 < rawLines.length) {
      const cr = resolveClass(rawLines[i + 2], cc);
      if (cr !== undefined && TIME_EXACT.test(rawLines[i + 3])) {
        if (cr !== null) teams.push({ id: uid(), name: L, className: cr.cls, round: cr.round, order: order++, time: rawLines[i + 3] });
        i += 4; continue;
      }
    }
    if (i + 2 < rawLines.length) {
      const cr = resolveClass(rawLines[i + 1], cc);
      if (cr !== undefined && TIME_EXACT.test(rawLines[i + 2])) {
        if (cr !== null) teams.push({ id: uid(), name: L, className: cr.cls, round: cr.round, order: order++, time: rawLines[i + 2] });
        i += 3; continue;
      }
    }
    if (i + 1 < rawLines.length && TIME_EXACT.test(rawLines[i + 1])) { i += 2; continue; }
    i++;
  }
  if (teams.length > 0) {
    debugLog.push("Found " + teams.length + " teams");
    return { teams, debug: debugLog.join("\n") };
  }

  // FALLBACK 2: Backwards from class labels
  debugLog.push("Backwards class label scan...");
  teams = [];
  order = 1;
  for (let j = 0; j < rawLines.length; j++) {
    const cr = resolveClass(rawLines[j], cc);
    if (cr !== undefined && cr !== null && j + 1 < rawLines.length && TIME_EXACT.test(rawLines[j + 1])) {
      let tn = null;
      if (j >= 2 && !TIME_EXACT.test(rawLines[j-2]) && !BREAK_RE.test(rawLines[j-2]) && resolveClass(rawLines[j-2],cc)===undefined) tn = rawLines[j-2];
      else if (j >= 1 && !TIME_EXACT.test(rawLines[j-1]) && !BREAK_RE.test(rawLines[j-1]) && resolveClass(rawLines[j-1],cc)===undefined) tn = rawLines[j-1];
      if (tn) teams.push({ id:uid(), name:tn, className:cr.cls, round:cr.round, order:order++, time:rawLines[j+1] });
    }
  }
  if (teams.length > 0) { debugLog.push("Found " + teams.length + " teams"); return { teams, debug: debugLog.join("\n") }; }

  debugLog.push("All strategies failed.");
  const first20 = rawLines.slice(0, 20).map((l, idx) => "[" + idx + "] " + JSON.stringify(l.substring(0, 80))).join("\n");
  return { teams: [], debug: debugLog.join("\n") + "\n\nFirst 20 lines:\n" + first20 };
}

/* ═══ Chip Layout ═══ */
function layoutChips(teams, scores, tH, cH) {
  if (!teams.length) return [];
  const items = teams.map(t => { const sc=scores[t.id]??50; return {...t, score:sc, y:tH-(sc/100)*tH}; });
  items.sort((a,b) => a.y - b.y);
  const gap = cH + 1;
  for (let j=1;j<items.length;j++) if (items[j].y < items[j-1].y+gap) items[j].y = items[j-1].y+gap;
  const mx = tH - cH;
  if (items.length && items[items.length-1].y > mx) { items[items.length-1].y = mx; for (let j=items.length-2;j>=0;j--) if (items[j].y > items[j+1].y-gap) items[j].y = items[j+1].y-gap; }
  if (items.length && items[0].y < 0) items[0].y = 0;
  return items;
}

/* ═══ Scale ═══ */
function Scale({ title, teams, scores, onScore, trackH }) {
  const ref = useRef(null);
  const [dr, setDr] = useState(null);
  const off = useRef(0);
  const CH = 20;
  const tH = () => ref.current ? ref.current.clientHeight : trackH;
  const s2y = s => tH()-(s/100)*tH();
  const y2s = y => Math.round(Math.max(0,Math.min(100,((tH()-y)/tH())*100)));
  const onDown = (e,id) => {
    e.preventDefault(); setDr(id);
    off.current = e.clientY - ref.current.getBoundingClientRect().top - s2y(scores[id]??50);
    const mv = ev => onScore(id, y2s(ev.clientY - ref.current.getBoundingClientRect().top - off.current));
    const up = () => { setDr(null); window.removeEventListener("pointermove",mv); window.removeEventListener("pointerup",up); };
    window.addEventListener("pointermove",mv); window.addEventListener("pointerup",up);
  };
  const laid = useMemo(() => layoutChips(teams,scores,trackH,CH), [teams,scores,trackH]);
  return (
    <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column"}}>
      <div style={{textAlign:"center",marginBottom:2}}>
        <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:19,lineHeight:1.1}}>{title}</div>
      </div>
      <div ref={ref} style={{position:"relative",height:trackH,background:"var(--s1)",borderRadius:7,border:"1px solid var(--bd)",overflow:"hidden"}}>
        {BOXES.map(box=>(
          <div key={box.id} style={{position:"absolute",left:0,right:0,bottom:`${box.lo}%`,height:`${box.hi-box.lo+1}%`,background:box.bg,pointerEvents:"none"}}>
            <div style={{position:"absolute",right:2,top:"50%",transform:"translateY(-50%) rotate(180deg)",writingMode:"vertical-rl",fontSize:14,color:box.color,opacity:.5,fontWeight:700,whiteSpace:"nowrap"}}>{box.label}</div>
            {box.thirds.map((th,idx)=>{const lf=(th.v-box.lo)/(box.hi-box.lo+1);return(
              <div key={th.v} style={{position:"absolute",left:0,right:0,bottom:`${lf*100}%`,borderBottom:idx===0?`1.5px solid ${box.color}50`:`1px dashed ${box.color}25`,pointerEvents:"none"}}>
                <span style={{position:"absolute",left:2,bottom:-2,fontSize:18,color:box.color,opacity:.7,fontWeight:700}}>{th.v}</span>
                {th.t&&<span style={{position:"absolute",left:30,bottom:0,fontSize:11,color:box.color,opacity:.5,whiteSpace:"nowrap"}}>{th.t}</span>}
              </div>);})}
          </div>
        ))}
        <div style={{position:"absolute",left:0,right:0,top:2,fontSize:18,color:"var(--t3)",fontWeight:700,zIndex:1,textAlign:"center"}}>100</div>
        {laid.map(item=>{const box=BOXES.find(b=>item.score>=b.lo&&item.score<=b.hi)||BOXES[2];const isDr=dr===item.id;return(
          <div key={item.id} onPointerDown={e=>onDown(e,item.id)} style={{position:"absolute",left:28,right:18,top:item.y,height:CH,display:"flex",alignItems:"center",gap:3,padding:"0 4px",background:isDr?`${box.color}20`:"var(--s3)",border:`1px solid ${isDr?box.color:"var(--bd2)"}`,borderRadius:3,cursor:isDr?"grabbing":"grab",zIndex:isDr?10:2,boxShadow:isDr?`0 2px 8px ${box.color}20`:"none",userSelect:"none",touchAction:"none"}}>
            <span style={{width:4,height:4,borderRadius:"50%",flexShrink:0,background:colorFor(item.className)}}/>
            <span style={{flex:1,fontSize:13,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",lineHeight:1}}>{item.name}</span>
            <span style={{fontSize:14,fontWeight:700,color:box.color,minWidth:18,textAlign:"right",fontVariantNumeric:"tabular-nums",lineHeight:1}}>{item.score}</span>
          </div>);})}
      </div>
    </div>
  );
}

/* ═══ RoundSelect component ═══ */
function RoundSelect({ value, onChange, existingRounds }) {
  const [custom, setCustom] = useState(false);
  const [newRound, setNewRound] = useState("");
  if (custom) return (
    <div style={{display:"flex",gap:3}}>
      <input value={newRound} onChange={e=>setNewRound(e.target.value)} placeholder="New round name" onKeyDown={e=>{if(e.key==="Enter"&&newRound.trim()){onChange(newRound.trim());setCustom(false);setNewRound("");}}}
        style={{padding:"6px 8px",borderRadius:5,border:"1px solid var(--bd)",background:"var(--s2)",color:"var(--t1)",fontSize:14,fontFamily:"'DM Sans',sans-serif",outline:"none",width:100}} />
      <button onClick={()=>{if(newRound.trim()){onChange(newRound.trim());setCustom(false);setNewRound("");}}} style={{padding:"4px 8px",borderRadius:4,border:"1px solid var(--ac2)",background:"var(--ac)",color:"#fff",fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>OK</button>
      <button onClick={()=>setCustom(false)} style={{padding:"4px 6px",borderRadius:4,border:"1px solid var(--bd)",background:"var(--s2)",color:"var(--t1)",fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Cancel</button>
    </div>
  );
  return (
    <select value={value} onChange={e=>{if(e.target.value==="__new__")setCustom(true);else onChange(e.target.value);}}
      style={{padding:"6px 7px",borderRadius:5,border:"1px solid var(--bd)",background:"var(--s2)",color:"var(--t1)",fontSize:14,fontFamily:"'DM Sans',sans-serif"}}>
      <option value="">No round</option>
      {existingRounds.map(r=><option key={r} value={r}>{r}</option>)}
      <option value="__new__">+ New round...</option>
    </select>
  );
}

/* ═══ Stable UI Components (outside App to prevent focus loss) ═══ */
function Btn({children,primary,danger,sm,...p}) {
  return <button {...p} style={{display:"inline-flex",alignItems:"center",gap:4,padding:sm?"4px 8px":"7px 12px",borderRadius:5,fontSize:sm?10:11,fontWeight:600,cursor:"pointer",border:`1px solid ${primary?"var(--ac2)":"var(--bd)"}`,background:primary?"var(--ac)":"var(--s2)",color:danger?"var(--dng)":primary?"#fff":"var(--t1)",fontFamily:"'DM Sans',sans-serif",...p.style}}>{children}</button>;
}
function Card({children,style:s}) {
  return <div style={{background:"var(--s1)",border:"1px solid var(--bd)",borderRadius:7,padding:12,marginBottom:8,...s}}>{children}</div>;
}
function Inp(props) {
  return <input {...props} style={{padding:"6px 9px",borderRadius:5,border:"1px solid var(--bd)",background:"var(--s2)",color:"var(--t1)",fontSize:15,fontFamily:"'DM Sans',sans-serif",outline:"none",...props.style}}/>;
}

function ClassSelect({ value, onChange, classes, onNewClass }) {
  const [custom, setCustom] = useState(false);
  const [newName, setNewName] = useState("");
  if (custom) return (
    <div style={{display:"flex",gap:3}}>
      <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="New class name" onKeyDown={e=>{if(e.key==="Enter"&&newName.trim()){onNewClass(newName.trim());onChange(newName.trim());setCustom(false);setNewName("");}}}
        style={{padding:"6px 8px",borderRadius:5,border:"1px solid var(--bd)",background:"var(--s2)",color:"var(--t1)",fontSize:14,fontFamily:"'DM Sans',sans-serif",outline:"none",width:130}} />
      <button onClick={()=>{if(newName.trim()){onNewClass(newName.trim());onChange(newName.trim());setCustom(false);setNewName("");}}} style={{padding:"4px 8px",borderRadius:4,border:"1px solid var(--ac2)",background:"var(--ac)",color:"#fff",fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>OK</button>
      <button onClick={()=>setCustom(false)} style={{padding:"4px 6px",borderRadius:4,border:"1px solid var(--bd)",background:"var(--s2)",color:"var(--t1)",fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Cancel</button>
    </div>
  );
  return (
    <select value={value} onChange={e=>{if(e.target.value==="__new__")setCustom(true);else onChange(e.target.value);}}
      style={{padding:"6px 7px",borderRadius:5,border:"1px solid var(--bd)",background:"var(--s2)",color:"var(--t1)",fontSize:14,fontFamily:"'DM Sans',sans-serif"}}>
      {classes.map(c=><option key={c} value={c}>{c}</option>)}
      <option value="__new__">+ New class...</option>
    </select>
  );
}

/* ═══ APP ═══ */
export default function ThreeColumnApp() {
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [teams, setTeams] = useState([]);
  const [scores, setScores] = useState({});
  const [tab, setTab] = useState("settings");
  const [activeTote, setActiveTote] = useState(null);
  const [judgeCap, setJudgeCap] = useState(null);
  const [customClasses, setCustomClasses] = useState([]);
  const [newCls, setNewCls] = useState("");
  const [tName, setTName] = useState("");
  const [selClass, setSelClass] = useState(DEFAULT_CLASSES[0]);
  const [selRound, setSelRound] = useState("");
  const [tOrder, setTOrder] = useState("");
  const [schedText, setSchedText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [preview, setPreview] = useState(null);
  const [debugInfo, setDebugInfo] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [ready, setReady] = useState(false);
  const [notes, setNotes] = useState({});
  const [saved, setSaved] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [eventDate, setEventDate] = useState("");
  const [eventVenue, setEventVenue] = useState("");
  const [judgeName, setJudgeName] = useState("");
  const [theme, setTheme] = useState("dark");

  const allClasses = useMemo(() => [...DEFAULT_CLASSES, ...customClasses], [customClasses]);
  const existingRounds = useMemo(() => [...new Set(teams.map(t=>t.round).filter(Boolean))].sort(), [teams]);

  useEffect(() => { (async () => {
    setTeams(await Store.load("teams",[])); setScores(await Store.load("scores",{}));
    setJudgeCap(await Store.load("cap",null)); setCustomClasses(await Store.load("cc",[]));
    setNotes(await Store.load("notes",{}));
    setEventDate(await Store.load("eventDate",""));
    setEventVenue(await Store.load("eventVenue",""));
    setJudgeName(await Store.load("judgeName",""));
    setTheme(await Store.load("theme","dark"));
    setReady(true);
  })(); }, []);

  useEffect(() => { if (!ready) return; const t = setTimeout(async () => {
    await Store.save("teams",teams); await Store.save("scores",scores);
    await Store.save("cap",judgeCap); await Store.save("cc",customClasses);
    await Store.save("notes",notes); await Store.save("eventDate",eventDate);
    await Store.save("eventVenue",eventVenue); await Store.save("judgeName",judgeName);
    await Store.save("theme",theme);
    setSaved(true); setLastSaved(new Date());
  }, 400); return () => clearTimeout(t); }, [teams,scores,judgeCap,customClasses,notes,eventDate,eventVenue,judgeName,theme,ready]);

  /* Download full backup as JSON file */
  const downloadBackup = () => {
    const data = { teams, scores, notes, judgeCap, customClasses, eventDate, eventVenue, judgeName, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `WGTote-${eventDate||"backup"}-${(judgeName||"judge").replace(/\s+/g,"-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* Restore from backup JSON */
  const restoreBackup = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.teams) setTeams(data.teams);
        if (data.scores) setScores(data.scores);
        if (data.notes) setNotes(data.notes);
        if (data.judgeCap) setJudgeCap(data.judgeCap);
        if (data.customClasses) setCustomClasses(data.customClasses);
        if (data.eventDate) setEventDate(data.eventDate);
        if (data.eventVenue) setEventVenue(data.eventVenue);
        if (data.judgeName) setJudgeName(data.judgeName);
        dirty();
        setImportMsg("Backup restored successfully.");
      } catch { setImportMsg("Invalid backup file."); }
    };
    reader.readAsText(file);
  };

  /* Export to XLSX using SheetJS */
  const exportXlsx = async () => {
    if (!cap) return;
    if (!window.XLSX) {
      await new Promise(r => { const s = document.createElement("script"); s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"; s.onload = r; s.onerror = () => { alert("Could not load spreadsheet library. Check your internet connection."); }; document.head.appendChild(s); });
    }
    if (!window.XLSX) return;
    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();
    const capObj = CAPTIONS.find(c => c.key === judgeCap);

    for (const tote of totes) {
      const tt = toteTeams(tote.key);
      if (!tt.length) continue;

      const factors = getFactors(tote.className, judgeCap);
      const rows = tt.map(t => {
        const s1 = scores[`${t.id}_${judgeCap}_1`] ?? 50;
        const s2 = scores[`${t.id}_${judgeCap}_2`] ?? 50;
        const tot = s1 + s2;
        const factored = factors ? Math.round((s1 * factors.vocabF + s2 * factors.excelF) * 100) / 100 : null;
        const note = notes[t.id] || "";
        return { name: t.name, className: t.className, s1, s2, tot, factored, note, id: t.id };
      });

      const sheetData = [];

      // Header info
      sheetData.push([eventVenue || "WinterGuard Tote Export"]);
      sheetData.push([`${tote.className}${tote.round ? " - " + tote.round : ""}`, "", capObj.label, judgeName || "", eventDate || ""]);
      sheetData.push([]);

      // Column headers
      const headers = ["#", "Team", "Class", capObj.sub1, capObj.sub2, "Total"];
      if (factors) headers.push("Factored");
      headers.push("Notes");
      sheetData.push(headers);

      // Team rows in performance order
      rows.forEach((t, i) => {
        const row = [i + 1, t.name, t.className, t.s1, t.s2, fmtTotal(t.tot)];
        if (factors) row.push(t.factored);
        row.push(t.note);
        sheetData.push(row);
      });

      // Blank rows before summary
      sheetData.push([]);
      sheetData.push([]);
      sheetData.push(["RANKING"]);

      // Ranked headers
      const rankHeaders = ["Rank", "Team", capObj.sub1, `${capObj.sub1} Rank`, capObj.sub2, `${capObj.sub2} Rank`, "Total", "Total Rank"];
      if (factors) rankHeaders.push("Factored", "Factored Rank");
      sheetData.push(rankHeaders);

      // Sort by factored or total
      const ranked = [...rows].sort((a, b) => factors ? (b.factored - a.factored) : (b.tot - a.tot));
      const s1sorted = [...rows].sort((a, b) => b.s1 - a.s1).map(t => t.id);
      const s2sorted = [...rows].sort((a, b) => b.s2 - a.s2).map(t => t.id);
      const totSorted = [...rows].sort((a, b) => b.tot - a.tot).map(t => t.id);

      ranked.forEach((t, i) => {
        const row = [
          ordinal(i + 1), t.name,
          t.s1, ordinal(s1sorted.indexOf(t.id) + 1),
          t.s2, ordinal(s2sorted.indexOf(t.id) + 1),
          fmtTotal(t.tot), ordinal(totSorted.indexOf(t.id) + 1),
        ];
        if (factors) row.push(t.factored, ordinal(i + 1));
        sheetData.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(sheetData);

      // Column widths
      ws["!cols"] = [
        { wch: 5 }, { wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 8 },
        ...(factors ? [{ wch: 10 }] : []),
        { wch: 40 },
      ];

      // Sheet name (max 31 chars for Excel)
      const sheetName = (tote.round ? `${tote.round} ${SHORT(tote.className)}` : SHORT(tote.className)).substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `WGTote-${eventDate || "export"}-${(judgeName || "scores").replace(/\s+/g, "-")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* Export to PDF using jsPDF */
  const exportPdf = async () => {
    if (!cap) return;
    if (!window.jspdf) {
      await new Promise(r => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js"; s.onload = r; s.onerror = () => { alert("Could not load PDF library. Check your internet connection."); }; document.head.appendChild(s); });
    }
    if (!window.jspdf) return;
    if (!window.jspdf.jsPDF.API.autoTable) {
      await new Promise(r => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js"; s.onload = r; document.head.appendChild(s); });
    }
    const { jsPDF } = window.jspdf;
    const capObj = CAPTIONS.find(c => c.key === judgeCap);
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
    let first = true;

    for (const tote of totes) {
      const tt = toteTeams(tote.key);
      if (!tt.length) continue;
      if (!first) doc.addPage("letter", "landscape");
      first = false;

      const factors = getFactors(tote.className, judgeCap);
      const rows = tt.map(t => {
        const s1 = scores[`${t.id}_${judgeCap}_1`] ?? 50;
        const s2 = scores[`${t.id}_${judgeCap}_2`] ?? 50;
        const tot = s1 + s2;
        const factored = factors ? Math.round((s1 * factors.vocabF + s2 * factors.excelF) * 100) / 100 : null;
        const note = notes[t.id] || "";
        return { name: t.name, className: t.className, s1, s2, tot, factored, note, id: t.id };
      });

      let y = 12;
      doc.setFontSize(14); doc.text(eventVenue || "WinterGuard Tote", 14, y); y += 6;
      doc.setFontSize(10); doc.text(`${tote.className}${tote.round ? " - " + tote.round : ""} | ${capObj.label}${judgeName ? " | " + judgeName : ""}${eventDate ? " | " + eventDate : ""}`, 14, y); y += 6;

      const headers = ["#", "Team", "Class", capObj.sub1, capObj.sub2, "Total"];
      if (factors) headers.push("Factored");
      headers.push("Notes");
      const body = rows.map((t, i) => { const row = [i + 1, t.name, t.className, t.s1, t.s2, fmtTotal(t.tot)]; if (factors) row.push(t.factored); row.push(t.note); return row; });
      doc.autoTable({ startY: y, head: [headers], body, theme: "grid", styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [40, 50, 70], textColor: 255 }, margin: { left: 14, right: 14 } });
      y = doc.lastAutoTable.finalY + 8;

      doc.setFontSize(11); doc.text("RANKING", 14, y); y += 4;
      const rankHeaders = ["Rank", "Team", capObj.sub1, `${capObj.sub1} Rank`, capObj.sub2, `${capObj.sub2} Rank`, "Total", "Total Rank"];
      if (factors) rankHeaders.push("Factored", "Factored Rank");
      const ranked = [...rows].sort((a, b) => factors ? (b.factored - a.factored) : (b.tot - a.tot));
      const s1sorted = [...rows].sort((a, b) => b.s1 - a.s1).map(t => t.id);
      const s2sorted = [...rows].sort((a, b) => b.s2 - a.s2).map(t => t.id);
      const totSorted = [...rows].sort((a, b) => b.tot - a.tot).map(t => t.id);
      const rankBody = ranked.map((t, i) => { const row = [ordinal(i + 1), t.name, t.s1, ordinal(s1sorted.indexOf(t.id) + 1), t.s2, ordinal(s2sorted.indexOf(t.id) + 1), fmtTotal(t.tot), ordinal(totSorted.indexOf(t.id) + 1)]; if (factors) row.push(t.factored, ordinal(i + 1)); return row; });
      doc.autoTable({ startY: y, head: [rankHeaders], body: rankBody, theme: "grid", styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [30, 40, 60], textColor: 255 }, margin: { left: 14, right: 14 } });
    }
    doc.save(`WGTote-${eventDate || "export"}-${(judgeName || "scores").replace(/\s+/g, "-")}.pdf`);
  };

  const dirty = () => setSaved(false);

  /* Reverse map: class name → shortest abbreviation */
  const classToAbbrev = useMemo(() => {
    const m = {};
    Object.entries(ABBREV_MAP).forEach(([abbr, cls]) => {
      if (!m[cls] || abbr.length < m[cls].length) m[cls] = abbr;
    });
    return m;
  }, []);
  const shortAbbrev = (cls) => classToAbbrev[cls] || SHORT(cls);

  /* Extract round number from strings like "Round 2", "Round 14", "Prelims" */
  const roundNum = (r) => { const m = r.match(/(\d+)/); return m ? m[1] : r; };

  /* Tote tab label: "SW-1" or "SRA" */
  const toteTabLabel = (t) => {
    const abbr = shortAbbrev(t.className);
    if (t.round) return abbr + "-" + roundNum(t.round);
    return abbr;
  };

  /* Tote order: persisted array of tote keys. New totes append at end. */
  const [toteOrder, setToteOrder] = useState([]);
  useEffect(() => { (async () => { setToteOrder(await Store.load("toteOrder", [])); })(); }, []);
  useEffect(() => { if (ready && toteOrder.length) Store.save("toteOrder", toteOrder); }, [toteOrder, ready]);

  const rawTotes = useMemo(() => {
    const m = new Map();
    teams.forEach(t => {
      const k = `${t.className}|||${t.round||""}`;
      if (!m.has(k)) m.set(k, { className:t.className, round:t.round||"", key:k, minOrder:t.order, minTime:t.time||"" });
      else {
        const existing = m.get(k);
        if (t.order < existing.minOrder) { existing.minOrder = t.order; existing.minTime = t.time || existing.minTime; }
      }
    });
    return [...m.values()];
  }, [teams]);

  /* Parse "10:15 AM" → minutes since midnight for sorting */
  const parseTime = (str) => {
    if (!str) return 9999;
    const m = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return 9999;
    let h = parseInt(m[1]), min = parseInt(m[2]);
    const pm = m[3].toUpperCase() === "PM";
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    return h * 60 + min;
  };

  /* Sorted totes: follow toteOrder if set, otherwise sort by schedule time */
  const totes = useMemo(() => {
    const ordered = [];
    const remaining = new Map(rawTotes.map(t => [t.key, t]));
    for (const k of toteOrder) {
      if (remaining.has(k)) { ordered.push(remaining.get(k)); remaining.delete(k); }
    }
    // New totes not in saved order: sort by earliest performance time
    const leftover = [...remaining.values()].sort((a, b) => {
      const ta = parseTime(a.minTime), tb = parseTime(b.minTime);
      if (ta !== tb) return ta - tb;
      return a.minOrder - b.minOrder;
    });
    return [...ordered, ...leftover];
  }, [rawTotes, toteOrder]);

  /* Drag to reorder tote tabs */
  const [dragTote, setDragTote] = useState(null);
  const [dragOverTote, setDragOverTote] = useState(null);

  const handleToteDragStart = (key) => { setDragTote(key); };
  const handleToteDragOver = (e, key) => { e.preventDefault(); setDragOverTote(key); };
  const handleToteDrop = (targetKey) => {
    if (!dragTote || dragTote === targetKey) { setDragTote(null); setDragOverTote(null); return; }
    const currentOrder = totes.map(t => t.key);
    const fromIdx = currentOrder.indexOf(dragTote);
    const toIdx = currentOrder.indexOf(targetKey);
    if (fromIdx === -1 || toIdx === -1) { setDragTote(null); setDragOverTote(null); return; }
    const newOrder = [...currentOrder];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragTote);
    setToteOrder(newOrder);
    setDragTote(null);
    setDragOverTote(null);
  };
  const toteTeams = k => { const [cls,rnd]=k.split("|||"); return teams.filter(t=>t.className===cls&&(t.round||"")===rnd).sort((a,b)=>a.order-b.order); };
  const initScores = tid => { const s={}; CAPTIONS.forEach(c=>{s[`${tid}_${c.key}_1`]=50;s[`${tid}_${c.key}_2`]=50;}); return s; };

  const addTeam = () => {
    if(!tName.trim()) return;
    const t={id:uid(),name:tName.trim(),className:selClass,round:selRound,order:tOrder?parseInt(tOrder):teams.length+1};
    setTeams(p=>[...p,t]); setScores(p=>({...p,...initScores(t.id)})); setTName(""); setTOrder(""); dirty();
  };
  const removeTeam = id => { setTeams(p=>p.filter(t=>t.id!==id)); setScores(p=>{const n={...p};CAPTIONS.forEach(c=>{delete n[`${id}_${c.key}_1`];delete n[`${id}_${c.key}_2`]});return n}); dirty(); };
  const renameTeam = (id, newName) => { setTeams(p=>p.map(t=>t.id===id?{...t,name:newName}:t)); dirty(); };

  const confirmImport = parsed => {
    if (!judgeCap) { setImportMsg("Select a caption in Settings before importing."); return; }
    const ns={}; parsed.forEach(t=>Object.assign(ns,initScores(t.id)));
    setTeams(parsed); setScores(ns); dirty(); setPreview(null);
    const cc={}; parsed.forEach(t=>{const l=t.round?`${SHORT(t.className)} ${t.round}`:SHORT(t.className);cc[l]=(cc[l]||0)+1;});
    setImportMsg(`Imported ${parsed.length} teams in ${Object.keys(cc).length} totes`);
  };

  const doParse = text => {
    const result = parseSchedule(text, customClasses);
    setDebugInfo(result.debug);
    if (result.teams.length === 0) { setImportMsg(`No teams found. See debug info.`); setPreview(null); }
    else { setImportMsg(""); setPreview(result.teams); }
  };

  const handlePaste = e => {
    let text = "";
    if (e.clipboardData) text = e.clipboardData.getData("text/plain") || e.clipboardData.getData("text") || "";
    if (text) { e.preventDefault(); setSchedText(text); setTimeout(() => doParse(text), 50); }
  };

  const handleScore = useCallback((k,v) => { setScores(p=>({...p,[k]:v})); setSaved(false); }, []);
  const capTotal = (tid,ck) => (scores[`${tid}_${ck}_1`]??50)+(scores[`${tid}_${ck}_2`]??50);

  const tryAuth = () => {
    if (pwInput.toLowerCase().trim() === "rankandrate") { setAuthed(true); setPwError(false); }
    else setPwError(true);
  };

  if (!authed) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0C0E13",fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{textAlign:"center",maxWidth:320,padding:24}}>
        <h1 style={{fontSize:30,color:"#E8EAF0",marginBottom:4}}>Winter<span style={{color:"#6C8AFF",fontStyle:"italic"}}>Guard</span> Tote</h1>
        <p style={{fontSize:15,color:"#6B7590",marginBottom:20}}>Score tote sheet for Winterguard Judges</p>
        <input
          type="password"
          value={pwInput}
          onChange={e=>{setPwInput(e.target.value);setPwError(false);}}
          onKeyDown={e=>e.key==="Enter"&&tryAuth()}
          placeholder="Enter access code"
          style={{width:"100%",padding:"10px 14px",borderRadius:6,border:`2px solid ${pwError?"#EF4444":"#2A2F3D"}`,background:"#1B1F2A",color:"#E8EAF0",fontSize:18,fontFamily:"'DM Sans',sans-serif",outline:"none",textAlign:"center",marginBottom:10}}
        />
        {pwError && <p style={{fontSize:14,color:"#EF4444",marginBottom:8}}>Incorrect code. Try again.</p>}
        <button onClick={tryAuth} style={{width:"100%",padding:"10px",borderRadius:6,border:"none",background:"#6C8AFF",color:"#fff",fontSize:18,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Enter</button>
      </div>
    </div>
  );

  if (!ready) return <div style={{textAlign:"center",paddingTop:100,color:"#6B7590",fontFamily:"'DM Sans',sans-serif"}}>Loading...</div>;

  const cap = CAPTIONS.find(c=>c.key===judgeCap);
  const curTote = totes.find(t=>t.key===activeTote);
  const curTeams = activeTote ? toteTeams(activeTote) : [];
  const trackH = Math.max(1200, curTeams.length * 200);
  const boxFor = s => BOXES.find(b=>s>=b.lo&&s<=b.hi)||BOXES[2];

  const darkVars = "--bg:#0C0E13;--s1:#14171E;--s2:#1B1F2A;--s3:#232838;--bd:#2A2F3D;--bd2:#363D50;--t1:#E8EAF0;--t2:#9BA3B5;--t3:#6B7590;--ac:#6C8AFF;--ac2:#4F6AE6;--dng:#EF4444;--ok:#22C55E;--warn:#F59E0B";
  const lightVars = "--bg:#F3F4F6;--s1:#FFFFFF;--s2:#F0F1F4;--s3:#E5E7EB;--bd:#D1D5DB;--bd2:#B0B6C3;--t1:#1F2937;--t2:#4B5563;--t3:#6B7280;--ac:#4F6AE6;--ac2:#3B55CC;--dng:#DC2626;--ok:#16A34A;--warn:#D97706";
  const css = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');
:root{${theme==="dark"?darkVars:lightVars}}
*{margin:0;padding:0;box-sizing:border-box}body,#root{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--t1);min-height:100vh;-webkit-font-smoothing:antialiased}
@keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}`;

  const thS={textAlign:"left",padding:"5px 6px",borderBottom:"2px solid var(--bd)",color:"var(--t2)",fontWeight:600,fontSize:14,textTransform:"uppercase",letterSpacing:".3px"};
  const tdS={padding:"5px 6px",borderBottom:"1px solid var(--bd)",fontSize:15};

  /* Factoring: RA/A classes have weighted EQ/MV sub-captions
     RA: Vocabulary x(60/100), Excellence x(140/100) — 60/140 split
     A:  Vocabulary x(70/100), Excellence x(130/100) — 70/130 split
     Open/World: equal (no factoring)
     Only applies to EQ and MV captions, not DA or GE */
  const getFactors = (className, capKey) => {
    const isEqMv = capKey === "eq" || capKey === "mv";
    if (!isEqMv) return null;
    const cn = (className || "").toLowerCase();
    if (cn.includes("regional a")) return { vocabF: 0.60, excelF: 1.40, label: "60/140" };
    if ((cn.includes("scholastic a") || cn.includes("independent a")) && !cn.includes("open") && !cn.includes("world") && !cn.includes("regional")) return { vocabF: 0.70, excelF: 1.30, label: "70/130" };
    return null;
  };

  /* Score table with ordinals + optional factored column */
  const ScoreTable = ({ teamList, capKey, sub1Label, sub2Label, className }) => {
    const factors = getFactors(className, capKey);
    const rows = teamList.map(t => {
      const s1 = scores[`${t.id}_${capKey}_1`] ?? 50;
      const s2 = scores[`${t.id}_${capKey}_2`] ?? 50;
      const tot = s1 + s2;
      const factored = factors ? Math.round((s1 * factors.vocabF + s2 * factors.excelF) * 100) / 100 : null;
      return { ...t, s1, s2, tot, factored };
    });
    const sorted = [...rows].sort((a,b) => factors ? (b.factored - a.factored) : (b.tot - a.tot));
    const s1r = [...rows].sort((a,b)=>b.s1-a.s1).map(t=>t.id);
    const s2r = [...rows].sort((a,b)=>b.s2-a.s2).map(t=>t.id);
    const fr = factors ? [...rows].sort((a,b)=>b.factored-a.factored).map(t=>t.id) : [];
    return (
      <div>
        {factors && <div style={{fontSize:13,color:"var(--ac)",marginBottom:4,padding:"3px 6px",background:"rgba(108,138,255,.08)",borderRadius:3}}>
          Factored: {sub1Label} x({factors.label.split("/")[0]}/100) + {sub2Label} x({factors.label.split("/")[1]}/100)
        </div>}
        <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
          <th style={thS}>Rank</th><th style={thS}>Team</th>
          <th style={{...thS,textAlign:"center"}}>{sub1Label}</th>
          <th style={{...thS,textAlign:"center"}}>{sub2Label}</th>
          <th style={{...thS,textAlign:"right"}}>Raw</th>
          {factors && <th style={{...thS,textAlign:"right",color:"var(--ac)"}}>Factored</th>}
        </tr></thead><tbody>
          {sorted.map((t,i)=>(
            <tr key={t.id}>
              <td style={tdS}><div style={{textAlign:"center"}}>
                <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:18,height:18,borderRadius:"50%",fontSize:13,fontWeight:700,background:i===0?"#F59E0B":i===1?"#94A3B8":i===2?"#A0522D":"var(--s3)",color:i<3?"#000":"var(--t2)"}}>{i+1}</span>
                <div style={{fontSize:11,color:"var(--t3)"}}>{ordinal(i+1)}</div>
              </div></td>
              <td style={{...tdS,fontWeight:500}}>{t.name}</td>
              <td style={{...tdS,textAlign:"center"}}>
                <span style={{color:boxFor(t.s1).color,fontWeight:600}}>{t.s1}</span>
                <div style={{fontSize:11,color:"var(--t3)"}}>{ordinal(s1r.indexOf(t.id)+1)}</div>
              </td>
              <td style={{...tdS,textAlign:"center"}}>
                <span style={{color:boxFor(t.s2).color,fontWeight:600}}>{t.s2}</span>
                <div style={{fontSize:11,color:"var(--t3)"}}>{ordinal(s2r.indexOf(t.id)+1)}</div>
              </td>
              <td style={{...tdS,textAlign:"right"}}>
                <span style={{fontWeight:600,fontSize:15}}>{fmtTotal(t.tot)}</span>
                <div style={{fontSize:11,color:"var(--t3)"}}>{ordinal([...rows].sort((a,b)=>b.tot-a.tot).findIndex(x=>x.id===t.id)+1)}</div>
              </td>
              {factors && <td style={{...tdS,textAlign:"right"}}>
                <span style={{fontWeight:700,fontSize:16,color:"var(--ac)"}}>{t.factored.toFixed(2)}</span>
                <div style={{fontSize:11,color:"var(--t3)"}}>{ordinal(fr.indexOf(t.id)+1)}</div>
              </td>}
            </tr>
          ))}
        </tbody></table>
      </div>
    );
  };

  return (
    <div><style>{css}</style>
    <div style={{maxWidth:1200,margin:"0 auto",padding:"4px 8px"}}>
      <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0 6px",borderBottom:"1px solid var(--bd)",marginBottom:8,flexWrap:"wrap",gap:4}}>
        <div>
          <h1 style={{fontFamily:"'DM Sans',sans-serif",fontSize:26}}>Winter<span style={{color:"var(--ac)",fontStyle:"italic"}}>Guard</span> Tote</h1>
          <p style={{fontSize:13,color:"var(--t3)"}}>
            {cap?`${cap.label}`:""}
            {judgeName?` — ${judgeName}`:""}
            {eventVenue?` | ${eventVenue}`:""}
            {eventDate?` | ${eventDate}`:""}
            {lastSaved?` | Saved ${lastSaved.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}`:""}
          </p>
        </div>
        <div style={{display:"flex",gap:3}}>
          <Btn sm onClick={()=>setConfirmAction({msg:"Clear all teams and scores? Caption, event info, and custom classes will be kept.",action:()=>{setTeams([]);setScores({});setNotes({});setActiveTote(null);setPreview(null);setSchedText("");setImportMsg("");setDebugInfo("");dirty();}})}>Clear Totes</Btn>
          <Btn sm danger onClick={()=>setConfirmAction({msg:"This erases EVERYTHING — teams, scores, notes, caption, event info, custom classes. Start completely fresh?",action:()=>{setTeams([]);setScores({});setNotes({});setActiveTote(null);setJudgeCap(null);setCustomClasses([]);setEventDate("");setEventVenue("");setJudgeName("");setPreview(null);setSchedText("");setImportMsg("");setDebugInfo("");setTab("settings");dirty();}})}>Reset</Btn>
          <Btn sm onClick={()=>setShowHelp(true)} style={{background:"var(--s1)",fontSize:16,padding:"4px 8px"}}>?</Btn>
        </div>
      </header>

      <div style={{display:"flex",gap:2,background:"var(--s1)",padding:2,borderRadius:5,marginBottom:8,overflowX:"auto",alignItems:"center"}}>
        {["settings","teams","import"].map(k=><button key={k} onClick={()=>setTab(k)} style={{padding:"5px 11px",borderRadius:4,fontSize:14,fontWeight:600,cursor:"pointer",color:tab===k?"#fff":"var(--t2)",background:tab===k?"var(--ac)":"transparent",border:"none",whiteSpace:"nowrap",fontFamily:"'DM Sans',sans-serif",textTransform:"capitalize",flexShrink:0}}>{k}</button>)}
        {cap&&<div style={{width:1,height:16,background:"var(--bd)",flexShrink:0,margin:"0 2px"}}/>}
        {cap&&totes.map(t=><button key={t.key}
          draggable
          onDragStart={()=>handleToteDragStart(t.key)}
          onDragOver={e=>handleToteDragOver(e,t.key)}
          onDrop={()=>handleToteDrop(t.key)}
          onDragEnd={()=>{setDragTote(null);setDragOverTote(null);}}
          onClick={()=>{setTab("score");setActiveTote(t.key)}}
          style={{
            padding:"5px 7px",borderRadius:4,fontSize:13,fontWeight:600,cursor:"grab",
            color:tab==="score"&&activeTote===t.key?"#fff":"var(--t2)",
            background:tab==="score"&&activeTote===t.key?"var(--ac)":dragOverTote===t.key?"var(--s3)":"transparent",
            border:dragOverTote===t.key?"1px dashed var(--ac)":"1px solid transparent",
            borderLeft:`2px solid ${colorFor(t.className)}`,
            whiteSpace:"nowrap",fontFamily:"'DM Sans',sans-serif",
            opacity:dragTote===t.key?0.4:1,
            transition:"opacity .15s, background .15s",
            flexShrink:0,
          }}>{toteTabLabel(t)}</button>)}
        <button onClick={()=>setTab("summary")} style={{padding:"5px 11px",borderRadius:4,fontSize:14,fontWeight:600,cursor:"pointer",color:tab==="summary"?"#fff":"var(--t2)",background:tab==="summary"?"var(--ac)":"transparent",border:"none",fontFamily:"'DM Sans',sans-serif",marginLeft:"auto",flexShrink:0}}>Summary</button>
      </div>

      {/* SETTINGS */}
      {tab==="settings"&&<div style={{animation:"fadeIn .2s"}}>
        <Card>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <h2 style={{fontFamily:"'DM Sans',sans-serif",fontSize:22}}>Theme</h2>
              <div style={{display:"flex",gap:0,borderRadius:5,overflow:"hidden",border:"1px solid var(--bd)"}}>
                <button onClick={()=>{setTheme("light");dirty()}} style={{padding:"5px 14px",fontSize:14,fontWeight:600,cursor:"pointer",border:"none",fontFamily:"'DM Sans',sans-serif",background:theme==="light"?"var(--ac)":"var(--s2)",color:theme==="light"?"#fff":"var(--t2)"}}>Light</button>
                <button onClick={()=>{setTheme("dark");dirty()}} style={{padding:"5px 14px",fontSize:14,fontWeight:600,cursor:"pointer",border:"none",borderLeft:"1px solid var(--bd)",fontFamily:"'DM Sans',sans-serif",background:theme==="dark"?"var(--ac)":"var(--s2)",color:theme==="dark"?"#fff":"var(--t2)"}}>Dark</button>
              </div>
            </div>
            <Btn sm onClick={()=>{localStorage.removeItem("wg_layout");window.location.reload()}}>Switch Layout</Btn>
          </div>
        </Card>
        <Card>
          <h2 style={{fontFamily:"'DM Sans',sans-serif",fontSize:22,marginBottom:8}}>Event Info</h2>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
            <div style={{flex:1,minWidth:120}}>
              <label style={{fontSize:13,color:"var(--t3)",display:"block",marginBottom:2}}>Date</label>
              <Inp type="date" value={eventDate} onChange={e=>{setEventDate(e.target.value);dirty()}} style={{width:"100%"}} />
            </div>
            <div style={{flex:2,minWidth:160}}>
              <label style={{fontSize:13,color:"var(--t3)",display:"block",marginBottom:2}}>Venue / Event Name</label>
              <Inp placeholder="e.g. PPA Championships @ Wenatchee HS" value={eventVenue} onChange={e=>{setEventVenue(e.target.value);dirty()}} style={{width:"100%"}} />
            </div>
          </div>
          <div style={{flex:1}}>
            <label style={{fontSize:13,color:"var(--t3)",display:"block",marginBottom:2}}>Judge Name</label>
            <Inp placeholder="Your name" value={judgeName} onChange={e=>{setJudgeName(e.target.value);dirty()}} style={{width:"100%",maxWidth:250}} />
          </div>
        </Card>
        <Card>
          <h2 style={{fontFamily:"'DM Sans',sans-serif",fontSize:22,marginBottom:8}}>Judge Caption</h2>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
            {CAPTIONS.map(c=><button key={c.key} onClick={()=>{setJudgeCap(c.key);dirty()}} style={{padding:"10px 8px",borderRadius:6,cursor:"pointer",textAlign:"left",background:judgeCap===c.key?`${c.clr}15`:"var(--s2)",border:`2px solid ${judgeCap===c.key?c.clr:"var(--bd)"}`,fontFamily:"'DM Sans',sans-serif",color:"var(--t1)"}}>
              <div style={{fontSize:18,fontWeight:700,fontFamily:"'DM Sans',sans-serif",color:"var(--t1)"}}>{c.short}</div>
              <div style={{fontSize:14,fontWeight:600,marginTop:1,color:"var(--t1)"}}>{c.label}</div>
              <div style={{fontSize:13,color:"var(--t3)",marginTop:2}}>{c.sub1} + {c.sub2}</div>
            </button>)}
          </div>
        </Card>
        <Card>
          <h3 style={{fontFamily:"'DM Sans',sans-serif",fontSize:19,marginBottom:6}}>Custom Classes</h3>
          <div style={{display:"flex",gap:4,marginBottom:5}}>
            <Inp placeholder="e.g. Cadet" value={newCls} onChange={e=>setNewCls(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){const n=newCls.trim();if(n&&!allClasses.includes(n)){setCustomClasses(p=>[...p,n]);setNewCls("");dirty()}}}} style={{flex:1}}/>
            <Btn onClick={()=>{const n=newCls.trim();if(n&&!allClasses.includes(n)){setCustomClasses(p=>[...p,n]);setNewCls("");dirty()}}}>+ Add</Btn>
          </div>
          {customClasses.length>0&&<div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{customClasses.map(c=><span key={c} style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 7px",background:"var(--s2)",borderRadius:3,border:"1px solid var(--bd)",fontSize:14}}>{c}<button onClick={()=>{setCustomClasses(p=>p.filter(x=>x!==c));dirty()}} style={{background:"none",border:"none",color:"var(--t3)",cursor:"pointer",fontSize:15}}>x</button></span>)}</div>}
        </Card>
        <Card>
          <h3 style={{fontFamily:"'DM Sans',sans-serif",fontSize:19,marginBottom:6}}>Backup & Restore</h3>
          <p style={{fontSize:14,color:"var(--t2)",marginBottom:6}}>Download a backup file to protect your data. Restore from a backup if you need to recover.</p>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <Btn onClick={downloadBackup}>Download Backup</Btn>
            <label style={{display:"inline-flex",alignItems:"center",gap:4,padding:"7px 12px",borderRadius:5,fontSize:15,fontWeight:600,cursor:"pointer",border:"1px solid var(--bd)",background:"var(--s2)",color:"var(--t1)",fontFamily:"'DM Sans',sans-serif"}}>
              Restore Backup
              <input type="file" accept=".json" onChange={restoreBackup} style={{display:"none"}} />
            </label>
            <Btn primary onClick={exportXlsx}>Export Spreadsheet</Btn>
            <Btn primary onClick={exportPdf}>Export PDF</Btn>
          </div>
          {lastSaved&&<p style={{fontSize:13,color:"var(--t3)",marginTop:6}}>Last saved: {lastSaved.toLocaleString()}</p>}
        </Card>
        <Card>
          <h3 style={{fontFamily:"'DM Sans',sans-serif",fontSize:19,marginBottom:4}}>WGI Scale</h3>
          {BOXES.map(b=><div key={b.id} style={{display:"flex",alignItems:"center",gap:5,padding:"3px 6px",background:b.bg,borderRadius:3,marginBottom:2,flexWrap:"wrap"}}>
            <span style={{fontSize:13,fontWeight:700,color:b.color,minWidth:28}}>Box {b.id}</span>
            <span style={{fontSize:13,minWidth:30}}>{b.lo}-{b.hi}</span>
            <span style={{fontSize:13,color:"var(--t2)"}}>{b.label}</span>
            <span style={{fontSize:11,color:"var(--t3)",marginLeft:"auto"}}>{b.thirds.filter(x=>x.t).map(x=>`${x.v}: ${x.t}`).join(" | ")}</span>
          </div>)}
        </Card>
        <Card>
          <h3 style={{fontFamily:"'DM Sans',sans-serif",fontSize:19,marginBottom:6}}>WGI Score Sheets & Resources</h3>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <a href="https://www.wgi.org/color-guard/cg-score-sheets/" target="_blank" rel="noopener noreferrer" style={{fontSize:15,color:"var(--ac)",textDecoration:"none",padding:"6px 8px",background:"var(--s2)",borderRadius:4,border:"1px solid var(--bd)"}}>Score Sheets by Caption & Class (wgi.org)</a>
            <a href="https://www.wgi.org/wp-content/uploads/2025/09/2026_WGI_ColorGuard_Adj-Manual_-Rulebook_Sep25.pdf" target="_blank" rel="noopener noreferrer" style={{fontSize:15,color:"var(--ac)",textDecoration:"none",padding:"6px 8px",background:"var(--s2)",borderRadius:4,border:"1px solid var(--bd)"}}>2026 Adjudication Manual & Rulebook (PDF)</a>
            <a href="https://www.wgi.org/scoresheets/" target="_blank" rel="noopener noreferrer" style={{fontSize:15,color:"var(--ac)",textDecoration:"none",padding:"6px 8px",background:"var(--s2)",borderRadius:4,border:"1px solid var(--bd)"}}>Official WGI Score Sheets Portal</a>
            <a href="https://www.wgi.org/wp-content/uploads/2023/01/FAQ-CAPTIONS-AND-SCORING.pdf" target="_blank" rel="noopener noreferrer" style={{fontSize:15,color:"var(--ac)",textDecoration:"none",padding:"6px 8px",background:"var(--s2)",borderRadius:4,border:"1px solid var(--bd)"}}>FAQ: Captions & Scoring (PDF)</a>
          </div>
        </Card>
      </div>}

      {/* TEAMS */}
      {tab==="teams"&&<div style={{animation:"fadeIn .2s"}}>
        <Card>
          <h2 style={{fontFamily:"'DM Sans',sans-serif",fontSize:20,marginBottom:6}}>Add Team</h2>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"flex-start"}}>
            <Inp placeholder="Team name" value={tName} onChange={e=>setTName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTeam()} style={{flex:1,minWidth:100}}/>
            <ClassSelect value={selClass} onChange={setSelClass} classes={allClasses} onNewClass={n=>{if(!allClasses.includes(n)){setCustomClasses(p=>[...p,n]);dirty();}}} />
            <RoundSelect value={selRound} onChange={setSelRound} existingRounds={existingRounds} />
            <Inp placeholder="#" type="number" value={tOrder} onChange={e=>setTOrder(e.target.value)} style={{width:36,textAlign:"center"}}/>
            <Btn primary onClick={addTeam}>+</Btn>
          </div>
        </Card>
        {totes.map(tote=><Card key={tote.key}>
          <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:colorFor(tote.className)}}/>
            <h3 style={{fontFamily:"'DM Sans',sans-serif",fontSize:18}}>{tote.className}</h3>
            {tote.round&&<span style={{fontSize:13,color:"var(--ac)",fontWeight:600}}>{tote.round}</span>}
            <span style={{fontSize:13,color:"var(--t3)"}}>({toteTeams(tote.key).length})</span>
          </div>
          {toteTeams(tote.key).map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 7px",background:"var(--s2)",borderRadius:3,border:"1px solid var(--bd)",marginBottom:2}}>
            <span style={{fontSize:13,color:"var(--t3)",minWidth:14}}>{t.order}</span>
            <input value={t.name} onChange={e=>renameTeam(t.id,e.target.value)} style={{flex:1,fontSize:14,fontWeight:500,padding:"2px 4px",borderRadius:3,border:"1px solid transparent",background:"transparent",color:"var(--t1)",fontFamily:"'DM Sans',sans-serif",outline:"none"}} onFocus={e=>{e.target.style.borderColor="var(--bd)";e.target.style.background="var(--s1)"}} onBlur={e=>{e.target.style.borderColor="transparent";e.target.style.background="transparent"}} />
            {t.time&&<span style={{fontSize:11,color:"var(--t3)"}}>{t.time}</span>}
            <button onClick={()=>removeTeam(t.id)} style={{background:"none",border:"none",color:"var(--t3)",cursor:"pointer",fontSize:16}}>x</button>
          </div>)}
        </Card>)}
      </div>}

      {/* IMPORT */}
      {tab==="import"&&<div style={{animation:"fadeIn .2s"}}>
        <Card>
          <h2 style={{fontFamily:"'DM Sans',sans-serif",fontSize:20,marginBottom:6}}>Import Schedule</h2>
          <div style={{fontSize:14,color:"var(--t2)",lineHeight:1.5,marginBottom:8,background:"var(--s2)",padding:8,borderRadius:5}}>
            Open schedule link in browser. <b>Ctrl+A</b> then <b>Ctrl+C</b>. Click below. <b>Ctrl+V</b>.
          </div>
          <textarea value={schedText} onChange={e=>setSchedText(e.target.value)} onPaste={handlePaste}
            placeholder="Click here and Ctrl+V to paste schedule..."
            style={{width:"100%",minHeight:200,padding:12,borderRadius:6,border:"2px dashed var(--ac)",background:"var(--bg)",color:"var(--t1)",fontSize:15,fontFamily:"'DM Sans',sans-serif",outline:"none",resize:"vertical",lineHeight:1.4,marginBottom:6}} />
          <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
            <Btn primary onClick={()=>doParse(schedText)}>Parse Schedule</Btn>
            <Btn onClick={()=>{
              const d=[{id:uid(),name:"Lincoln HS",className:"Scholastic A",round:"Prelims",order:1},{id:uid(),name:"Roosevelt HS",className:"Scholastic A",round:"Prelims",order:2},{id:uid(),name:"Washington Academy",className:"Scholastic A",round:"Prelims",order:3},{id:uid(),name:"Adams Central",className:"Scholastic Open",round:"",order:1},{id:uid(),name:"Monroe Arts",className:"Scholastic Open",round:"",order:2},{id:uid(),name:"Cascade WG",className:"Independent A",round:"",order:1},{id:uid(),name:"Pacific Winds",className:"Independent A",round:"",order:2}];
              const ns={};d.forEach(t=>{CAPTIONS.forEach(c=>{ns[`${t.id}_${c.key}_1`]=30+Math.round(Math.random()*50);ns[`${t.id}_${c.key}_2`]=30+Math.round(Math.random()*50)})});
              setTeams(d);setScores(ns);dirty();setImportMsg("Loaded demo.");setPreview(null);setDebugInfo("");
            }}>Demo</Btn>
          </div>
          {importMsg&&<div style={{fontSize:14,padding:"4px 8px",background:"var(--s2)",borderRadius:4,marginBottom:4,color:importMsg.includes("Imported")||importMsg.includes("Loaded")?"var(--ok)":"var(--warn)"}}>{importMsg}</div>}
          {debugInfo&&<details style={{marginBottom:6}}><summary style={{fontSize:14,color:"var(--t3)",cursor:"pointer"}}>Debug info</summary>
            <pre style={{fontSize:11,color:"var(--t3)",background:"var(--s2)",padding:6,borderRadius:4,overflow:"auto",whiteSpace:"pre-wrap",maxHeight:200,border:"1px solid var(--bd)",fontFamily:"monospace"}}>{debugInfo}</pre>
          </details>}
        </Card>
        {preview&&preview.length>0&&<Card style={{border:"2px solid var(--ok)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
            <h3 style={{fontSize:18,color:"var(--ok)",fontWeight:700}}>Found {preview.length} teams</h3>
            <Btn primary onClick={()=>confirmImport(preview)}>Confirm Import</Btn>
          </div>
          <div style={{maxHeight:250,overflowY:"auto"}}>
            {preview.map((t,i)=><div key={i} style={{display:"flex",gap:6,padding:"3px 4px",fontSize:14,borderBottom:"1px solid var(--bd)"}}>
              <span style={{color:"var(--t3)",minWidth:18}}>{t.order}</span>
              <span style={{fontWeight:500,flex:1}}>{t.name}</span>
              <span style={{color:colorFor(t.className),fontWeight:600,fontSize:13}}>{SHORT(t.className)}</span>
              {t.round&&<span style={{color:"var(--ac)",fontSize:13}}>{t.round}</span>}
              <span style={{color:"var(--t3)",fontSize:13}}>{t.time}</span>
            </div>)}
          </div>
        </Card>}
      </div>}

      {/* SCORE */}
      {tab==="score"&&cap&&curTote&&<div style={{animation:"fadeIn .2s"}}>
        <Card style={{paddingBottom:5}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:3}}>
            <h2 style={{fontFamily:"'DM Sans',sans-serif",fontSize:20,display:"flex",alignItems:"center",gap:4}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:colorFor(curTote.className)}}/>{curTote.className}
              {curTote.round&&<span style={{fontSize:15,color:"var(--ac)"}}> - {curTote.round}</span>}
            </h2>
            <span style={{fontSize:13,color:"var(--t3)"}}>{cap.label} | {curTeams.length} teams</span>
          </div>
        </Card>
        {curTeams.length===0?<p style={{textAlign:"center",padding:24,color:"var(--t3)",fontSize:14}}>No teams.</p>:<div>
          <div style={{display:"flex",flexDirection:"row",gap:6}}>
            <Scale title={cap.sub1} teams={curTeams} trackH={trackH} scores={Object.fromEntries(curTeams.map(t=>[t.id,scores[`${t.id}_${judgeCap}_1`]??50]))} onScore={(id,v)=>handleScore(`${id}_${judgeCap}_1`,v)}/>
            <Scale title={cap.sub2} teams={curTeams} trackH={trackH} scores={Object.fromEntries(curTeams.map(t=>[t.id,scores[`${t.id}_${judgeCap}_2`]??50]))} onScore={(id,v)=>handleScore(`${id}_${judgeCap}_2`,v)}/>
            {/* Ranking column */}
            <div style={{minWidth:0,flex:"0 0 auto",width:Math.max(160, Math.min(260, curTeams.length > 6 ? 180 : 220)),display:"flex",flexDirection:"column"}}>
              <div style={{textAlign:"center",marginBottom:2}}>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:19,lineHeight:1.1}}>Ranking</div>
                <div style={{fontSize:11,color:"var(--t3)"}}>by total</div>
              </div>
              <div style={{background:"var(--s1)",borderRadius:7,border:"1px solid var(--bd)",padding:6,flex:1,overflowY:"auto",maxHeight:trackH}}>
                {(()=>{
                  const factors = getFactors(curTote.className, judgeCap);
                  const rows = curTeams.map(t => {
                    const s1 = scores[`${t.id}_${judgeCap}_1`]??50;
                    const s2 = scores[`${t.id}_${judgeCap}_2`]??50;
                    const tot = s1 + s2;
                    const factored = factors ? Math.round((s1*factors.vocabF + s2*factors.excelF)*100)/100 : null;
                    return {...t, s1, s2, tot, factored};
                  }).sort((a,b) => factors ? (b.factored-a.factored) : (b.tot-a.tot));
                  const s1r = [...rows].sort((a,b)=>b.s1-a.s1).map(t=>t.id);
                  const s2r = [...rows].sort((a,b)=>b.s2-a.s2).map(t=>t.id);
                  return (<div>
                    {factors && <div style={{fontSize:12,color:"var(--ac)",marginBottom:3,textAlign:"center"}}>{factors.label} factoring</div>}
                    {rows.map((t,i)=>(
                      <div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:5,padding:"5px 5px",borderBottom:"1px solid var(--bd)",fontSize:15}}>
                        <div style={{textAlign:"center",minWidth:24,flexShrink:0,paddingTop:2}}>
                          <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:22,height:22,borderRadius:"50%",fontSize:13,fontWeight:700,background:i===0?"#F59E0B":i===1?"#94A3B8":i===2?"#A0522D":"var(--s3)",color:i<3?"#000":"var(--t2)"}}>{i+1}</span>
                          <div style={{fontSize:11,color:"var(--t3)"}}>{ordinal(i+1)}</div>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontSize:15,marginBottom:3}}>{t.name}</div>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:14,color:"var(--t3)"}}>
                            <div style={{textAlign:"center"}}>
                              <div style={{color:boxFor(t.s1).color,fontWeight:600}}>{t.s1}</div>
                              <div style={{fontSize:11,color:"var(--t3)"}}>{ordinal(s1r.indexOf(t.id)+1)}</div>
                            </div>
                            <div style={{textAlign:"center"}}>
                              <div style={{color:boxFor(t.s2).color,fontWeight:600}}>{t.s2}</div>
                              <div style={{fontSize:11,color:"var(--t3)"}}>{ordinal(s2r.indexOf(t.id)+1)}</div>
                            </div>
                            <div style={{textAlign:"center"}}>
                              <div style={{fontWeight:600,color:"var(--t1)"}}>{fmtTotal(t.tot)}</div>
                              <div style={{fontSize:11,color:"var(--t3)"}}>{ordinal([...rows].sort((a,b)=>b.tot-a.tot).findIndex(x=>x.id===t.id)+1)}</div>
                            </div>
                            {factors && <div style={{textAlign:"center"}}>
                              <div style={{fontWeight:700,color:"var(--ac)"}}>{t.factored.toFixed(2)}</div>
                              <div style={{fontSize:11,color:"var(--t3)"}}>{ordinal(i+1)}</div>
                            </div>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>);
                })()}
              </div>
            </div>
          </div>
          {/* Notes section */}
          <div style={{background:"var(--s1)",border:"1px solid var(--bd)",borderRadius:7,padding:10,marginTop:8}}>
            <h3 style={{fontFamily:"'DM Sans',sans-serif",fontSize:18,marginBottom:6}}>Notes</h3>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr>
                  <th style={{textAlign:"left",padding:"4px 6px",borderBottom:"2px solid var(--bd)",color:"var(--t2)",fontWeight:600,fontSize:13,textTransform:"uppercase",width:140}}>Team</th>
                  <th style={{textAlign:"left",padding:"4px 6px",borderBottom:"2px solid var(--bd)",color:"var(--t2)",fontWeight:600,fontSize:13,textTransform:"uppercase"}}>Comments</th>
                </tr>
              </thead>
              <tbody>
                {curTeams.map(t=>(
                  <tr key={t.id}>
                    <td style={{padding:"3px 6px",borderBottom:"1px solid var(--bd)",fontSize:14,fontWeight:500,verticalAlign:"top",whiteSpace:"nowrap"}}>{t.name}</td>
                    <td style={{padding:"2px 4px",borderBottom:"1px solid var(--bd)"}}>
                      <textarea
                        value={notes[t.id]||""}
                        onChange={e=>{setNotes(p=>({...p,[t.id]:e.target.value}));setSaved(false);}}
                        placeholder="..."
                        rows={1}
                        style={{width:"100%",padding:"3px 6px",borderRadius:3,border:"1px solid var(--bd)",background:"var(--s2)",color:"var(--t1)",fontSize:14,fontFamily:"'DM Sans',sans-serif",outline:"none",resize:"vertical",lineHeight:1.3,minHeight:24}}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>}
      </div>}
      {tab==="score"&&!cap&&<p style={{textAlign:"center",padding:30,color:"var(--t3)",fontSize:15}}>Select caption in Settings.</p>}

      {/* SUMMARY */}
      {tab==="summary"&&<div style={{animation:"fadeIn .2s"}}>
        {!cap?<p style={{textAlign:"center",padding:30,color:"var(--t3)"}}>Select caption in Settings.</p>:totes.length===0?<p style={{textAlign:"center",padding:30,color:"var(--t3)"}}>Add teams.</p>:<div>
          {totes.map(tote=><Card key={tote.key}>
            <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:6}}>
              <span style={{width:7,height:7,borderRadius:"50%",background:colorFor(tote.className)}}/>
              <h2 style={{fontFamily:"'DM Sans',sans-serif",fontSize:19}}>{tote.className}</h2>
              {tote.round&&<span style={{fontSize:13,color:"var(--ac)",fontWeight:600}}>{tote.round}</span>}
              <span style={{fontSize:13,color:"var(--t3)",marginLeft:"auto"}}>{cap.label}</span>
            </div>
            <ScoreTable teamList={toteTeams(tote.key)} capKey={judgeCap} sub1Label={cap.sub1} sub2Label={cap.sub2} className={tote.className} />
          </Card>)}
          <Card>
            <Btn primary onClick={exportXlsx}>Export to Spreadsheet (.xlsx)</Btn>
            <Btn primary onClick={exportPdf} style={{marginLeft:6}}>Export to PDF</Btn>
          </Card>
        </div>}
      </div>}
    {/* Confirmation Modal */}
    {confirmAction && (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,backdropFilter:"blur(4px)"}} onClick={()=>setConfirmAction(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:"var(--s1)",border:"1px solid var(--bd)",borderRadius:10,padding:20,width:"90%",maxWidth:360,boxShadow:"0 8px 32px rgba(0,0,0,.5)"}}>
          <p style={{fontSize:16,lineHeight:1.5,marginBottom:16,color:"var(--t1)"}}>{confirmAction.msg}</p>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Btn onClick={()=>setConfirmAction(null)}>Cancel</Btn>
            <Btn danger onClick={()=>{confirmAction.action();setConfirmAction(null);}}>Yes, do it</Btn>
          </div>
        </div>
      </div>
    )}
    {/* Help Modal */}
    {showHelp && (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,backdropFilter:"blur(4px)"}} onClick={()=>setShowHelp(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:"var(--s1)",border:"1px solid var(--bd)",borderRadius:10,padding:20,width:"92%",maxWidth:520,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 8px 32px rgba(0,0,0,.5)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <h2 style={{fontFamily:"'DM Sans',sans-serif",fontSize:26}}>User Guide</h2>
            <button onClick={()=>setShowHelp(false)} style={{background:"none",border:"none",color:"var(--t2)",fontSize:24,cursor:"pointer"}}>x</button>
          </div>

          <div style={{fontSize:15,color:"var(--t2)",lineHeight:1.6}}>
            <h3 style={{fontFamily:"'DM Sans',sans-serif",fontSize:20,color:"var(--t1)",marginBottom:4,marginTop:12}}>Getting Started</h3>
            <p>WinterGuard Tote is a digital score tote sheet for winterguard judges. When you first open the app, enter the access code to get in, then choose your preferred layout (2 Column or 3 Column). Go to <b>Settings</b> to configure your theme, event info, and judge caption, then import a schedule or add teams manually.</p>

            <h3 style={{fontFamily:"'DM Sans',sans-serif",fontSize:20,color:"var(--t1)",marginBottom:4,marginTop:14}}>Settings</h3>
            <p><b>Theme & Layout</b> — Toggle between Light and Dark mode. Use the <b>Switch Layout</b> button to go back to the 2 Column / 3 Column picker. Your preferences are saved.</p>
            <p style={{marginTop:4}}><b>Event Info</b> — Enter the date, venue/event name, and your name. These display in the header and are included in exports and backups.</p>
            <p style={{marginTop:4}}><b>Judge Caption</b> — Select which caption you are judging: Equipment (EQ), Movement (MV), Design Analysis (DA), or General Effect (GE). Each has its own sub-captions (e.g., Vocabulary + Excellence for EQ/MV). You must select a caption before tote tabs and scoring become available.</p>
            <p style={{marginTop:4}}><b>Custom Classes</b> — Add non-standard class names your circuit uses (Cadet, Scholastic AA, etc.). These appear in the class dropdown when adding teams.</p>
            <p style={{marginTop:4}}><b>Backup & Restore</b> — Download a JSON backup of all your data (teams, scores, notes, settings) for safekeeping. Restore from a backup file if needed. You can also export your scores to a <b>spreadsheet (.xlsx)</b> or <b>PDF</b> from here.</p>
            <p style={{marginTop:4}}><b>WGI Scale Reference</b> — Shows the 5-box scoring system with numerical ranges and achievement levels.</p>
            <p style={{marginTop:4}}><b>WGI Score Sheets & Resources</b> — Quick links to official WGI score sheets, the adjudication manual, and scoring FAQ. These open in a new tab for reference while judging.</p>

            <h3 style={{fontFamily:"'DM Sans',sans-serif",fontSize:20,color:"var(--t1)",marginBottom:4,marginTop:14}}>Importing a Schedule</h3>
            <p>Go to the <b>Import</b> tab. Open your CompetitionSuite schedule in a browser, press <b>Ctrl+A</b> (select all), then <b>Ctrl+C</b> (copy). Come back here, tap in the paste area, and press <b>Ctrl+V</b>. The parser detects teams, classes, rounds, and times automatically.</p>
            <p style={{marginTop:4}}>A preview shows all detected teams organized by class and round. Review the list, then tap <b>Confirm Import</b>. You must have a caption selected before importing. Each class+round combination becomes its own tote tab.</p>
            <p style={{marginTop:4}}>Percussion entries are automatically filtered out. Exhibitions are skipped. City names are stripped from team names.</p>

            <h3 style={{fontFamily:"'DM Sans',sans-serif",fontSize:20,color:"var(--t1)",marginBottom:4,marginTop:14}}>Teams</h3>
            <p>The <b>Teams</b> tab shows all imported teams grouped by tote. You can <b>edit team names</b> by tapping on them directly. Add teams manually using the form at the top — the class dropdown includes <b>+ New class</b> and the round dropdown includes <b>+ New round</b>.</p>
            <p style={{marginTop:4}}>Tap the <b>x</b> next to any team to remove it.</p>

            <h3 style={{fontFamily:"'DM Sans',sans-serif",fontSize:20,color:"var(--t1)",marginBottom:4,marginTop:14}}>Tote Tabs</h3>
            <p>After importing, tote tabs appear in the tab bar with short labels like <b>SW-1</b>, <b>IO-4</b>, <b>IW-2</b> (class abbreviation + round number). They are automatically sorted by performance time from the schedule.</p>
            <p style={{marginTop:4}}>You can <b>drag tabs</b> left and right to reorder them. Your custom order is saved.</p>

            <h3 style={{fontFamily:"'DM Sans',sans-serif",fontSize:20,color:"var(--t1)",marginBottom:4,marginTop:14}}>Scoring</h3>
            <p>Each tote has three side-by-side columns:</p>
            <p style={{marginTop:4}}><b>Left column</b> — Sub-caption 1 scale (Vocabulary, Composition, or Repertoire depending on your caption).</p>
            <p><b>Middle column</b> — Sub-caption 2 scale (Excellence or Performance).</p>
            <p><b>Right column</b> — Live ranking panel showing each team sorted by total, with ordinals under each score.</p>
            <p style={{marginTop:6}}>The scales are color-coded by WGI box: <span style={{color:"#DC2626"}}>Box 1 (0-6)</span>, <span style={{color:"#F97316"}}>Box 2 (7-29)</span>, <span style={{color:"#EAB308"}}>Box 3 (30-59)</span>, <span style={{color:"#22C55E"}}>Box 4 (60-89)</span>, <span style={{color:"#3B82F6"}}>Box 5 (90-100)</span>. Dashed lines mark the thirds within each box.</p>
            <p style={{marginTop:4}}><b>Drag team chips</b> up and down to set scores. Scores are whole numbers 0-100. Chips automatically spread apart so they never overlap.</p>
            <p style={{marginTop:4}}>Totals display as XX.X (divided by 10). For <b>Regional A</b> and <b>A Class</b> on EQ/MV captions, a factored score appears using the WGI weighting (RA: 60/140, A: 70/130).</p>

            <h3 style={{fontFamily:"'DM Sans',sans-serif",fontSize:20,color:"var(--t1)",marginBottom:4,marginTop:14}}>Notes</h3>
            <p>Below the scoring columns is a notes table with a text field for each team in that tote. Use this for commentary during performances. Notes auto-save and are included in exports.</p>

            <h3 style={{fontFamily:"'DM Sans',sans-serif",fontSize:20,color:"var(--t1)",marginBottom:4,marginTop:14}}>Summary & Export</h3>
            <p>The <b>Summary</b> tab shows ranked results for every tote with ordinals for each sub-caption and total. Use the export buttons to download your scores as a <b>spreadsheet (.xlsx)</b> or <b>PDF</b>. Each tote becomes a separate sheet/page with performance order, notes, and a ranked summary below. Export buttons are also available in Settings under Backup & Restore.</p>

            <h3 style={{fontFamily:"'DM Sans',sans-serif",fontSize:20,color:"var(--t1)",marginBottom:4,marginTop:14}}>Offline Use</h3>
            <p>After visiting the app once with internet, it works fully offline. All data is stored on your device. On iPad, tap the Share button in Safari → <b>Add to Home Screen</b> to install it as an app with its own icon.</p>

            <h3 style={{fontFamily:"'DM Sans',sans-serif",fontSize:20,color:"var(--t1)",marginBottom:4,marginTop:14}}>Saving & Data</h3>
            <p>All data saves automatically to your device every few seconds. The header shows when data was last saved. Each judge's data is completely independent — multiple judges can use the app simultaneously on their own devices without any conflicts.</p>
            <p style={{marginTop:4}}><b>Clear Totes</b> removes teams, scores, and notes but keeps your caption, event info, and custom classes. <b>Reset</b> erases everything and returns to a fresh start.</p>
            <p style={{marginTop:4}}>Use <b>Download Backup</b> in Settings before a competition for extra protection. Your backup file can be restored on any device.</p>
          </div>
        </div>
      </div>
    )}
    </div></div>
  );
}
