// SPA Cursos OBS - UCR - v2 (simplified)
const state = { courses: [], current: { courseId:null, topicId:null, topicData:null, courseIndex:0, topicIndex:0 } };

const $ = (s,r=document)=> r.querySelector(s);
const $$ = (s,r=document)=> Array.from(r.querySelectorAll(s));
const LS = "ucr_courses_progress_v2";

function getProgress(){ try{ return JSON.parse(localStorage.getItem(LS))||{} }catch{ return {} } }
function saveProgress(p){ localStorage.setItem(LS, JSON.stringify(p)); }
function topicKey(c,t){ return `${c}::${t}`; }
function updateGlobalProgress(){ const p=getProgress(); const vals=Object.values(p); const avg= vals.length? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):0; $("#globalProgress").textContent=`Avance global: ${avg}%`; }

$("#sidebarToggle").addEventListener("click", ()=> bootstrap.Collapse.getOrCreateInstance($("#sidebar")).toggle());
$("#creditsBtn").addEventListener("click", ()=> bootstrap.Modal.getOrCreateInstance($("#creditsModal")).show());
$("#resetProgressBtn").addEventListener("click", ()=>{ localStorage.removeItem(LS); Object.keys(localStorage).forEach(k=>{ if(k.includes("::doneSet")||k.includes("::videoAnswers")||k.includes("::preguntas")) localStorage.removeItem(k); }); updateGlobalProgress(); renderCourseTree(); });

async function loadCourses(){ const res=await fetch("data/courses.json"); const json=await res.json(); state.courses=json.courses; renderCourseTree(); updateGlobalProgress(); }

function renderCourseTree(){
  const container = $("#courseTree"); container.innerHTML="";
  state.courses.forEach((course,ci)=>{
    const header=document.createElement("div"); header.className="mt-2 mb-1 text-uppercase text-muted small"; header.textContent=course.title; container.appendChild(header);
    course.topics.forEach((topic,ti)=>{
      const item=document.createElement("button"); item.className="list-group-item list-group-item-action d-flex align-items-center justify-content-between topic-item";
      item.innerHTML = `<span class="text-start">${topic.icon?`<i class="${topic.icon} me-2"></i>`:""}${topic.title}</span>
        <div class="ms-2 flex-grow-1"><div class="progress ms-2 me-1"><div class="progress-bar ucr-progress" style="width:${getTopicProgress(course.id, topic.id)}%"></div></div></div>`;
      item.addEventListener("click", ()=>{ loadTopic(course.id, topic.id, topic.source, ci, ti); if(window.innerWidth<992) bootstrap.Collapse.getOrCreateInstance($("#sidebar")).hide(); });
      container.appendChild(item);
    });
  });
}

function getTopicProgress(c,t){ const p=getProgress(); return p[topicKey(c,t)]||0; }
function setTopicProgress(c,t,v){ const p=getProgress(); p[topicKey(c,t)]=v; saveProgress(p); updateGlobalProgress(); renderCourseTree(); }

async function loadTopic(courseId, topicId, source, courseIndex=0, topicIndex=0){
  const res=await fetch(source); const data=await res.json();
  if(!data.content){
    const content=[]; if(data.theory&&data.theory.html) content.push({type:"theory", html:data.theory.html}); if(data.video) content.push({type:"video", src:data.video.src, markers:data.video.markers||[]}); if(data.images) content.push({type:"image", src:data.images.src, areas:data.images.areas||[]}); data.content=content;
  }
  state.current={courseId,topicId,topicData:data,courseIndex,topicIndex};
  $("#topicTitle").textContent=data.title;
  renderTemaContent(data.content||[]);
  renderPreguntas(data);
  renderResources(data.resources||[]);
  updateTopicProgressBar();
  setupContentVideoMarkers();
}

function renderTemaContent(content){
  const container=$("#temaContent"); container.innerHTML="";
  content.forEach((el,idx)=>{
    const w=document.createElement("div"); w.className="tema-element"; w.dataset.index=idx;
    if(el.type==="theory"){ w.innerHTML=`<h5>Teoría</h5><div class="lh-lg">${el.html}</div>`; }
    else if(el.type==="video"){ w.innerHTML=`<h5>Video</h5><div class="tema-video"><video class="w-100" controls preload="metadata" data-video-index="${idx}"><source src="${el.src}"></video></div>`; if(el.markers) w.querySelector("video").dataset.markers = JSON.stringify(el.markers); }
    else if(el.type==="image"){ w.innerHTML=`<h5>Imagen</h5><div class="text-center"><img src="${el.src}" class="img-fluid rounded ucr-shadow" usemap="#map${idx}"><map name="map${idx}"></map></div>`; setTimeout(()=>{ const map=w.querySelector("map"); (el.areas||[]).forEach(a=>{ const area=document.createElement("area"); area.shape=a.shape||"rect"; area.coords=a.coords; area.href="javascript:void(0)"; area.title=a.title; area.dataset.desc=a.description||""; area.dataset.maphilight=JSON.stringify({strokeColor:'00A3E0',fillColor:'00A3E0',fillOpacity:0.2}); area.addEventListener("click", ()=>{ showToast(`${a.title}: ${a.description||""}`); markStepDone(`image-${a.title}`); }); map.appendChild(area); }); try{ jQuery(w).find("img").maphilight(); }catch(e){} },50); }
    container.appendChild(w);
  });
  initDefinitionTooltips();
  $("#nextTopicBtn").onclick = ()=>{ const c = state.courses[state.current.courseIndex]; const next = c.topics[state.current.topicIndex+1]; if(next) loadTopic(c.id, next.id, next.source, state.current.courseIndex, state.current.topicIndex+1); else showToast("Último tema."); };
}

function initDefinitionTooltips(){ $$("[data-def]").forEach(term=>{ term.classList.add("text-decoration-dotted","border-bottom","border-secondary-subtle"); let tooltip, inst; function show(){ tooltip=document.createElement("div"); tooltip.className="tooltip-popper"; tooltip.textContent=term.getAttribute("data-def"); const arrow=document.createElement("div"); arrow.className="arrow"; tooltip.appendChild(arrow); document.body.appendChild(tooltip); inst = Popper.createPopper(term, tooltip, {placement:'top', modifiers:[{name:'offset',options:{offset:[0,8]}},{name:'arrow',options:{element:arrow}}]}); tooltip.setAttribute("data-show",""); } function hide(){ tooltip?.remove(); inst?.destroy(); } term.addEventListener("mouseenter", show); term.addEventListener("mouseleave", hide); term.addEventListener("touchstart",(e)=>{ e.preventDefault(); show(); setTimeout(hide,1500); }, {passive:false}); }); }

function renderPreguntas(data){
  const form=$("#preguntasForm"); form.innerHTML=""; const preguntas=data.qa||[];
  preguntas.forEach((q,idx)=>{ const card=document.createElement("div"); card.className="card border-0 shadow-sm"; const body=document.createElement("div"); body.className="card-body"; body.innerHTML=`<p class="mb-2 fw-semibold">${idx+1}. ${q.text}</p>`; const opts=document.createElement("div"); if(q.type==="multi"){ q.options.forEach((op,i)=> opts.insertAdjacentHTML('beforeend',`<div class="form-check"><input class="form-check-input" type="checkbox" id="q${idx}op${i}" data-q="${idx}" value="${i}"><label class="form-check-label" for="q${idx}op${i}">${op}</label></div>`)); } else { q.options.forEach((op,i)=> opts.insertAdjacentHTML('beforeend',`<div class="form-check"><input class="form-check-input" type="radio" name="q${idx}" id="q${idx}op${i}" data-q="${idx}" value="${i}"><label class="form-check-label" for="q${idx}op${i}">${op}</label></div>`)); } body.appendChild(opts); const fb=document.createElement("div"); fb.className="mt-2 small"; fb.id=`fb-${idx}`; body.appendChild(fb); card.appendChild(body); form.appendChild(card); });
  loadSavedPreguntas();
  $("#savePreguntasBtn").onclick = (e)=>{ e.preventDefault(); savePreguntas(); };
  $("#showSummaryBtn").onclick = (e)=>{ e.preventDefault(); showResumen(); };
}

function savePreguntas(){
  const data=state.current.topicData; if(!data) return; const preguntas=data.qa||[]; const answers={};
  preguntas.forEach((q,idx)=>{ if(q.type==="multi"){ const checks=Array.from(document.querySelectorAll(`#q${idx}op`)); } if(q.type==="multi"){ const checks = Array.from(document.querySelectorAll(`#q${idx}op0, #q${idx}op1, #q${idx}op2, #q${idx}op3`)).filter(Boolean); } if(q.type==="multi"){ /* generic handling below */ }
    if(q.type==="multi"){ const inputs = Array.from(document.querySelectorAll(`[id^="q${idx}op"]`)); answers[idx] = inputs.filter(i=>i.checked).map(i=>parseInt(i.value)); } else { const sel = document.querySelector(`[name="q${idx}"]:checked`); answers[idx] = sel? parseInt(sel.value) : null; }
    const fb = $(`#fb-${idx}`); const correct = q.answer; const ok = Array.isArray(correct)? arraysEqualUnordered(answers[idx]||[], correct) : (answers[idx]===correct); fb.innerHTML = ok? `<span class="text-success">✔️ Correcto</span>` : `<span class="text-danger">✖️ ${q.explanation||'Incorrecto'}</span>`;
  });
  localStorage.setItem(`${topicKey(state.current.courseId,state.current.topicId)}::preguntas`, JSON.stringify(answers));
  const total=preguntas.length; const correctCount=preguntas.filter((q,idx)=>{ const a=answers[idx]; const corr=q.answer; return Array.isArray(corr)? arraysEqualUnordered(a||[],corr): (a===corr); }).length;
  const percent = total? Math.round(100*correctCount/total):0;
  $("#preguntasResult").innerHTML = `<span class="badge text-bg-${percent===100?'success':percent>=60?'warning':'danger'}">${percent}%</span>`;
  if(percent===100) markStepDone("qa");
  updateTopicProgressBar();
}

function loadSavedPreguntas(){ const raw=localStorage.getItem(`${topicKey(state.current.courseId,state.current.topicId)}::preguntas`); if(!raw) return; const answers=JSON.parse(raw); Object.keys(answers).forEach(k=>{ const val=answers[k]; if(Array.isArray(val)){ val.forEach(v=>{ const el=document.getElementById(`q${k}op${v}`); if(el) el.checked=true; }); } else { const el=document.getElementById(`q${k}op${val}`); if(el) el.checked=true; } }); }

function showResumen(){ const data=state.current.topicData; const preguntas=data.qa||[]; const saved=JSON.parse(localStorage.getItem(`${topicKey(state.current.courseId,state.current.topicId)}::preguntas`)||"{}"); const videoAnswers=JSON.parse(localStorage.getItem(`${topicKey(state.current.courseId,state.current.topicId)}::videoAnswers`)||"{}"); let html=`<h5>Resumen - ${data.title}</h5>`; html+=`<h6>Preguntas</h6>`; preguntas.forEach((q,idx)=>{ html+=`<div class="mb-2"><strong>${idx+1}. ${q.text}</strong><br>`; const s = saved[idx]; if(s==null) html+=`<em>No respondida</em>`; else { const ans = Array.isArray(s)? s : [s]; html+=`Respuesta: ${ans.map(a=>q.options[a]).join(", ")}<br>`; const corr = Array.isArray(q.answer)? q.answer : [q.answer]; const ok = arraysEqualUnordered(ans,corr); html+= ok? `<span class="text-success">Correcto</span>`:`<span class="text-danger">Incorrecto</span>`; } html+=`</div>`; }); html+=`<h6>Respuestas en videos</h6>`; if(Object.keys(videoAnswers).length===0) html+=`<em>No hubo respuestas en videos.</em>`; else { Object.keys(videoAnswers).forEach(k=>{ const v=videoAnswers[k]; html+=`<div class="mb-2"><strong>Video marcador ${k}</strong>: ${v.answerLabel||v.answer}</div>`; }); } $("#videoSummaryContainer").innerHTML = html; }

function updateTopicProgressBar(){ const data=state.current.topicData; if(!data) return; const steps=[]; (data.content||[]).forEach((c,ci)=>{ if(c.type==="video"&&c.markers) c.markers.forEach((m,mi)=> steps.push(`marker-${ci}-${mi}`)); if(c.type==="image"&&c.areas) c.areas.forEach(a=> steps.push(`image-${a.title}`)); if(c.type==="theory") steps.push("theory"); if(data.qa&&data.qa.length) steps.push("qa"); }); const done=getDoneSet(); const doneCount = steps.filter(s=>done.has(s)).length; const percent = steps.length? Math.round(100*doneCount/steps.length):0; const pb=$("#topicProgressBar"); pb.style.width = percent+"%"; pb.textContent = percent+"%"; setTopicProgress(state.current.courseId, state.current.topicId, percent); checkCourseCompletion(); renderCourseTree(); }

function getDoneSet(){ const k=`${topicKey(state.current.courseId,state.current.topicId)}::doneSet`; const raw=localStorage.getItem(k); return new Set(raw?JSON.parse(raw):[]); }
function saveDoneSet(s){ const k=`${topicKey(state.current.courseId,state.current.topicId)}::doneSet`; localStorage.setItem(k, JSON.stringify([...s])); }
function markStepDone(step){ const s=getDoneSet(); if(!s.has(step)){ s.add(step); saveDoneSet(s); updateTopicProgressBar(); } }

function setupContentVideoMarkers(){ const videos=$$("video[data-video-index]"); videos.forEach(videoEl=>{ const newVideo = videoEl.cloneNode(true); videoEl.parentNode.replaceChild(newVideo, videoEl); const idx = parseInt(newVideo.dataset.videoIndex); const markers = newVideo.dataset.markers ? JSON.parse(newVideo.dataset.markers) : []; const asked = new Set(); const modalEl = $("#markerModal"); const modal = bootstrap.Modal.getOrCreateInstance(modalEl); const questionEl = $("#markerQuestion"); const optionsEl = $("#markerOptions"); const feedbackEl = $("#markerFeedback"); const submitBtn = $("#markerSubmit");
    newVideo.ontimeupdate = ()=>{ const t=newVideo.currentTime; const next = markers.find((m,mi)=> t>=m.time && !asked.has(mi)); if(next){ const mi = markers.indexOf(next); asked.add(mi); newVideo.pause(); feedbackEl.innerHTML=""; questionEl.textContent = next.question.text; optionsEl.innerHTML = next.question.options.map((op,i)=>`<div class="form-check"><input class="form-check-input" type="radio" name="markerAnswer" id="markerAnswer${idx}_${i}" value="${i}"><label class="form-check-label" for="markerAnswer${idx}_${i}">${op}</label></div>`).join(""); modal.show(); submitBtn.onclick = ()=>{ const sel = document.querySelector(`input[name="markerAnswer"]:checked`); if(!sel){ feedbackEl.innerHTML = `<span class="text-danger">Selecciona una opción.</span>`; return; } const val = parseInt(sel.value); if(val === next.question.answer){ feedbackEl.innerHTML = `<span class="text-success">¡Correcto!</span>`; modal.hide(); newVideo.play(); const vKey = `${topicKey(state.current.courseId,state.current.topicId)}::videoAnswers`; const raw = JSON.parse(localStorage.getItem(vKey)||"{}"); raw[`${idx}-${mi}`] = { answer: val, answerLabel: next.question.options[val], time: next.time }; localStorage.setItem(vKey, JSON.stringify(raw)); markStepDone(`marker-${idx}-${mi}`); } else { feedbackEl.innerHTML = `<span class="text-danger">Incorrecto. Intenta nuevamente.</span>`; } }; } }; newVideo.onended = ()=> markStepDone(`video-ended-${idx}`); }); }

function arraysEqualUnordered(a,b){ if(!Array.isArray(a)||!Array.isArray(b)) return false; if(a.length!==b.length) return false; const sa=[...a].sort(), sb=[...b].sort(); return sa.every((v,i)=>v===sb[i]); }

function showToast(msg){ let t=document.getElementById("dynamicToast"); if(!t){ const wrap=document.createElement("div"); wrap.className="toast-container position-fixed bottom-0 end-0 p-3"; wrap.innerHTML=`<div id="dynamicToast" class="toast align-items-center text-bg-dark border-0"><div class="d-flex"><div class="toast-body"></div><button class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div></div>`; document.body.appendChild(wrap); t=document.getElementById("dynamicToast"); } t.querySelector(".toast-body").textContent=msg; return bootstrap.Toast.getOrCreateInstance(t); }

function renderResources(resources){ const list=$("#resourcesList"); list.innerHTML=""; (resources||[]).forEach(r=>{ const li=document.createElement("li"); li.className="list-group-item d-flex align-items-center justify-content-between"; li.innerHTML=`<span>${r.type?.toUpperCase()||"ENLACE"}: ${r.title}</span><a class="btn btn-sm btn-outline-primary" href="${r.url}" target="_blank" rel="noopener">Abrir</a>`; list.appendChild(li); }); }

function checkCourseCompletion(){ const c = state.courses[state.current.courseIndex]; if(!c) return; const all = c.topics.map(t=> getTopicProgress(c.id,t.id)===100).every(v=>v===true); if(all && !$("#certButton")){ const btn = document.createElement("button"); btn.id="certButton"; btn.className="btn btn-outline-light btn-sm"; btn.textContent="Generar certificado"; btn.onclick = ()=> bootstrap.Modal.getOrCreateInstance($("#certModal")).show(); document.querySelector(".navbar .container-fluid .ms-auto").appendChild(btn); $("#generateCertBtn").onclick = ()=>{ const name = $("#certName").value.trim() || "Nombre del participante"; const courseTitle = c.title; const now = new Date().toLocaleDateString(); const win = window.open("","_blank","width=800,height=600"); win.document.write(`<html><head><title>Certificado</title><style>body{font-family:Arial;text-align:center;padding:40px} .cert{border:10px solid #003A6F;padding:30px;border-radius:8px} h1{color:#003A6F} .small{font-size:14px;color:#333}</style></head><body><div class="cert"><h1>Certificado de conclusión</h1><p class="small">Se certifica que</p><h2>${name}</h2><p class="small">ha completado el curso</p><h3>${courseTitle}</h3><p class="small">Fecha: ${now}</p></div></body></html>`); win.document.close(); bootstrap.Modal.getOrCreateInstance($("#certModal")).hide(); }; } }

// bootstrap kick
loadCourses();
