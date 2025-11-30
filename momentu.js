/* momentu.js
   Realistic canvas animations for objects (procedural sprites).
   - Multi-object
   - Each object has mass & velocity
   - Animations:
     • dog & walking person: walking gait (legs)
     • ball: rolling (rotation)
     • car/motorcycle/bicycle: body with rotating wheels
     • rocket: flame & tilt
     • airplane: steady flight tilt
   - Auto-reveal after REVEAL_MS
*/

// ---------- Config: object types (your requested set) ----------
const OBJECT_TYPES = [
  { key: 'car', label: 'Car', emoji: '🚗', defaultMass: 1200, scale: 1.0, kind: 'vehicle' },
  { key: 'motorcycle', label: 'Motorcycle', emoji: '🛵', defaultMass: 200, scale: 0.8, kind: 'vehicle' },
  { key: 'bicycle', label: 'Bicycle', emoji: '🚲', defaultMass: 15, scale: 0.7, kind: 'vehicle' },
  { key: 'ball', label: 'Ball', emoji: '⚽', defaultMass: 0.45, scale: 0.5, kind: 'ball' },
  { key: 'rocket', label: 'Rocket', emoji: '🚀', defaultMass: 20000, scale: 1.0, kind: 'rocket' },
  { key: 'dog', label: 'Dog', emoji: '🐶', defaultMass: 18, scale: 0.6, kind: 'walker' },
  { key: 'walker', label: 'Walking Person', emoji: '🚶', defaultMass: 70, scale: 0.8, kind: 'walker' },
  { key: 'airplane', label: 'Airplane', emoji: '✈️', defaultMass: 40000, scale: 1.6, kind: 'aircraft' }
];

// ---------- DOM ----------
const objSelect = document.getElementById('objSelect');
const addObjBtn = document.getElementById('addObjBtn');
const instancesList = document.getElementById('instancesList');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const revealBtn = document.getElementById('revealBtn');
const answersArea = document.getElementById('answersArea');

const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

// ---------- State ----------
let instances = []; // {id,typeKey,label,mass,vel,x,y,dir,color,scale,angle,legPhase}
let nextId = 1;
let animId = null;
let revealTimeout = null;
const REVEAL_MS = 30000; // 30 seconds

// ---------- Utilities ----------
function findType(key){ return OBJECT_TYPES.find(o => o.key === key); }
function randColor(idx){
  const palette = ['#ef4444','#0891b2','#6366f1','#f97316','#10b981','#7c3aed','#f59e0b','#0ea5a4'];
  return palette[idx % palette.length];
}

// ---------- Populate select ----------
OBJECT_TYPES.forEach(o=>{
  const opt = document.createElement('option');
  opt.value = o.key;
  opt.textContent = `${o.emoji} ${o.label}`;
  objSelect.appendChild(opt);
});

// ---------- Instance UI ----------
function createInstancePanel(inst){
  const wrap = document.createElement('div');
  wrap.className = 'instance';
  wrap.id = `inst-${inst.id}`;

  const left = document.createElement('div');
  left.className = 'left';
  left.innerHTML = `<div><strong style="font-size:15px">${inst.emoji} ${inst.label}</strong> <span class="muted" style="margin-left:6px;font-size:13px">#${inst.id}</span></div>`;

  const sliders = document.createElement('div');
  sliders.className = 'sliders';

  const massLabel = document.createElement('label');
  massLabel.textContent = 'Mass (kg):';
  massLabel.style.marginRight = '6px';
  const massNum = document.createElement('input');
  massNum.type = 'number';
  massNum.step = 'any';
  massNum.min = 0;
  massNum.value = inst.mass;
  massNum.style.width = '90px';

  const velLabel = document.createElement('label');
  velLabel.textContent = 'Velocity (m/s):';
  velLabel.style.marginLeft = '8px';
  velLabel.style.marginRight = '6px';
  const velNum = document.createElement('input');
  velNum.type = 'number';
  velNum.step = '0.1';
  velNum.min = 0;
  velNum.value = inst.vel;
  velNum.style.width = '80px';

  sliders.appendChild(massLabel); sliders.appendChild(massNum);
  sliders.appendChild(velLabel); sliders.appendChild(velNum);
  left.appendChild(sliders);

  // --- QUIZ INPUT ---
  const quizDiv = document.createElement('div');
  quizDiv.style.marginTop = '6px';
  quizDiv.innerHTML = `
    <label class="small muted">Your Momentum:</label>
    <input type="number" class="quizInput" id="quiz-${inst.id}" placeholder="Enter momentum">
    <span id="quiz-feedback-${inst.id}"></span>
  `;
  left.appendChild(quizDiv);

  const right = document.createElement('div');
  right.style.textAlign = 'right';
  right.innerHTML = `<div style="font-size:13px" class="small muted">Momentum: <span id="p-${inst.id}">—</span></div>`;

  const removeBtn = document.createElement('button');
  removeBtn.textContent = 'Remove';
  removeBtn.className = 'removeBtn';
  removeBtn.style.marginTop = '8px';
  removeBtn.onclick = ()=> removeInstance(inst.id);

  right.appendChild(removeBtn);
  wrap.appendChild(left);
  wrap.appendChild(right);
  instancesList.appendChild(wrap);

  massNum.oninput = ()=>{ inst.mass = parseFloat(massNum.value) || 0; updateMomentumDisplay(inst); };
  velNum.oninput = ()=>{ inst.vel = parseFloat(velNum.value) || 0; updateMomentumDisplay(inst); };

  updateMomentumDisplay(inst);
}


function updateMomentumDisplay(inst){
  const pSpan = document.getElementById(`p-${inst.id}`);
  if(!pSpan) return;
  const quizMode = document.getElementById('quizToggle').checked;
  if(quizMode){
    // hide momentum in quiz mode
    pSpan.textContent = '—';
  } else {
    const p = inst.mass * inst.vel;
    pSpan.textContent = isFinite(p) ? p.toLocaleString(undefined,{maximumFractionDigits:2}) : '—';
  }
}
document.getElementById('quizToggle').addEventListener('change', ()=>{
  instances.forEach(inst => updateMomentumDisplay(inst));
});


// ---------- Add / Remove ----------
function addInstance(typeKey){
  const t = findType(typeKey);
  if(!t) return;
  const id = nextId++;
  const inst = {
    id,
    typeKey,
    label: t.label,
    emoji: t.emoji,
    mass: t.defaultMass,
    vel: Math.max(0.5, Math.round((t.defaultMass/100) * 0.2)), // starting vel
    x: Math.random() * (canvas.width * 0.2) + 20,
    y: canvas.height * 0.5,
    dir: 1, // 1 = right, -1 = left
    color: randColor(id),
    scale: t.scale,
    angle: 0,
    legPhase: Math.random()*Math.PI*2,
    type: t.kind
  };
  instances.push(inst);
  createInstancePanel(inst);
  layoutInstances();
  drawOnce();
}

function removeInstance(id){
  instances = instances.filter(i=>i.id !== id);
  const el = document.getElementById(`inst-${id}`);
  if(el) el.remove();
  drawOnce();
}

// ---------- Layout ----------
function layoutInstances(){
  const paddingTop = 60;    // top margin
  const paddingBottom = 60; // bottom margin
  const laneHeight = (canvas.height - paddingTop - paddingBottom) / instances.length;

  instances.forEach((inst, idx) => {
    // place each instance in its own lane
    inst.y = paddingTop + laneHeight * idx + laneHeight / 2;
    // optionally, reset x to left side
    inst.x = 40; // starting x position for all
  });
}


// ---------- Draw helpers (procedural sprites) ----------

function drawCar(inst, x, y){
  const s = 1.0 * inst.scale;
  ctx.save();
  ctx.translate(x, y);
  if(inst.dir < 0) ctx.scale(-1,1);
  // body
  ctx.fillStyle = inst.color;
  ctx.beginPath();
  ctx.roundRect(-40*s, -14*s, 80*s, 28*s, 6*s);
  ctx.fill();
  // top cabin
  ctx.fillStyle = shade(inst.color, -10);
  ctx.beginPath();
  ctx.roundRect(-20*s, -26*s, 40*s, 18*s, 4*s);
  ctx.fill();
  // wheels
  drawWheel(-22*s, 16*s, 10*s, inst.angle);
  drawWheel(22*s, 16*s, 10*s, inst.angle);
  ctx.restore();
}

function drawMotorcycle(inst, x, y){
  const s = 0.9 * inst.scale;
  ctx.save();
  ctx.translate(x,y);
  if(inst.dir<0) ctx.scale(-1,1);

  // wheels
  drawWheel(-26*s, 14*s, 10*s, inst.angle);
  drawWheel(26*s, 14*s, 10*s, inst.angle);

  // frame bar
  ctx.strokeStyle = inst.color;
  ctx.lineWidth = 4*s;
  ctx.beginPath();
  ctx.moveTo(-20*s, 10*s);
  ctx.lineTo(18*s, 4*s);
  ctx.stroke();

  // seat
  ctx.fillStyle = "#333";
  ctx.fillRect(-5*s, -6*s, 18*s, 8*s);

  // fuel tank
  ctx.fillStyle = inst.color;
  ctx.beginPath();
  ctx.ellipse(0, -4*s, 14*s, 8*s, 0, 0, Math.PI*2);
  ctx.fill();

  // handlebar
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 3*s;
  ctx.beginPath();
  ctx.moveTo(18*s, 4*s);
  ctx.lineTo(28*s, -6*s);
  ctx.stroke();

  ctx.restore();
}


function drawBicycle(inst, x, y){
  const s = 0.8 * inst.scale;
  ctx.save();
  ctx.translate(x, y);
  if(inst.dir < 0) ctx.scale(-1, 1);

  // WHEELS
  drawWheel(-30*s, 12*s, 12*s, inst.angle);
  drawWheel( 30*s, 12*s, 12*s, inst.angle);

  ctx.strokeStyle = inst.color;
  ctx.lineWidth = 3*s;
  ctx.lineCap = "round";

  // FRAME
  ctx.beginPath();
  // bottom tube
  ctx.moveTo(-30*s, 12*s);
  ctx.lineTo(5*s, 12*s);

  // seat tube
  ctx.lineTo(0*s, -12*s);

  // top tube
  ctx.lineTo(-10*s, -12*s);

  // back to back wheel
  ctx.lineTo(-30*s, 12*s);
  ctx.stroke();

  // front tube to front wheel
  ctx.beginPath();
  ctx.moveTo(5*s, 12*s);      // front wheel top anchor
  ctx.lineTo(30*s, 12*s);     // front wheel center
  ctx.stroke();

  // HANDLEBAR
  ctx.beginPath();
  ctx.moveTo(5*s, 12*s);      // base
  ctx.lineTo(10*s, -18*s);    // upward stick
  ctx.lineTo(0*s, -18*s);     // handle left
  ctx.lineTo(20*s, -18*s);    // handle right
  ctx.stroke();

  // SEAT
  ctx.beginPath();
  ctx.moveTo(-5*s, -12*s);
  ctx.lineTo(10*s, -12*s);
  ctx.stroke();

  ctx.restore();
}



function drawBall(inst, x, y){
  const s = 0.6 * inst.scale;
  ctx.save();
  ctx.translate(x,y);
  // rotate to simulate rolling using angle
  ctx.rotate(inst.angle);
  // ball body
  ctx.beginPath(); ctx.arc(0,0,14*s,0,Math.PI*2); ctx.fillStyle = '#fef3c7'; ctx.fill();
  // simple pattern
  ctx.strokeStyle = '#111827';
  ctx.beginPath(); ctx.moveTo(-8*s,-8*s); ctx.lineTo(8*s,8*s); ctx.moveTo(-8*s,8*s); ctx.lineTo(8*s,-8*s); ctx.stroke();
  ctx.restore();
}

function drawRocket(inst, x, y){
  const s = 0.9 * inst.scale;
  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(inst.dir<0?Math.PI:0); // flip if facing left
  // body
  ctx.fillStyle = '#e11d48';
  ctx.beginPath(); ctx.moveTo(0,-30*s); ctx.quadraticCurveTo(20*s,-10*s,0,20*s); ctx.quadraticCurveTo(-20*s,-10*s,0,-30*s); ctx.fill();
  // window
  ctx.fillStyle = '#bfdbfe';
  ctx.beginPath(); ctx.arc(0, -4*s, 6*s, 0, Math.PI*2); ctx.fill();
  // flame
  const flame = Math.sin(inst.angle*3)*6 + 12;
  ctx.beginPath();
  ctx.fillStyle = 'orange';
  ctx.moveTo(-6*s,22*s); ctx.quadraticCurveTo(0,22*s+flame,6*s,22*s); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawDog(inst, x, y){
  const s = 0.8 * inst.scale;
  ctx.save();
  ctx.translate(x,y);
  if(inst.dir<0) ctx.scale(-1,1);

  // body
  ctx.fillStyle = "#d19a66";
  ctx.fillRect(-20*s, -12*s, 40*s, 20*s);

  // head
  ctx.beginPath();
  ctx.arc(24*s, -8*s, 10*s, 0, Math.PI*2);
  ctx.fill();

  // ear
  ctx.fillStyle = "#8b5a2b";
  ctx.fillRect(20*s, -16*s, 8*s, 8*s);

  // tail
  ctx.strokeStyle = "#8b5a2b";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-22*s, -10*s);
  ctx.quadraticCurveTo(-30*s, -18*s, -32*s, -10*s);
  ctx.stroke();

  // legs (simple walking)
  const lp = inst.legPhase;
  ctx.strokeStyle = "#5a3d1e";
  ctx.lineWidth = 4;

  const legY = 10*s;

  // front legs
  ctx.beginPath();
  ctx.moveTo(12*s, legY);
  ctx.lineTo(12*s, legY + Math.sin(lp)*6*s);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(4*s, legY);
  ctx.lineTo(4*s, legY + Math.sin(lp+Math.PI)*6*s);
  ctx.stroke();

  // back legs
  ctx.beginPath();
  ctx.moveTo(-8*s, legY);
  ctx.lineTo(-8*s, legY + Math.sin(lp+1)*6*s);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-16*s, legY);
  ctx.lineTo(-16*s, legY + Math.sin(lp+Math.PI+1)*6*s);
  ctx.stroke();

  ctx.restore();
}


function drawWalker(inst, x, y){
  // simple human stick with walking leg swing
  const s = 0.7 * inst.scale;
  ctx.save();
  ctx.translate(x,y);
  if(inst.dir<0) ctx.scale(-1,1);
  // body
  ctx.strokeStyle = '#111827'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0,-18*s); ctx.lineTo(0,-4*s); ctx.stroke(); // torso
  // head
  ctx.beginPath(); ctx.arc(0,-26*s,6*s,0,Math.PI*2); ctx.fillStyle = '#fde68a'; ctx.fill();
  // arms
  ctx.beginPath(); ctx.moveTo(0,-14*s); ctx.lineTo(-8*s,-6*s); ctx.moveTo(0,-14*s); ctx.lineTo(8*s,-6*s); ctx.stroke();
  // legs swinging
  const lp = inst.legPhase;
  ctx.beginPath();
  ctx.moveTo(0,-4*s);
  ctx.lineTo(Math.sin(lp)*6*s, 12*s);
  ctx.moveTo(0,-4*s);
  ctx.lineTo(Math.sin(lp+Math.PI)*6*s, 12*s);
  ctx.stroke();
  ctx.restore();
}

function drawAirplane(inst, x, y){
  const s = 1.1 * inst.scale;
  ctx.save();
  ctx.translate(x,y);
  if(inst.dir<0) ctx.scale(-1,1);

  // fuselage
  ctx.fillStyle = "#60a5fa";
  ctx.beginPath();
  ctx.roundRect(-40*s, -10*s, 80*s, 20*s, 10*s);
  ctx.fill();

  // nose
  ctx.beginPath();
  ctx.ellipse(40*s, 0, 12*s, 10*s, 0, 0, Math.PI*2);
  ctx.fill();

  // wings
  ctx.fillStyle = "#1e3a8a";
  ctx.beginPath();
  ctx.moveTo(-10*s, 0);
  ctx.lineTo(10*s, -18*s);
  ctx.lineTo(30*s, -18*s);
  ctx.lineTo(10*s, 0);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-10*s, 0);
  ctx.lineTo(10*s, 18*s);
  ctx.lineTo(30*s, 18*s);
  ctx.lineTo(10*s, 0);
  ctx.closePath();
  ctx.fill();

  // tail
  ctx.beginPath();
  ctx.moveTo(-40*s, -10*s);
  ctx.lineTo(-54*s, -20*s);
  ctx.lineTo(-40*s, -6*s);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}


// Draw wheel helper
function drawWheel(cx, cy, r, angle){
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.arc(0,0,r,0,Math.PI*2);
  ctx.fillStyle = '#111827'; ctx.fill();
  ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

// small color shading helper
function shade(hex, percent){
  // simplistic shade: convert hex to rgb, change brightness
  const col = hex.replace('#','');
  const r = parseInt(col.substring(0,2),16);
  const g = parseInt(col.substring(2,4),16);
  const b = parseInt(col.substring(4,6),16);
  const f = (n)=> Math.max(0,Math.min(255, Math.round(n*(100+percent)/100)));
  const nr = f(r), ng = f(g), nb = f(b);
  return `rgb(${nr},${ng},${nb})`;
}

// ---------- Draw frame (non-animated snapshot) ----------
function drawOnce(){
  const dpr = window.devicePixelRatio || 1;
  // Clear canvas (work in CSS pixels)
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // sky & ground
  ctx.fillStyle = '#bfe9ff';
  ctx.fillRect(0,0,canvas.width, canvas.height);
  ctx.fillStyle = '#9ae6b4';
  ctx.fillRect(0, canvas.height - 60, canvas.width, 60);

  instances.forEach(inst=>{
    const x = inst.x;
    const y = inst.y;
    // draw based on type
    switch(inst.type){
      case 'vehicle': drawCar(inst,x,y); break;
      case 'ball': drawBall(inst,x,y); break;
      case 'rocket': drawRocket(inst,x,y); break;
      case 'walker': drawDog(inst,x,y); break; // reused for dog and person via inst.subtype
      case 'aircraft': drawAirplane(inst,x,y); break;
      default: drawCar(inst,x,y);
    }
  });
}

// ---------- Animation ----------
function animate(){
  // clear & background
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // background
  ctx.fillStyle = '#bfe9ff';
  ctx.fillRect(0,0,canvas.width, canvas.height);
  // ground
  ctx.fillStyle = '#9ae6b4';
  ctx.fillRect(0, canvas.height - 60, canvas.width, 60);

  const speedFactor = 0.4; // reduces velocities to visual speed
  instances.forEach((inst, idx)=>{
    // update direction and x
    // if vel is 0, keep still but animate legPhase/angle
    const v = inst.vel;
    if(v > 0.001){
      inst.dir = v >= 0 ? 1 : -1;
    }
    inst.x += inst.vel * speedFactor * inst.dir;

    // wrapping: keep objects in view
    if(inst.x > canvas.width + 80) inst.x = -80;
    if(inst.x < -80) inst.x = canvas.width + 80;

    // update animation parameters
    inst.angle += inst.vel * 0.05 * inst.dir; // wheel/roll rotation
    inst.legPhase += 0.12 + Math.abs(inst.vel)*0.005; // leg phase increments faster with speed

    // draw each type using their draw routines
    switch(inst.type){
      case 'vehicle':
        // small tilt for motorcycle/bicycle
        if(inst.typeKey === 'motorcycle') ctx.save();
        drawCar(inst, inst.x, inst.y);
        if(inst.typeKey === 'motorcycle') ctx.restore();
        break;
      case 'ball':
        drawBall(inst, inst.x, inst.y - 10); // slightly off ground
        break;
      case 'rocket':
        // rocket moves slightly upward if velocity high, otherwise along center
        drawRocket(inst, inst.x, inst.y - 30);
        break;
      case 'walker':
        // differentiate dog vs person by label
        if(inst.typeKey === 'dog') drawDog(inst, inst.x, inst.y - 6);
        else drawWalker(inst, inst.x, inst.y - 6);
        break;
      case 'aircraft':
        drawAirplane(inst, inst.x, inst.y - 80);
        break;
      default:
        drawCar(inst, inst.x, inst.y);
    }

    updateMomentumDisplay(inst);
  });

  animId = requestAnimationFrame(animate);
}

// ---------- Reveal answers ----------
function showAllAnswers(){
  if(instances.length === 0){
    answersArea.style.display = 'block';
    answersArea.innerHTML = `<div class="small muted">No objects added.</div>`;
    return;
  }
  let html = '<strong>Correct answers (momentum = mass × velocity):</strong><ul style="margin:8px 0 0 18px">';
  instances.forEach(inst=>{
    const p = inst.mass * inst.vel;
    const pStr = isFinite(p) ? p.toLocaleString(undefined,{maximumFractionDigits:2}) : '—';
    html += `<li>${inst.emoji} <strong>${inst.label} #${inst.id}</strong>: <span style="font-weight:600">${pStr}</span> kg·m/s</li>`;
  });
  html += '</ul>';
  answersArea.style.display = 'block';
  answersArea.innerHTML = html;
}

// ---------- Controls ----------
startBtn.onclick = ()=>{
  if(animId) cancelAnimationFrame(animId);
  if(revealTimeout) clearTimeout(revealTimeout);

  answersArea.style.display = 'none';
  layoutInstances();
  animate();

  const quizMode = document.getElementById('quizToggle').checked;
  if(!quizMode){
    // only auto-show if NOT in quiz mode
    revealTimeout = setTimeout(()=> showAllAnswers(), REVEAL_MS);
  }
};


resetBtn.onclick = ()=>{
  if(animId) cancelAnimationFrame(animId);
  if(revealTimeout) clearTimeout(revealTimeout);
  instances = [];
  nextId = 1;
  instancesList.innerHTML = '';
  answersArea.style.display = 'none';
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawOnce();
};

revealBtn.onclick = ()=>{
  if(revealTimeout) clearTimeout(revealTimeout);
  showAllAnswers();
};

addObjBtn.onclick = ()=>{
  addInstance(objSelect.value);
};

document.getElementById('checkBtn').onclick = ()=>{
  instances.forEach(inst=>{
    const studentInput = parseFloat(document.getElementById(`quiz-${inst.id}`).value);
    const correct = inst.mass * inst.vel;
    const feedbackSpan = document.getElementById(`quiz-feedback-${inst.id}`);

    // show momentum after checking
    const pSpan = document.getElementById(`p-${inst.id}`);
    if(pSpan) pSpan.textContent = isFinite(correct) ? correct.toLocaleString(undefined,{maximumFractionDigits:2}) : '—';

    if(isNaN(studentInput)){
      feedbackSpan.textContent = ' —';
      feedbackSpan.className = '';
    } else if(Math.abs(studentInput - correct) < 0.01){
      feedbackSpan.textContent = ' ✅';
      feedbackSpan.className = 'ok';
    } else {
      feedbackSpan.textContent = ` ❌ (Correct: ${correct.toFixed(2)})`;
      feedbackSpan.className = 'bad';
    }
  });
};


// Optional: clear quiz inputs
document.getElementById('clearQuiz').onclick = ()=>{
  instances.forEach(inst=>{
    const input = document.getElementById(`quiz-${inst.id}`);
    const feedbackSpan = document.getElementById(`quiz-feedback-${inst.id}`);
    if(input) input.value = '';
    if(feedbackSpan) { feedbackSpan.textContent=''; feedbackSpan.className=''; }
  });
};


// ---------- Resize handling (keeps internal canvas pixel size stable) ----------
function resizeCanvas(){
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  // scale back to CSS pixels
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawOnce();
}
window.addEventListener('resize', ()=> { setTimeout(resizeCanvas, 80); });
resizeCanvas();

// ---------- Start with 2 defaults ----------
addInstance('car');
addInstance('bicycle');
