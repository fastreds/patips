// SPA Cursos OBS - UCR
// Vanilla JS (except maphilight uses jQuery per plugin requirements)

const state = {
  courses: [],
  current: { courseId: null, topicId: null, topicData: null },
  askedMarkers: new Set(),
  markerPending: null,
};

// Helpers
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// LocalStorage keys
const LS_PROGRESS_KEY = "ucr_courses_progress_v1";

function getProgress(){
  try { return JSON.parse(localStorage.getItem(LS_PROGRESS_KEY)) || {}; }
  catch { return {}; }
}
function saveProgress(progress){
  localStorage.setItem(LS_PROGRESS_KEY, JSON.stringify(progress));
}

function topicKey(courseId, topicId){ return `${courseId}::${topicId}`; }

function setTopicProgress(courseId, topicId, value){
  const progress = getProgress();
  progress[topicKey(courseId, topicId)] = value;
  saveProgress(progress);
  updateGlobalProgress();
}
function getTopicProgress(courseId, topicId){
  const progress = getProgress();
  return progress[topicKey(courseId, topicId)] || 0;
}

function updateGlobalProgress(){
  // average of all topic progresses
  const progress = getProgress();
  const values = Object.values(progress);
  const avg = values.length ? Math.round(values.reduce((a,b)=>a+b,0)/values.length) : 0;
  $("#globalProgress").textContent = `Avance global: ${avg}%`;
}

// Sidebar toggle
$("#sidebarToggle").addEventListener("click", () => {
  const el = $("#sidebar");
  const bsCollapse = bootstrap.Collapse.getOrCreateInstance(el);
  bsCollapse.toggle();
});

// Reset progress
$("#resetProgressBtn").addEventListener("click", ()=>{
  localStorage.removeItem(LS_PROGRESS_KEY);
  updateGlobalProgress();
  // reset all progress bars
  $$(".topic-item .progress-bar").forEach(pb => { pb.style.width = "0%"; pb.textContent = "0%"; });
});

// Load courses tree
async function loadCourses(){
  const res = await fetch("data/courses.json");
  const json = await res.json();
  state.courses = json.courses;
  renderCourseTree();
  updateGlobalProgress();
}

function renderCourseTree(){
  const container = $("#courseTree");
  container.innerHTML = "";
  state.courses.forEach(course => {
    const header = document.createElement("div");
    header.className = "mt-2 mb-1 text-uppercase text-muted small";
    header.textContent = course.title;

    container.appendChild(header);

    course.topics.forEach(topic => {
      const item = document.createElement("button");
      item.className = "list-group-item list-group-item-action d-flex align-items-center justify-content-between topic-item";
      item.innerHTML = `
        <span class="text-start">${topic.icon ? `<i class="${topic.icon} me-2"></i>` : ""}${topic.title}</span>
        <div class="ms-2 flex-grow-1">
          <div class="progress ms-2 me-1">
            <div class="progress-bar ucr-progress" role="progressbar" style="width: ${getTopicProgress(course.id, topic.id)}%"></div>
          </div>
        </div>
      `;
      item.addEventListener("click", ()=>loadTopic(course.id, topic.id, topic.source));
      container.appendChild(item);
    });
  });
}

async function loadTopic(courseId, topicId, source){
  const res = await fetch(source);
  const data = await res.json();
  state.current = { courseId, topicId, topicData: data };
  state.askedMarkers = new Set();
  $("#topicTitle").textContent = data.title;

  // Video
  const video = $("#videoPlayer");
  $("#videoSource").src = data.video?.src || "";
  video.load();
  $("#videoMarkers").innerHTML = renderMarkers(data.video?.markers || []);

  // Theory
  $("#theoryContent").innerHTML = data.theory?.html || "<p>No hay contenido teórico.</p>";
  initDefinitionTooltips();

  // Images + map
  renderInteractiveImage(data.images || null);

  // QA
  renderQA(data.qa || []);

  // Resources
  renderResources(data.resources || []);

  // Progress bar
  updateTopicProgressBar();

  // Video markers behavior
  setupMarkerQuestions(video, data.video?.markers || []);
}

function renderMarkers(markers){
  if(!markers.length) return "<div class='text-muted small'>Sin marcadores.</div>";
  return `<div class="d-flex flex-wrap gap-2">` + markers.map(m => {
    const mm = Math.floor(m.time/60).toString().padStart(2,"0");
    const ss = Math.floor(m.time%60).toString().padStart(2,"0");
    return `<span class="badge text-bg-warning">${mm}:${ss}</span>`;
  }).join("") + `</div>`;
}

/** Popper.js tooltips for definitions **/
function initDefinitionTooltips(){
  // Clear any existing
  $$(".tooltip-popper").forEach(el => el.remove());

  const terms = $$("[data-def]");
  terms.forEach(term => {
    term.classList.add("text-decoration-dotted", "border-bottom", "border-secondary-subtle");
    let tooltipEl;
    let popperInstance;

    function show(){
      tooltipEl = document.createElement("div");
      tooltipEl.className = "tooltip-popper";
      tooltipEl.textContent = term.getAttribute("data-def");
      const arrow = document.createElement("div");
      arrow.className = "arrow";
      tooltipEl.appendChild(arrow);
      document.body.appendChild(tooltipEl);

      popperInstance = Popper.createPopper(term, tooltipEl, {
        placement: 'top',
        modifiers: [
          { name: 'offset', options: { offset: [0,8] } },
          { name: 'arrow', options: { element: arrow } }
        ]
      });
      tooltipEl.setAttribute("data-show","");
    }
    function hide(){
      tooltipEl?.removeAttribute("data-show");
      popperInstance?.destroy();
      tooltipEl?.remove();
    }
    term.addEventListener("mouseenter", show);
    term.addEventListener("mouseleave", hide);
    term.addEventListener("focus", show);
    term.addEventListener("blur", hide);
    term.addEventListener("touchstart", (e)=>{ e.preventDefault(); show(); setTimeout(hide, 1500); }, {passive:false});
  });
}

/** Interactive image with maphilight **/
function renderInteractiveImage(images){
  const container = $("#imageContainer");
  container.innerHTML = "";
  if(!images || !images.src){
    container.innerHTML = "<div class='text-muted'>No hay imágenes para este tema.</div>";
    return;
  }
  const imgId = "topicImage";
  const mapId = "topicMap";

  const img = document.createElement("img");
  img.src = images.src;
  img.alt = images.alt || "Imagen del tema";
  img.useMap = `#${mapId}`;
  img.id = imgId;
  img.className = "img-fluid rounded ucr-shadow";

  const map = document.createElement("map");
  map.name = mapId;

  (images.areas || []).forEach(a => {
    const area = document.createElement("area");
    area.shape = a.shape || "rect";
    area.coords = a.coords;
    area.title = a.title;
    area.href = "javascript:void(0)";
    area.dataset.maphilight = JSON.stringify({ strokeColor:'00A3E0', fillColor:'00A3E0', fillOpacity:0.2 });
    area.addEventListener("click", ()=>{
      bootstrap.Toast.getOrCreateInstance(showToast(`${a.title}: ${a.description || ""}`)).show();
      markStepDone("image-"+a.title);
    });
    map.appendChild(area);
  });

  container.appendChild(img);
  container.appendChild(map);

  // initialize plugin after image is in DOM
  setTimeout(()=>{
    try { jQuery(img).maphilight(); } catch(e){ console.warn("maphilight no disponible", e); }
  }, 50);
}

/** Toast helper **/
function showToast(message){
  let toast = document.getElementById("dynamicToast");
  if(!toast){
    const toastWrap = document.createElement("div");
    toastWrap.className = "toast-container position-fixed bottom-0 end-0 p-3";
    toastWrap.innerHTML = `
      <div id="dynamicToast" class="toast align-items-center text-bg-dark border-0" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
          <div class="toast-body"></div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
      </div>`;
    document.body.appendChild(toastWrap);
    toast = document.getElementById("dynamicToast");
  }
  toast.querySelector(".toast-body").textContent = message;
  return toast;
}

/** QA **/
function renderQA(qa){
  const form = $("#qaForm");
  form.innerHTML = "";
  qa.forEach((q, idx)=>{
    const block = document.createElement("div");
    block.className = "card border-0 shadow-sm";
    block.innerHTML = `
      <div class="card-body">
        <p class="mb-2 fw-semibold">${idx+1}. ${q.text}</p>
        ${q.type === "multi" ? q.options.map((op, i)=>`
          <div class="form-check">
            <input class="form-check-input" type="checkbox" name="q${idx}" id="q${idx}op${i}" value="${i}">
            <label class="form-check-label" for="q${idx}op${i}">${op}</label>
          </div>
        `).join("") :
        q.options.map((op, i)=>`
          <div class="form-check">
            <input class="form-check-input" type="radio" name="q${idx}" id="q${idx}op${i}" value="${i}">
            <label class="form-check-label" for="q${idx}op${i}">${op}</label>
          </div>
        `).join("")
        }
      </div>`;
    form.appendChild(block);
  });

  $("#validateQA").onclick = (e)=>{
    e.preventDefault();
    const topic = state.current.topicData;
    const answers = topic.qa || [];
    let correct = 0;
    answers.forEach((q, idx)=>{
      const inputs = $$(`[name="q${idx}"]`);
      let values = [];
      inputs.forEach(inp => { if(inp.checked) values.push(parseInt(inp.value)); });
      const right = q.answer;
      const ok = Array.isArray(right) ? arraysEqualUnordered(values, right) : (values[0] === right);
      if(ok) correct++;
    });
    const percent = answers.length ? Math.round((correct/answers.length)*100) : 0;
    $("#qaResult").innerHTML = `<span class="badge text-bg-${percent===100?'success':percent>=60?'warning':'danger'}">${percent}% correcto</span>`;
    if(percent===100) markStepDone("qa");
  };
}

function arraysEqualUnordered(a,b){
  if(!Array.isArray(a) || !Array.isArray(b)) return false;
  if(a.length!==b.length) return false;
  const sa = [...a].sort(); const sb = [...b].sort();
  return sa.every((v,i)=>v===sb[i]);
}

/** Resources **/
function renderResources(resources){
  const list = $("#resourcesList");
  list.innerHTML = "";
  resources.forEach(r => {
    const li = document.createElement("li");
    li.className = "list-group-item d-flex align-items-center justify-content-between";
    li.innerHTML = `
      <span>${r.type?.toUpperCase() || "ENLACE"}: ${r.title}</span>
      <a class="btn btn-sm btn-outline-primary" href="${r.url}" target="_blank" rel="noopener">Abrir</a>
    `;
    list.appendChild(li);
  });
}

/** Topic progress calculation **/
function updateTopicProgressBar(){
  const data = state.current.topicData;
  if(!data){ return; }
  const steps = [
    ...(data.video?.markers || []).map((m,i)=>`marker-${i}`),
    ...(data.images?.areas || []).map(a=>`image-${a.title}`),
    ...(data.qa?.length ? ["qa"] : []),
    ...(data.theory?.html ? ["theory"] : []),
  ];
  const doneSet = getDoneSet();
  const doneCount = steps.filter(s=>doneSet.has(s)).length;
  const percent = steps.length ? Math.round(100*doneCount/steps.length) : 0;

  const pb = $("#topicProgressBar");
  pb.style.width = percent + "%";
  pb.textContent = percent + "%";

  setTopicProgress(state.current.courseId, state.current.topicId, percent);
  // also update sidebar bar
  const items = $$("#courseTree .topic-item .progress-bar");
  items.forEach((bar)=>{
    // This relies on order but acceptable for demo; could enhance with data attributes.
    // We'll simply refresh tree to reflect values accurately.
  });
  // refresh tree to reflect widths
  renderCourseTree();
}

function getDoneSet(){
  const key = topicKey(state.current.courseId, state.current.topicId);
  const k = `${key}::doneSet`;
  const raw = localStorage.getItem(k);
  const set = new Set(raw ? JSON.parse(raw) : []);
  return set;
}
function saveDoneSet(set){
  const key = topicKey(state.current.courseId, state.current.topicId);
  const k = `${key}::doneSet`;
  localStorage.setItem(k, JSON.stringify([...set]));
}

function markStepDone(step){
  const set = getDoneSet();
  if(!set.has(step)){
    set.add(step);
    saveDoneSet(set);
    updateTopicProgressBar();
  }
}

/** Marker questions **/
function setupMarkerQuestions(video, markers){
  if(!video) return;
  state.markerPending = null;
  const asked = new Set();

  const modalEl = $("#markerModal");
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  const questionEl = $("#markerQuestion");
  const optionsEl = $("#markerOptions");
  const feedbackEl = $("#markerFeedback");
  const submitBtn = $("#markerSubmit");

  video.ontimeupdate = ()=>{
    const t = video.currentTime;
    const next = markers.find((m, idx)=> t >= m.time && !asked.has(idx));
    if(next){
      const idx = markers.indexOf(next);
      asked.add(idx);
      state.markerPending = idx;
      video.pause();
      // populate modal
      feedbackEl.innerHTML = "";
      questionEl.textContent = next.question.text;
      optionsEl.innerHTML = next.question.options.map((op,i)=>`
        <div class="form-check">
          <input class="form-check-input" type="radio" name="markerAnswer" id="markerAnswer${i}" value="${i}">
          <label class="form-check-label" for="markerAnswer${i}">${op}</label>
        </div>
      `).join("");
      modal.show();
    }
  };

  submitBtn.onclick = ()=>{
    const pendingIdx = state.markerPending;
    if(pendingIdx==null) return;
    const marker = markers[pendingIdx];
    const sel = $('input[name="markerAnswer"]:checked');
    if(!sel){
      feedbackEl.innerHTML = `<span class="text-danger">Selecciona una opción.</span>`;
      return;
    }
    const val = parseInt(sel.value);
    if(val === marker.question.answer){
      feedbackEl.innerHTML = `<span class="text-success">¡Correcto!</span>`;
      modal.hide();
      video.play();
      markStepDone(`marker-${pendingIdx}`);
    }else{
      feedbackEl.innerHTML = `<span class="text-danger">Respuesta incorrecta. Intenta nuevamente.</span>`;
    }
  };

  // Mark theory tab as done when visited
  $("#theory-tab").addEventListener("shown.bs.tab", ()=> markStepDone("theory"));
}

// Kickoff
loadCourses();
