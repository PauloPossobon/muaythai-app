import { useState, useEffect, useCallback } from "react";
import {
  collection, doc, getDocs, setDoc, deleteDoc,
  onSnapshot, addDoc, updateDoc, query, orderBy, serverTimestamp
} from "firebase/firestore";
import { db } from "./firebase";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MONTHS_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DAYS_SHORT = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const DAYS_FULL  = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const ADMIN_USER = "professor";
const ADMIN_PASS = "muay123"; // troque aqui

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

function fmt(d) {
  const dd = new Date(d); dd.setHours(12, 0, 0, 0);
  return dd.toISOString().split("T")[0];
}
function parseDate(s) { return new Date(s + "T12:00:00"); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isPast(s) { return parseDate(s) < TODAY; }
function isToday(s) { return fmt(TODAY) === s; }
function fmtDisplay(s) {
  const d = parseDate(s);
  return `${DAYS_SHORT[d.getDay()]}, ${d.getDate()} de ${MONTHS_PT[d.getMonth()]}`;
}
function genId() { return Math.random().toString(36).slice(2, 10); }

const DEFAULT_CONFIG = {
  activeDays: [1, 2, 3, 4, 5],
  defaultTimes: {
    0: [], 1: ["07:00","08:00","18:00","19:00"],
    2: ["07:00","08:00","18:00","19:00"],
    3: ["07:00","08:00","18:00","19:00"],
    4: ["07:00","08:00","18:00","19:00"],
    5: ["07:00","08:00","18:00","19:00"],
    6: ["09:00","10:00","11:00"],
  },
  maxStudentsPerSlot: 1,
  blockedDates: [],
  blockedSlots: [],
};

function getSlots(dateStr, config, bookings) {
  const dow = parseDate(dateStr).getDay();
  if (!config.activeDays.includes(dow)) return [];
  if (config.blockedDates.includes(dateStr)) return [];
  const times = config.defaultTimes[dow] || [];
  return times.map(time => {
    const key = `${dateStr}-${time}`;
    const blocked = config.blockedSlots.includes(key);
    const count = bookings.filter(b => b.date === dateStr && b.time === time).length;
    return { key, time, blocked, count, max: config.maxStudentsPerSlot,
      available: !blocked && count < config.maxStudentsPerSlot };
  });
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, variant="primary", size="md", disabled=false, full=false }) => {
  const v = {
    primary: "background:#dc2626;color:#fff;border:none;",
    ghost:   "background:#1f1f1f;color:#d4d4d4;border:1px solid #404040;",
    danger:  "background:#450a0a;color:#fca5a5;border:1px solid #7f1d1d;",
    success: "background:#14532d;color:#86efac;border:1px solid #15803d;",
    outline: "background:transparent;color:#f87171;border:1px solid #dc2626;",
  }[variant] || "";
  const s = { sm:"font-size:12px;padding:6px 12px;", md:"font-size:13px;padding:10px 16px;", lg:"font-size:15px;padding:14px 20px;" }[size];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display:"inline-flex",alignItems:"center",gap:"6px",fontFamily:"inherit",fontWeight:700,
        borderRadius:12,cursor:disabled?"not-allowed":"pointer",opacity:disabled?.45:1,
        width:full?"100%":undefined,justifyContent:"center",transition:"all .15s",
        ...Object.fromEntries(v.split(";").filter(Boolean).map(r=>{ const[k,...vs]=r.trim().split(":"); return[k.trim().replace(/-./g,m=>m[1].toUpperCase()),vs.join(":").trim()]; })),
        ...Object.fromEntries(s.split(";").filter(Boolean).map(r=>{ const[k,...vs]=r.trim().split(":"); return[k.trim().replace(/-./g,m=>m[1].toUpperCase()),vs.join(":").trim()]; })),
      }}
    >
      {children}
    </button>
  );
};

const Field = ({ label, value, onChange, type="text", placeholder }) => (
  <div style={{marginBottom:16}}>
    <div style={{fontSize:11,color:"#737373",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>{label}</div>
    <input
      type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{width:"100%",background:"#171717",border:"1px solid #404040",borderRadius:12,
        padding:"12px 14px",color:"#fff",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}
    />
  </div>
);

const Pill = ({ children, color="gray" }) => {
  const c = {
    red:   {bg:"#450a0a",text:"#fca5a5",border:"#7f1d1d"},
    green: {bg:"#14532d",text:"#86efac",border:"#15803d"},
    yellow:{bg:"#422006",text:"#fcd34d",border:"#92400e"},
    gray:  {bg:"#262626",text:"#a3a3a3",border:"#404040"},
    blue:  {bg:"#1e3a5f",text:"#93c5fd",border:"#1d4ed8"},
  }[color]||{bg:"#262626",text:"#a3a3a3",border:"#404040"};
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:700,
      padding:"3px 8px",borderRadius:99,background:c.bg,color:c.text,border:`1px solid ${c.border}`}}>
      {children}
    </span>
  );
};

function CalendarGrid({ year, month, onDateClick, getDot, selected }) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:8}}>
        {DAYS_SHORT.map(d => (
          <div key={d} style={{textAlign:"center",fontSize:11,color:"#525252",fontWeight:700,padding:"4px 0"}}>{d}</div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"4px 0"}}>
        {cells.map((day, i) => {
          if (!day) return <div key={i}/>;
          const ds = fmt(new Date(year, month, day));
          const past = isPast(ds) && !isToday(ds);
          const today = isToday(ds);
          const sel = selected === ds;
          const dot = getDot ? getDot(ds) : null;
          return (
            <button key={i} onClick={() => !past && onDateClick(ds)} disabled={past}
              style={{position:"relative",margin:"0 auto",width:36,height:36,borderRadius:10,
                border:today&&!sel?"1px solid #dc2626":"1px solid transparent",
                background:sel?"#dc2626":"transparent",
                color:sel?"#fff":past?"#404040":dot?"#fff":"#525252",
                fontSize:13,fontWeight:700,cursor:past?"not-allowed":"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit",
              }}>
              {day}
              {dot && !sel && (
                <span style={{position:"absolute",bottom:2,left:"50%",transform:"translateX(-50%)",
                  width:5,height:5,borderRadius:"50%",background:dot}}/>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── SCREENS ──────────────────────────────────────────────────────────────────
function WelcomeScreen({ onStudent, onAdmin }) {
  return (
    <div style={{minHeight:"100vh",background:"#0e0e0e",display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"space-between",padding:"48px 24px 32px"}}>
      <div/>
      <div style={{width:"100%",maxWidth:400,textAlign:"center"}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:32}}>
          <div style={{width:88,height:88,background:"#dc2626",borderRadius:24,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:44,
            boxShadow:"0 20px 60px rgba(220,38,38,.4)"}}>🥊</div>
        </div>
        <h1 style={{fontSize:36,fontWeight:900,color:"#fff",margin:"0 0 8px",letterSpacing:"-1px"}}>Muay Thai</h1>
        <p style={{color:"#525252",fontSize:14,marginBottom:48}}>Agende sua aula. Treine como campeão.</p>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <Btn onClick={onStudent} size="lg" full>👊 Sou Aluno — Entrar ou Cadastrar</Btn>
          <button onClick={onAdmin}
            style={{background:"none",border:"none",color:"#525252",fontSize:12,fontWeight:700,
              cursor:"pointer",padding:"8px",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            🔒 Acesso do Professor
          </button>
        </div>
      </div>
      <p style={{color:"#262626",fontSize:12}}>Muay Thai App v3.0</p>
    </div>
  );
}

function StudentAuthScreen({ onBack, onEnter, students }) {
  const [step, setStep] = useState("choice");
  const [name, setName] = useState(""); const [dob, setDob] = useState(""); const [phone, setPhone] = useState("");
  const [loginPhone, setLoginPhone] = useState(""); const [error, setError] = useState("");

  const fmtPhone = v => {
    const n = v.replace(/\D/g,"").slice(0,11);
    if(n.length<=2) return `(${n}`;
    if(n.length<=7) return `(${n.slice(0,2)}) ${n.slice(2)}`;
    return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
  };

  const handleRegister = async () => {
    if(!name.trim()||!dob||!phone.trim()){setError("Preencha todos os campos.");return;}
    const student = { id:genId(), name:name.trim(), dob, phone:phone.trim(), createdAt:Date.now() };
    await setDoc(doc(db,"students",student.id), student);
    onEnter(student);
  };

  const handleLogin = () => {
    const found = students.find(s=>s.phone.replace(/\D/g,"")=== loginPhone.replace(/\D/g,""));
    if(!found){setError("Telefone não encontrado. Faça o cadastro.");return;}
    onEnter(found);
  };

  const back = <button onClick={()=>setStep("choice")} style={{background:"none",border:"none",color:"#737373",
    fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:4,marginBottom:32,fontFamily:"inherit"}}>
    ← Voltar
  </button>;

  const wrap = children => (
    <div style={{minHeight:"100vh",background:"#0e0e0e",padding:"40px 24px"}}>
      <button onClick={step==="choice"?onBack:()=>setStep("choice")} style={{background:"none",border:"none",
        color:"#737373",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:4,
        marginBottom:32,fontFamily:"inherit"}}>← Voltar</button>
      <div style={{maxWidth:400,margin:"0 auto"}}>{children}</div>
    </div>
  );

  if(step==="choice") return wrap(
    <>
      <div style={{width:48,height:48,background:"#1f1f1f",border:"1px solid #404040",borderRadius:16,
        display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,marginBottom:24}}>👤</div>
      <h2 style={{fontSize:24,fontWeight:900,color:"#fff",marginBottom:8}}>Área do Aluno</h2>
      <p style={{color:"#737373",fontSize:14,marginBottom:40}}>Primeiro acesso ou já tem cadastro?</p>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <Btn onClick={()=>{setStep("register");setError("");}} size="lg" full>+ Primeiro acesso — Cadastrar</Btn>
        <Btn onClick={()=>{setStep("login");setError("");}} size="lg" variant="ghost" full>→ Já tenho cadastro — Entrar</Btn>
      </div>
    </>
  );

  if(step==="login") return wrap(
    <>
      <h2 style={{fontSize:24,fontWeight:900,color:"#fff",marginBottom:8}}>Bem-vindo de volta</h2>
      <p style={{color:"#737373",fontSize:14,marginBottom:32}}>Digite seu telefone cadastrado.</p>
      <Field label="WhatsApp / Telefone" value={loginPhone} onChange={v=>{setLoginPhone(fmtPhone(v));setError("");}} placeholder="(11) 99999-0000"/>
      {error&&<p style={{color:"#f87171",fontSize:12,marginBottom:12}}>⚠ {error}</p>}
      <Btn onClick={handleLogin} size="lg" full disabled={loginPhone.length<10}>Entrar →</Btn>
    </>
  );

  return wrap(
    <>
      <h2 style={{fontSize:24,fontWeight:900,color:"#fff",marginBottom:8}}>Criar conta</h2>
      <p style={{color:"#737373",fontSize:14,marginBottom:32}}>Rápido, só 3 campos.</p>
      <Field label="Nome completo" value={name} onChange={v=>{setName(v);setError("");}} placeholder="Seu nome"/>
      <Field label="Data de nascimento" type="date" value={dob} onChange={v=>{setDob(v);setError("");}}/>
      <Field label="WhatsApp / Telefone" value={phone} onChange={v=>{setPhone(fmtPhone(v));setError("");}} placeholder="(11) 99999-0000"/>
      {error&&<p style={{color:"#f87171",fontSize:12,marginBottom:12}}>⚠ {error}</p>}
      <Btn onClick={handleRegister} size="lg" full disabled={!name||!dob||!phone}>Criar conta →</Btn>
    </>
  );
}

function AdminLoginScreen({ onBack, onLogin }) {
  const [user,setUser]=useState(""); const [pass,setPass]=useState(""); const [error,setError]=useState("");
  const handle = () => {
    if(user===ADMIN_USER&&pass===ADMIN_PASS) onLogin();
    else setError("Usuário ou senha incorretos.");
  };
  return (
    <div style={{minHeight:"100vh",background:"#0e0e0e",padding:"40px 24px"}}>
      <button onClick={onBack} style={{background:"none",border:"none",color:"#737373",fontSize:13,
        cursor:"pointer",display:"flex",alignItems:"center",gap:4,marginBottom:32,fontFamily:"inherit"}}>← Voltar</button>
      <div style={{maxWidth:400,margin:"0 auto"}}>
        <div style={{width:48,height:48,background:"#1f1f1f",border:"1px solid #404040",borderRadius:16,
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,marginBottom:24}}>🔒</div>
        <h2 style={{fontSize:24,fontWeight:900,color:"#fff",marginBottom:8}}>Área do Professor</h2>
        <p style={{color:"#737373",fontSize:13,marginBottom:8}}>Acesso restrito.</p>
        <p style={{color:"#525252",fontSize:12,marginBottom:32}}>Demo: professor / muay123</p>
        <Field label="Usuário" value={user} onChange={v=>{setUser(v);setError("");}} placeholder="professor"/>
        <Field label="Senha" type="password" value={pass} onChange={v=>{setPass(v);setError("");}} placeholder="••••••••"/>
        {error&&<p style={{color:"#f87171",fontSize:12,marginBottom:12}}>⚠ {error}</p>}
        <Btn onClick={handle} size="lg" full disabled={!user||!pass}>🔒 Entrar como Professor</Btn>
      </div>
    </div>
  );
}

// ─── STUDENT APP ──────────────────────────────────────────────────────────────
function StudentApp({ student, config, bookings, onBook, onCancel, onLogout }) {
  const [tab, setTab] = useState("calendar");
  const [year, setYear] = useState(TODAY.getFullYear());
  const [month, setMonth] = useState(TODAY.getMonth());
  const [selected, setSelected] = useState(null);

  const myBookings = bookings.filter(b => b.studentId === student.id);

  const getDot = ds => {
    if(isPast(ds)) return null;
    if(myBookings.some(b=>b.date===ds)) return "#4ade80";
    const slots = getSlots(ds, config, bookings);
    return slots.some(s=>s.available) ? "#dc2626" : null;
  };

  const selectedSlots = selected ? getSlots(selected, config, bookings) : [];

  const handleBook = async (dateStr, time) => {
    const already = bookings.find(b=>b.studentId===student.id&&b.date===dateStr&&b.time===time);
    if(already) return;
    const b = { id:genId(), studentId:student.id, studentName:student.name,
      studentPhone:student.phone, date:dateStr, time, confirmed:false, createdAt:Date.now() };
    await setDoc(doc(db,"bookings",b.id), b);
    await addDoc(collection(db,"notifications"), {
      message:`${student.name} agendou ${time} em ${fmtDisplay(dateStr)}`,
      read:false, createdAt:serverTimestamp()
    });
  };

  const handleCancel = async id => {
    await deleteDoc(doc(db,"bookings",id));
  };

  const prevM = () => { if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); setSelected(null); };
  const nextM = () => { if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); setSelected(null); };

  const card = (children, extra={}) => (
    <div style={{background:"#161616",border:"1px solid #262626",borderRadius:16,padding:16,...extra}}>{children}</div>
  );

  const tabBtn = (id,label,badge) => (
    <button key={id} onClick={()=>setTab(id)} style={{flex:1,display:"flex",alignItems:"center",
      justifyContent:"center",gap:6,padding:"10px",borderRadius:12,border:"none",fontFamily:"inherit",
      fontSize:13,fontWeight:700,cursor:"pointer",transition:"all .2s",
      background:tab===id?"#dc2626":"transparent",color:tab===id?"#fff":"#737373"}}>
      {label}
      {badge>0&&<span style={{width:18,height:18,borderRadius:9,fontSize:10,fontWeight:900,
        display:"flex",alignItems:"center",justifyContent:"center",
        background:tab===id?"rgba(255,255,255,.25)":"#dc2626",color:"#fff"}}>{badge}</span>}
    </button>
  );

  return (
    <div style={{minHeight:"100vh",background:"#0e0e0e",maxWidth:430,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"36px 20px 16px"}}>
        <div>
          <p style={{color:"#525252",fontSize:12,margin:0}}>Olá,</p>
          <p style={{color:"#fff",fontSize:20,fontWeight:900,margin:0}}>{student.name.split(" ")[0]} 👊</p>
        </div>
        <button onClick={onLogout} style={{width:38,height:38,borderRadius:12,background:"#1f1f1f",
          border:"1px solid #404040",cursor:"pointer",fontSize:16}}>↩</button>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,margin:"0 20px 20px",background:"#111",borderRadius:16,padding:4,border:"1px solid #262626"}}>
        {tabBtn("calendar","📅 Agendar")}
        {tabBtn("bookings","📋 Minhas Aulas",myBookings.length)}
      </div>

      <div style={{padding:"0 20px 40px"}}>
        {tab==="calendar"&&(
          <>
            {/* Cal nav */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <button onClick={prevM} style={{width:36,height:36,borderRadius:10,background:"#1f1f1f",
                border:"1px solid #404040",color:"#d4d4d4",cursor:"pointer",fontSize:16}}>‹</button>
              <span style={{color:"#fff",fontWeight:700,fontSize:15}}>{MONTHS_PT[month]} {year}</span>
              <button onClick={nextM} style={{width:36,height:36,borderRadius:10,background:"#1f1f1f",
                border:"1px solid #404040",color:"#d4d4d4",cursor:"pointer",fontSize:16}}>›</button>
            </div>

            {card(<CalendarGrid year={year} month={month} onDateClick={setSelected} getDot={getDot} selected={selected}/>)}

            <div style={{display:"flex",gap:16,margin:"12px 0 20px 4px"}}>
              {[["#dc2626","Vagas disponíveis"],["#4ade80","Você agendou"]].map(([c,l])=>(
                <div key={l} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#737373"}}>
                  <span style={{width:8,height:8,borderRadius:"50%",background:c,flexShrink:0}}/>
                  {l}
                </div>
              ))}
            </div>

            {selected&&(
              <>
                <h3 style={{color:"#fff",fontWeight:700,fontSize:15,marginBottom:12}}>{fmtDisplay(selected)}</h3>
                {selectedSlots.length===0
                  ? card(<div style={{textAlign:"center",padding:"24px 0"}}><p style={{color:"#525252",fontSize:14}}>🔒 Sem horários disponíveis neste dia.</p></div>)
                  : <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {selectedSlots.map(slot=>{
                        const myB = myBookings.find(b=>b.date===selected&&b.time===slot.time);
                        const full = slot.count>=slot.max&&!myB;
                        return (
                          <div key={slot.key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                            borderRadius:16,border:`1px solid ${myB?"#15803d":full||slot.blocked?"#262626":"#404040"}`,
                            background:myB?"#052e16":full||slot.blocked?"#0a0a0a":"#161616",padding:"14px 16px",
                            opacity:full||slot.blocked?0.6:1}}>
                            <div style={{display:"flex",alignItems:"center",gap:10}}>
                              <span style={{width:8,height:8,borderRadius:"50%",flexShrink:0,
                                background:myB?"#4ade80":full?"#dc2626":"#dc2626",
                                animation:!myB&&!full&&!slot.blocked?"pulse 2s infinite":undefined}}/>
                              <span style={{color:"#fff",fontWeight:900,fontSize:17}}>{slot.time}</span>
                              {myB&&<Pill color="green">✓ Agendado</Pill>}
                              {full&&!myB&&<Pill color="red">Lotado</Pill>}
                              {slot.blocked&&<Pill color="gray">🔒 Bloqueado</Pill>}
                            </div>
                            {myB
                              ? <Btn variant="danger" size="sm" onClick={()=>handleCancel(myB.id)}>✕ Cancelar</Btn>
                              : <Btn variant={slot.available?"primary":"ghost"} size="sm"
                                  disabled={!slot.available} onClick={()=>slot.available&&handleBook(selected,slot.time)}>
                                  {slot.available?"+ Reservar":"Indisponível"}
                                </Btn>
                            }
                          </div>
                        );
                      })}
                    </div>
                }
              </>
            )}
            {!selected&&(
              <div style={{textAlign:"center",padding:"40px 0"}}>
                <p style={{color:"#404040",fontSize:32,marginBottom:8}}>📅</p>
                <p style={{color:"#525252",fontSize:14}}>Toque em uma data para ver os horários</p>
              </div>
            )}
          </>
        )}

        {tab==="bookings"&&(
          <>
            <h2 style={{color:"#fff",fontWeight:900,fontSize:22,marginBottom:20}}>Minhas Aulas</h2>
            {myBookings.length===0
              ? <div style={{textAlign:"center",padding:"48px 0"}}>
                  <p style={{color:"#404040",fontSize:36,marginBottom:8}}>📋</p>
                  <p style={{color:"#525252",fontSize:14,marginBottom:16}}>Nenhuma aula agendada ainda.</p>
                  <Btn onClick={()=>setTab("calendar")} variant="outline">Agendar agora →</Btn>
                </div>
              : <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {[...myBookings].sort((a,b)=>a.date>b.date?1:-1).map(b=>(
                    <div key={b.id} style={{borderRadius:16,border:`1px solid ${b.confirmed?"#15803d":"#404040"}`,
                      background:b.confirmed?"#052e16":"#161616",padding:16}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                        <div>
                          <p style={{color:"#737373",fontSize:12,margin:"0 0 4px"}}>{fmtDisplay(b.date)}</p>
                          <p style={{color:"#fff",fontWeight:900,fontSize:28,margin:"0 0 8px"}}>{b.time}</p>
                          {b.confirmed
                            ? <Pill color="green">✓ Confirmado pelo professor</Pill>
                            : <Pill color="yellow">⏳ Aguardando confirmação</Pill>
                          }
                        </div>
                        {!isPast(b.date)&&(
                          <Btn variant="danger" size="sm" onClick={()=>handleCancel(b.id)}>🗑 Cancelar</Btn>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
            }
          </>
        )}
      </div>
    </div>
  );
}

// ─── ADMIN APP ────────────────────────────────────────────────────────────────
function AdminApp({ config, setConfig, bookings, setBookings, students, notifications, setNotifications, onLogout }) {
  const [tab, setTab] = useState("calendar");
  const [year, setYear] = useState(TODAY.getFullYear());
  const [month, setMonth] = useState(TODAY.getMonth());
  const [selected, setSelected] = useState(null);
  const unread = notifications.filter(n=>!n.read).length;

  const getDot = ds => {
    if(isPast(ds)) return null;
    if(config.blockedDates.includes(ds)) return "#525252";
    if(bookings.some(b=>b.date===ds)) return "#dc2626";
    const slots = getSlots(ds, config, []);
    return slots.length>0 ? "#404040" : null;
  };

  const toggleBlockDate = async ds => {
    const newBlocked = config.blockedDates.includes(ds)
      ? config.blockedDates.filter(d=>d!==ds)
      : [...config.blockedDates, ds];
    const updated = {...config, blockedDates:newBlocked};
    await setDoc(doc(db,"config","main"), updated);
    setConfig(updated);
  };

  const toggleBlockSlot = async key => {
    const newBlocked = config.blockedSlots.includes(key)
      ? config.blockedSlots.filter(s=>s!==key)
      : [...config.blockedSlots, key];
    const updated = {...config, blockedSlots:newBlocked};
    await setDoc(doc(db,"config","main"), updated);
    setConfig(updated);
  };

  const confirmBooking = async id => {
    await updateDoc(doc(db,"bookings",id), {confirmed:true});
  };

  const removeBooking = async id => {
    await deleteDoc(doc(db,"bookings",id));
  };

  const markAllRead = async () => {
    for(const n of notifications.filter(x=>!x.read)){
      await updateDoc(doc(db,"notifications",n.id), {read:true});
    }
  };

  const selectedSlots = selected ? getSlots(selected, config, bookings) : [];
  const selectedBookings = selected ? bookings.filter(b=>b.date===selected) : [];

  const prevM = () => { if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); setSelected(null); };
  const nextM = () => { if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); setSelected(null); };

  const card = children => <div style={{background:"#161616",border:"1px solid #262626",borderRadius:16,padding:16,marginBottom:12}}>{children}</div>;

  const tabBtn = (id,label) => (
    <button key={id} onClick={()=>setTab(id)} style={{flex:1,display:"flex",alignItems:"center",
      justifyContent:"center",gap:4,padding:"10px 4px",borderRadius:12,border:"none",fontFamily:"inherit",
      fontSize:12,fontWeight:700,cursor:"pointer",background:tab===id?"#dc2626":"transparent",
      color:tab===id?"#fff":"#737373"}}>
      {label}
    </button>
  );

  return (
    <div style={{minHeight:"100vh",background:"#0e0e0e",maxWidth:430,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"36px 20px 16px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:36,height:36,background:"#1f1f1f",border:"1px solid #404040",borderRadius:10,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🔒</div>
          <div>
            <p style={{color:"#525252",fontSize:11,margin:0}}>Painel do</p>
            <p style={{color:"#fff",fontSize:16,fontWeight:900,margin:0}}>Professor</p>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={markAllRead} style={{position:"relative",width:38,height:38,borderRadius:12,
            background:"#1f1f1f",border:"1px solid #404040",cursor:"pointer",fontSize:16}}>
            🔔
            {unread>0&&<span style={{position:"absolute",top:-4,right:-4,width:16,height:16,
              background:"#dc2626",borderRadius:8,fontSize:9,fontWeight:900,color:"#fff",
              display:"flex",alignItems:"center",justifyContent:"center"}}>{unread}</span>}
          </button>
          <button onClick={onLogout} style={{width:38,height:38,borderRadius:12,background:"#1f1f1f",
            border:"1px solid #404040",cursor:"pointer",fontSize:16}}>↩</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,margin:"0 20px 20px",background:"#111",borderRadius:16,padding:4,border:"1px solid #262626"}}>
        {tabBtn("calendar","📅 Calendário")}
        {tabBtn("students","👥 Alunos")}
        {tabBtn("config","⚙️ Configurar")}
      </div>

      <div style={{padding:"0 20px 40px"}}>

        {/* ── CALENDAR ── */}
        {tab==="calendar"&&(
          <>
            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
              {[
                {label:"Hoje",value:bookings.filter(b=>b.date===fmt(TODAY)).length,color:"#fbbf24"},
                {label:"Esta semana",value:bookings.filter(b=>{const d=parseDate(b.date);return d>=TODAY&&d<addDays(TODAY,7);}).length,color:"#f87171"},
                {label:"Alunos",value:students.length,color:"#60a5fa"},
              ].map(s=>(
                <div key={s.label} style={{background:"#161616",border:"1px solid #262626",borderRadius:14,padding:"12px 8px",textAlign:"center"}}>
                  <p style={{color:s.color,fontSize:24,fontWeight:900,margin:0}}>{s.value}</p>
                  <p style={{color:"#525252",fontSize:11,margin:0}}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* Calendar */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <button onClick={prevM} style={{width:36,height:36,borderRadius:10,background:"#1f1f1f",border:"1px solid #404040",color:"#d4d4d4",cursor:"pointer",fontSize:16}}>‹</button>
              <span style={{color:"#fff",fontWeight:700,fontSize:15}}>{MONTHS_PT[month]} {year}</span>
              <button onClick={nextM} style={{width:36,height:36,borderRadius:10,background:"#1f1f1f",border:"1px solid #404040",color:"#d4d4d4",cursor:"pointer",fontSize:16}}>›</button>
            </div>

            {card(<CalendarGrid year={year} month={month} onDateClick={setSelected} getDot={getDot} selected={selected}/>)}

            {selected&&(
              <>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"16px 0 12px"}}>
                  <h3 style={{color:"#fff",fontWeight:700,fontSize:15,margin:0}}>{fmtDisplay(selected)}</h3>
                  <Btn variant={config.blockedDates.includes(selected)?"ghost":"danger"} size="sm"
                    onClick={()=>toggleBlockDate(selected)}>
                    {config.blockedDates.includes(selected)?"🔓 Desbloquear dia":"🔒 Bloquear dia"}
                  </Btn>
                </div>

                {config.blockedDates.includes(selected)
                  ? card(<div style={{textAlign:"center",padding:"16px 0"}}><p style={{color:"#525252",fontSize:14}}>Dia bloqueado. Sem agendamentos possíveis.</p></div>)
                  : selectedSlots.length===0
                    ? card(<p style={{color:"#525252",fontSize:14,margin:0}}>Sem horários configurados para este dia.</p>)
                    : selectedSlots.map(slot=>{
                        const slotBs = selectedBookings.filter(b=>b.time===slot.time);
                        const blocked = config.blockedSlots.includes(slot.key);
                        return (
                          <div key={slot.key} style={{borderRadius:16,border:`1px solid ${slotBs.length>0?"#7f1d1d":"#262626"}`,
                            background:slotBs.length>0?"#1c0a0a":"#161616",padding:14,marginBottom:8,opacity:blocked?.6:1}}>
                            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:slotBs.length>0?10:0}}>
                              <div style={{display:"flex",alignItems:"center",gap:8}}>
                                <span style={{color:"#fff",fontWeight:900,fontSize:18}}>{slot.time}</span>
                                {blocked&&<Pill color="gray">🔒</Pill>}
                                {!blocked&&slotBs.length>0&&<Pill color="red">👥 {slotBs.length}/{slot.max}</Pill>}
                                {!blocked&&slotBs.length===0&&<Pill color="gray">Livre</Pill>}
                              </div>
                              <button onClick={()=>toggleBlockSlot(slot.key)} style={{width:32,height:32,borderRadius:8,
                                background:"#1f1f1f",border:"1px solid #404040",cursor:"pointer",fontSize:14}}>
                                {blocked?"🔓":"🔒"}
                              </button>
                            </div>
                            {slotBs.map(b=>{
                              return (
                                <div key={b.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                                  background:"#0a0a0a",borderRadius:12,padding:"10px 12px",marginTop:6}}>
                                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                                    <div style={{width:30,height:30,borderRadius:15,background:b.confirmed?"#14532d":"#422006",
                                      display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,
                                      color:b.confirmed?"#86efac":"#fcd34d"}}>{b.studentName?.[0]}</div>
                                    <div>
                                      <p style={{color:"#fff",fontSize:13,fontWeight:700,margin:0}}>{b.studentName}</p>
                                      <p style={{color:"#525252",fontSize:11,margin:0}}>{b.studentPhone}</p>
                                    </div>
                                  </div>
                                  <div style={{display:"flex",gap:6}}>
                                    {!b.confirmed&&(
                                      <button onClick={()=>confirmBooking(b.id)} style={{width:30,height:30,borderRadius:8,
                                        background:"#14532d",border:"none",cursor:"pointer",fontSize:14}}>✓</button>
                                    )}
                                    <button onClick={()=>removeBooking(b.id)} style={{width:30,height:30,borderRadius:8,
                                      background:"#450a0a",border:"none",cursor:"pointer",fontSize:14}}>🗑</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })
                }

                {/* Notificações */}
                {notifications.length>0&&(
                  <div style={{marginTop:20}}>
                    <p style={{color:"#525252",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Avisos</p>
                    {notifications.slice(0,5).map(n=>(
                      <div key={n.id} style={{display:"flex",gap:8,padding:"10px 0",
                        borderBottom:"1px solid #1f1f1f",opacity:n.read?.5:1}}>
                        <span style={{color:n.read?"#525252":"#f87171",fontSize:14,flexShrink:0}}>🔔</span>
                        <p style={{color:"#d4d4d4",fontSize:12,margin:0}}>{n.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {!selected&&<div style={{textAlign:"center",padding:"40px 0"}}>
              <p style={{color:"#404040",fontSize:32,marginBottom:8}}>📅</p>
              <p style={{color:"#525252",fontSize:14}}>Selecione um dia para gerenciar</p>
            </div>}
          </>
        )}

        {/* ── STUDENTS ── */}
        {tab==="students"&&(
          <>
            <h2 style={{color:"#fff",fontWeight:900,fontSize:22,marginBottom:20}}>Alunos Cadastrados</h2>
            {students.length===0
              ? <div style={{textAlign:"center",padding:"48px 0"}}>
                  <p style={{color:"#404040",fontSize:36,marginBottom:8}}>👥</p>
                  <p style={{color:"#525252",fontSize:14}}>Nenhum aluno cadastrado ainda.</p>
                </div>
              : students.map(st=>{
                  const stBs = bookings.filter(b=>b.studentId===st.id);
                  const upcoming = stBs.filter(b=>!isPast(b.date)).length;
                  return (
                    <div key={st.id} style={{background:"#161616",border:"1px solid #262626",borderRadius:16,padding:16,marginBottom:12}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:stBs.length>0?12:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:12}}>
                          <div style={{width:44,height:44,borderRadius:14,background:"#1c0a0a",border:"1px solid #7f1d1d",
                            display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:900,color:"#f87171"}}>
                            {st.name[0]}
                          </div>
                          <div>
                            <p style={{color:"#fff",fontWeight:700,fontSize:15,margin:0}}>{st.name}</p>
                            <p style={{color:"#525252",fontSize:12,margin:0}}>{st.phone}</p>
                            <p style={{color:"#404040",fontSize:11,margin:0}}>
                              {st.dob?new Date(st.dob+"T12:00:00").toLocaleDateString("pt-BR"):"—"}
                            </p>
                          </div>
                        </div>
                        {upcoming>0&&<Pill color="red">📅 {upcoming} aula{upcoming>1?"s":""}</Pill>}
                      </div>
                      {stBs.length>0&&(
                        <div style={{borderTop:"1px solid #262626",paddingTop:10}}>
                          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                            {[...stBs].sort((a,b)=>a.date>b.date?1:-1).slice(0,3).map(b=>(
                              <span key={b.id} style={{fontSize:11,padding:"4px 8px",borderRadius:8,fontWeight:600,
                                background:b.confirmed?"#052e16":"#1c1207",
                                color:b.confirmed?"#86efac":"#fcd34d",
                                border:`1px solid ${b.confirmed?"#15803d":"#92400e"}`}}>
                                {fmtDisplay(b.date)} {b.time}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
            }
          </>
        )}

        {/* ── CONFIG ── */}
        {tab==="config"&&<AdminConfig config={config} setConfig={setConfig}/>}
      </div>
    </div>
  );
}

function AdminConfig({ config, setConfig }) {
  const [saved, setSaved] = useState(false);
  const [localConfig, setLocalConfig] = useState(config);

  const save = async () => {
    await setDoc(doc(db,"config","main"), localConfig);
    setConfig(localConfig);
    setSaved(true);
    setTimeout(()=>setSaved(false), 2000);
  };

  const toggleDay = dow => {
    setLocalConfig(c=>({...c,
      activeDays: c.activeDays.includes(dow)?c.activeDays.filter(d=>d!==dow):[...c.activeDays,dow].sort()
    }));
  };

  const updateTimes = (dow, val) => {
    const times = val.split(",").map(t=>t.trim()).filter(t=>/^\d{2}:\d{2}$/.test(t));
    setLocalConfig(c=>({...c, defaultTimes:{...c.defaultTimes,[dow]:times}}));
  };

  return (
    <>
      <h2 style={{color:"#fff",fontWeight:900,fontSize:22,marginBottom:4}}>Configurações</h2>
      <p style={{color:"#737373",fontSize:13,marginBottom:20}}>Defina seus dias e horários padrão.</p>

      {/* Vagas */}
      <div style={{background:"#161616",border:"1px solid #262626",borderRadius:16,padding:16,marginBottom:12}}>
        <p style={{color:"#fff",fontWeight:700,margin:"0 0 4px"}}>Vagas por horário</p>
        <p style={{color:"#525252",fontSize:12,margin:"0 0 12px"}}>1 = personal | 5+ = turma</p>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>setLocalConfig(c=>({...c,maxStudentsPerSlot:Math.max(1,c.maxStudentsPerSlot-1)}))}
            style={{width:36,height:36,borderRadius:10,background:"#1f1f1f",border:"1px solid #404040",color:"#d4d4d4",cursor:"pointer",fontSize:18}}>−</button>
          <span style={{color:"#fff",fontWeight:900,fontSize:24,minWidth:28,textAlign:"center"}}>{localConfig.maxStudentsPerSlot}</span>
          <button onClick={()=>setLocalConfig(c=>({...c,maxStudentsPerSlot:Math.min(20,c.maxStudentsPerSlot+1)}))}
            style={{width:36,height:36,borderRadius:10,background:"#1f1f1f",border:"1px solid #404040",color:"#d4d4d4",cursor:"pointer",fontSize:18}}>+</button>
        </div>
      </div>

      {/* Dias e horários */}
      <div style={{background:"#161616",border:"1px solid #262626",borderRadius:16,padding:16,marginBottom:12}}>
        <p style={{color:"#fff",fontWeight:700,margin:"0 0 4px"}}>Dias e horários</p>
        <p style={{color:"#525252",fontSize:12,margin:"0 0 16px"}}>Ative os dias e edite os horários separados por vírgula. Ex: 07:00, 18:00</p>
        {[1,2,3,4,5,6,0].map(dow=>{
          const active = localConfig.activeDays.includes(dow);
          const times = (localConfig.defaultTimes[dow]||[]).join(", ");
          return (
            <div key={dow} style={{borderRadius:12,border:`1px solid ${active?"#7f1d1d":"#262626"}`,
              background:active?"#1c0a0a":"transparent",padding:12,marginBottom:8,opacity:active?1:.5}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:active?10:0}}>
                <span style={{color:"#fff",fontWeight:700,fontSize:14}}>{DAYS_FULL[dow]}</span>
                <button onClick={()=>toggleDay(dow)} style={{width:44,height:24,borderRadius:12,
                  background:active?"#dc2626":"#404040",border:"none",cursor:"pointer",position:"relative",transition:"background .2s"}}>
                  <span style={{position:"absolute",top:3,left:active?20:3,width:18,height:18,
                    borderRadius:9,background:"#fff",transition:"left .2s"}}/>
                </button>
              </div>
              {active&&(
                <input defaultValue={times} onBlur={e=>updateTimes(dow,e.target.value)}
                  style={{width:"100%",background:"#0a0a0a",border:"1px solid #404040",borderRadius:8,
                    padding:"8px 10px",color:"#d4d4d4",fontSize:12,fontFamily:"monospace",
                    outline:"none",boxSizing:"border-box"}}
                  placeholder="07:00, 08:00, 18:00"/>
              )}
            </div>
          );
        })}
      </div>

      <Btn onClick={save} size="lg" full variant={saved?"success":"primary"}>
        {saved?"✓ Salvo!":"Salvar configurações"}
      </Btn>

      <div style={{background:"#161616",border:"1px solid #262626",borderRadius:16,padding:16,marginTop:12}}>
        <p style={{color:"#fbbf24",fontSize:12,fontWeight:700,margin:"0 0 6px"}}>💡 Dica</p>
        <p style={{color:"#737373",fontSize:12,lineHeight:1.6,margin:0}}>
          Para bloquear um dia específico (feriado, compromisso), vá em <strong style={{color:"#d4d4d4"}}>Calendário</strong>, selecione o dia e clique em <strong style={{color:"#d4d4d4"}}>Bloquear dia</strong>. Para bloquear só um horário, use o 🔒 dentro do slot.
        </p>
      </div>
    </>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("welcome");
  const [currentStudent, setCurrentStudent] = useState(null);
  const [students, setStudents] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  // Realtime listeners
  useEffect(() => {
    const unsubs = [];

    unsubs.push(onSnapshot(collection(db,"students"), snap => {
      setStudents(snap.docs.map(d=>({id:d.id,...d.data()})));
    }));

    unsubs.push(onSnapshot(collection(db,"bookings"), snap => {
      setBookings(snap.docs.map(d=>({id:d.id,...d.data()})));
    }));

    unsubs.push(onSnapshot(doc(db,"config","main"), snap => {
      if(snap.exists()) setConfig({...DEFAULT_CONFIG,...snap.data()});
      setLoading(false);
    }, () => setLoading(false)));

    unsubs.push(onSnapshot(
      query(collection(db,"notifications"), orderBy("createdAt","desc")),
      snap => setNotifications(snap.docs.map(d=>({id:d.id,...d.data()})))
    ));

    return () => unsubs.forEach(u=>u());
  }, []);

  if(loading) return (
    <div style={{minHeight:"100vh",background:"#0e0e0e",display:"flex",alignItems:"center",
      justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{fontSize:48}}>🥊</div>
      <p style={{color:"#525252",fontSize:14}}>Carregando...</p>
    </div>
  );

  return (
    <>
      {screen==="welcome"&&<WelcomeScreen onStudent={()=>setScreen("student-auth")} onAdmin={()=>setScreen("admin-login")}/>}
      {screen==="student-auth"&&<StudentAuthScreen onBack={()=>setScreen("welcome")} onEnter={s=>{setCurrentStudent(s);setScreen("student");}} students={students}/>}
      {screen==="admin-login"&&<AdminLoginScreen onBack={()=>setScreen("welcome")} onLogin={()=>setScreen("admin")}/>}
      {screen==="student"&&currentStudent&&(
        <StudentApp student={currentStudent} config={config} bookings={bookings}
          onBook={b=>setBookings(prev=>[...prev,b])} onCancel={id=>setBookings(prev=>prev.filter(b=>b.id!==id))}
          onLogout={()=>{setCurrentStudent(null);setScreen("welcome");}}
          notifications={notifications}
          onAddNotification={()=>{}}
        />
      )}
      {screen==="admin"&&(
        <AdminApp config={config} setConfig={setConfig} bookings={bookings} setBookings={setBookings}
          students={students} notifications={notifications} setNotifications={setNotifications}
          onLogout={()=>setScreen("welcome")}
        />
      )}
    </>
  );
}
