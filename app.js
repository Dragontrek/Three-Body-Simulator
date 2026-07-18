// Three-Body Problem Physics Engine and UI Controller

// --- DOM Elements ---
const canvas = document.getElementById('simulation-canvas');
const ctx = canvas.getContext('2d');
const presetSelector = document.getElementById('preset-selector');
const btnReset = document.getElementById('btn-reset');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnPlacementMode = document.getElementById('btn-placement-mode');
const speedSlider = document.getElementById('speed-slider');
const speedValue = document.getElementById('speed-value');
const trailSlider = document.getElementById('trail-slider');
const trailValue = document.getElementById('trail-value');
const showVectorsCheckbox = document.getElementById('show-vectors');
const showGridCheckbox = document.getElementById('show-grid');
const followBodyCheckbox = document.getElementById('follow-body');
const followBodySelect = document.getElementById('follow-body-select');
const enforceMomentumCheckbox = document.getElementById('enforce-momentum');
const softCollisionsCheckbox = document.getElementById('soft-collisions');
const showConservationCheckbox = document.getElementById('show-conservation');
const bodiesContainer = document.getElementById('bodies-container');
const energyHud = document.getElementById('energy-hud');
const btnSnapshot = document.getElementById('btn-snapshot');
const energyGraphCanvas = document.getElementById('energy-graph-canvas');
const snapshotList = document.getElementById('snapshot-list');
const analysisToggle = document.getElementById('analysis-toggle');
const analysisModal = document.getElementById('analysis-modal');
const analysisClose = document.getElementById('analysis-close');
const analysisContent = document.getElementById('analysis-content');
const timeScrubSidebar = document.getElementById('time-scrub-slider-sidebar');
const timeScrubSidebarValue = document.getElementById('time-scrub-value-sidebar');
const btnGoLive = document.getElementById('btn-go-live');

// --- Physics Constants and State ---
const G = 1;
let isPlaying = true;
let simulationSpeed = 1.0;
let baseDt = 0.002;
let maxTrailLength = 200;
let initialEnergy = 0;
let showVectors = false;
let showGrid = true;
let followSelectedBody = false;
let followBodyIndex = 0;
let enforceMomentum = true;
let softCollisions = true;
let showConservation = true;
let placementMode = false;
let placementDrag = null;
let placementWasPlaying = false;
let timeScrubActive = false;
let simulationHistory = [];
const maxSimulationHistory = 2000;

let camera = { x: 0, y: 0, zoom: 150 };
let isDragging = false;
let lastMouse = { x: 0, y: 0 };

const bodyColors = ['#ff4757', '#2ed573', '#1e90ff'];

let state = [];
let masses = [];
let trails = [[], [], []];
let energyHistory = [];
let snapshots = [];
let activeBodies = [true, true, true];
let collisionMessage = '';
const maxEnergyHistoryPoints = 80;
const maxSnapshots = 6;

const presets = {
    figure8: {
        masses: [1, 1, 1],
        state: [
            0.97000436, -0.24308753, -0.466203685, -0.43236573,
            -0.97000436, 0.24308753, -0.466203685, -0.43236573,
            0.0, 0.0, 0.93240737, 0.86473146
        ],
        zoom: 150
    },
    lagrange: {
        masses: [1, 1, 1],
        state: [
            1.0, 0.0, 0.0, 0.5,
            -0.5, 0.866025403, -0.4330127, -0.25,
            -0.5, -0.866025403, 0.4330127, -0.25
        ],
        zoom: 150
    },
    euler: {
        masses: [1, 1, 1],
        state: [
            1.0, 0.0, 0.0, 0.8,
            0.0, 0.0, 0.0, 0.0,
            -1.0, 0.0, 0.0, -0.8
        ],
        zoom: 120
    },
    pythagorean: {
        masses: [3, 4, 5],
        state: [
            1.0, 3.0, 0.0, 0.0,
            -2.0, -1.0, 0.0, 0.0,
            1.0, -1.0, 0.0, 0.0
        ],
        zoom: 40
    },
    random: {
        masses: [1, 1, 1],
        state: [],
        zoom: 80
    }
};

function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    if (typeof energyGraphCanvas !== 'undefined' && energyGraphCanvas && energyGraphCanvas.parentElement) {
        energyGraphCanvas.width = energyGraphCanvas.parentElement.clientWidth;
        energyGraphCanvas.height = 140;
    }
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function buildUI() {
    bodiesContainer.innerHTML = '';
    const template = document.getElementById('body-card-template');

    for (let i = 0; i < 3; i++) {
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.body-card');

        card.querySelector('.body-title').textContent = `Body ${i + 1}`;
        card.querySelector('.color-indicator').style.color = bodyColors[i];
        card.querySelector('.color-indicator').style.backgroundColor = bodyColors[i];

        const massSlider = card.querySelector('.mass-slider');
        const massInput = card.querySelector('.mass-input');
        const massDisplay = card.querySelector('.mass-display');
        const px = card.querySelector('.pos-x');
        const py = card.querySelector('.pos-y');
        const vx = card.querySelector('.vel-x');
        const vy = card.querySelector('.vel-y');

        massSlider.addEventListener('input', (e) => {
            const val = Math.pow(10, parseFloat(e.target.value));
            massInput.value = val.toPrecision(4);
            massDisplay.textContent = formatMass(val);
            updatePhysicsFromUI();
        });

        massInput.addEventListener('change', (e) => {
            const val = parseFloat(e.target.value);
            if (val > 0) {
                massSlider.value = Math.log10(val);
                massDisplay.textContent = formatMass(val);
                updatePhysicsFromUI();
            }
        });

        [px, py, vx, vy].forEach((el) => el.addEventListener('change', updatePhysicsFromUI));

        card.dataset.index = i;
        bodiesContainer.appendChild(card);
    }
}

function formatMass(m) {
    if (m >= 1e6) return (m / 1e6).toFixed(2) + 'M';
    if (m >= 1e3) return (m / 1e3).toFixed(2) + 'k';
    return m.toFixed(2);
}

function isBodyActive(index) {
    return activeBodies[index] && masses[index] > 0;
}

function resetBody(index) {
    activeBodies[index] = false;
    masses[index] = 0;
    state[index * 4 + 0] = 0;
    state[index * 4 + 1] = 0;
    state[index * 4 + 2] = 0;
    state[index * 4 + 3] = 0;
}

function captureSimulationState() {
    return {
        state: [...state],
        masses: [...masses],
        activeBodies: [...activeBodies],
        collisionMessage,
        trails: trails.map((trail) => [...trail])
    };
}

function restoreSimulationState(snapshot) {
    if (!snapshot) return;
    state = [...snapshot.state];
    masses = [...snapshot.masses];
    activeBodies = [...snapshot.activeBodies];
    collisionMessage = snapshot.collisionMessage || '';
    trails = snapshot.trails.map((trail) => [...trail]);
    updateUIToMatchPhysics();
    drawEnergyGraph();
    renderAnalysisPanel();
}

function loadPreset(presetName) {
    presetSelector.value = presetName;
    let config = presets[presetName];

    if (presetName === 'random') {
        config = {
            masses: [Math.random() * 2 + 0.5, Math.random() * 2 + 0.5, Math.random() * 2 + 0.5],
            state: [
                (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5), (Math.random() - 0.5),
                (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5), (Math.random() - 0.5),
                (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5), (Math.random() - 0.5)
            ],
            zoom: 60
        };

        let px = 0;
        let py = 0;
        let M = 0;
        for (let i = 0; i < 3; i++) {
            px += config.masses[i] * config.state[i * 4 + 2];
            py += config.masses[i] * config.state[i * 4 + 3];
            M += config.masses[i];
        }
        config.state[2] -= px / M;
        config.state[3] -= py / M;
        config.state[6] -= px / M;
        config.state[7] -= py / M;
        config.state[10] -= px / M;
        config.state[11] -= py / M;
    }

    masses = [...config.masses];
    state = [...config.state];
    activeBodies = [true, true, true];
    collisionMessage = '';
    softCollisions = true;
    if (softCollisionsCheckbox) softCollisionsCheckbox.checked = softCollisions;
    camera.zoom = config.zoom;
    camera.x = 0;
    camera.y = 0;
    trails = [[], [], []];
    energyHistory = [];
    simulationHistory = [];
    snapshots = [];
    renderSnapshots();

    updateUIToMatchPhysics();
    initialEnergy = calculateEnergy();
    drawEnergyGraph();
}

function updateUIToMatchPhysics() {
    const cards = bodiesContainer.querySelectorAll('.body-card');
    for (let i = 0; i < 3; i++) {
        const card = cards[i];
        const m = masses[i];
        const safeMass = m > 0 ? m : 0.001;

        card.querySelector('.mass-input').value = safeMass;
        card.querySelector('.mass-slider').value = Math.log10(safeMass);
        card.querySelector('.mass-display').textContent = formatMass(safeMass);

        card.querySelector('.pos-x').value = state[i * 4 + 0].toFixed(3);
        card.querySelector('.pos-y').value = state[i * 4 + 1].toFixed(3);
        card.querySelector('.vel-x').value = state[i * 4 + 2].toFixed(3);
        card.querySelector('.vel-y').value = state[i * 4 + 3].toFixed(3);
    }
}

function updatePhysicsFromUI() {
    if (presetSelector.value !== 'custom') {
        presetSelector.value = 'custom';
    }
    const cards = bodiesContainer.querySelectorAll('.body-card');
    for (let i = 0; i < 3; i++) {
        const card = cards[i];
        masses[i] = parseFloat(card.querySelector('.mass-input').value) || 1;
        state[i * 4 + 0] = parseFloat(card.querySelector('.pos-x').value) || 0;
        state[i * 4 + 1] = parseFloat(card.querySelector('.pos-y').value) || 0;
        state[i * 4 + 2] = parseFloat(card.querySelector('.vel-x').value) || 0;
        state[i * 4 + 3] = parseFloat(card.querySelector('.vel-y').value) || 0;
    }

    if (enforceMomentum) {
        let px = 0;
        let py = 0;
        let M = 0;
        for (let i = 0; i < 3; i++) {
            px += masses[i] * state[i * 4 + 2];
            py += masses[i] * state[i * 4 + 3];
            M += masses[i];
        }
        if (M > 0) {
            const correctionX = px / M;
            const correctionY = py / M;
            for (let i = 0; i < 3; i++) {
                state[i * 4 + 2] -= correctionX / masses[i];
                state[i * 4 + 3] -= correctionY / masses[i];
            }
        }
    }

    trails = [[], [], []];
    initialEnergy = calculateEnergy();
    drawEnergyGraph();
}

function computeDerivatives(S) {
    const dS = new Float64Array(12);

    for (let i = 0; i < 3; i++) {
        if (!isBodyActive(i)) {
            dS[i * 4 + 0] = 0;
            dS[i * 4 + 1] = 0;
            dS[i * 4 + 2] = 0;
            dS[i * 4 + 3] = 0;
            continue;
        }
        dS[i * 4 + 0] = S[i * 4 + 2];
        dS[i * 4 + 1] = S[i * 4 + 3];
    }

    for (let i = 0; i < 3; i++) {
        if (!isBodyActive(i)) continue;
        let ax = 0;
        let ay = 0;
        for (let j = 0; j < 3; j++) {
            if (!isBodyActive(j) || i === j) continue;
            const dx = S[j * 4 + 0] - S[i * 4 + 0];
            const dy = S[j * 4 + 1] - S[i * 4 + 1];
            const distSq = dx * dx + dy * dy;
            const dist3 = Math.pow(distSq + 1e-4, 1.5);
            const f = G * masses[j] / dist3;
            ax += f * dx;
            ay += f * dy;
        }
        dS[i * 4 + 2] = ax;
        dS[i * 4 + 3] = ay;
    }
    return dS;
}

function stepRK4(dt) {
    const k1 = computeDerivatives(state);

    const stateK2 = new Float64Array(12);
    for (let i = 0; i < 12; i++) stateK2[i] = state[i] + 0.5 * dt * k1[i];
    const k2 = computeDerivatives(stateK2);

    const stateK3 = new Float64Array(12);
    for (let i = 0; i < 12; i++) stateK3[i] = state[i] + 0.5 * dt * k2[i];
    const k3 = computeDerivatives(stateK3);

    const stateK4 = new Float64Array(12);
    for (let i = 0; i < 12; i++) stateK4[i] = state[i] + dt * k3[i];
    const k4 = computeDerivatives(stateK4);

    for (let i = 0; i < 12; i++) {
        state[i] += (dt / 6.0) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }
}

function calculateEnergy() {
    let T = 0;
    let U = 0;
    for (let i = 0; i < 3; i++) {
        if (!isBodyActive(i)) continue;
        const v2 = state[i * 4 + 2] * state[i * 4 + 2] + state[i * 4 + 3] * state[i * 4 + 3];
        T += 0.5 * masses[i] * v2;
        for (let j = i + 1; j < 3; j++) {
            if (!isBodyActive(j)) continue;
            const dx = state[i * 4 + 0] - state[j * 4 + 0];
            const dy = state[i * 4 + 1] - state[j * 4 + 1];
            U -= G * masses[i] * masses[j] / Math.sqrt(dx * dx + dy * dy + 1e-4);
        }
    }
    return T + U;
}

function applySoftCollisions() {
    if (!softCollisions) return;
    collisionMessage = '';

    for (let i = 0; i < 3; i++) {
        if (!isBodyActive(i)) continue;
        for (let j = i + 1; j < 3; j++) {
            if (!isBodyActive(j)) continue;
            const iBase = i * 4;
            const jBase = j * 4;
            const dx = state[jBase + 0] - state[iBase + 0];
            const dy = state[jBase + 1] - state[iBase + 1];
            const dist = Math.hypot(dx, dy);
            if (dist < 0.35) {
                const totalMass = masses[i] + masses[j];
                const newX = (masses[i] * state[iBase + 0] + masses[j] * state[jBase + 0]) / totalMass;
                const newY = (masses[i] * state[iBase + 1] + masses[j] * state[jBase + 1]) / totalMass;
                const newVx = (masses[i] * state[iBase + 2] + masses[j] * state[jBase + 2]) / totalMass;
                const newVy = (masses[i] * state[iBase + 3] + masses[j] * state[jBase + 3]) / totalMass;

                state[iBase + 0] = newX;
                state[iBase + 1] = newY;
                state[iBase + 2] = newVx;
                state[iBase + 3] = newVy;
                masses[i] = totalMass;
                resetBody(j);
                collisionMessage = `Body ${j + 1} merged into Body ${i + 1}`;
                return;
            }
        }
    }
}

function worldToScreen(x, y) {
    return {
        x: canvas.width / 2 + (x - camera.x) * camera.zoom,
        y: canvas.height / 2 - (y - camera.y) * camera.zoom
    };
}

function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
        x: camera.x + (sx - canvas.width / 2) / camera.zoom,
        y: camera.y - (sy - canvas.height / 2) / camera.zoom
    };
}

function findBodyAtScreen(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;

    for (let i = 0; i < 3; i++) {
        if (!isBodyActive(i)) continue;
        const screenPos = worldToScreen(state[i * 4 + 0], state[i * 4 + 1]);
        const radius = Math.max(3, Math.log10(masses[i] + 1) * 5 + 4) * 2 + 6;
        const dist = Math.hypot(screenPos.x - sx, screenPos.y - sy);
        if (dist <= radius) {
            return i;
        }
    }
    return -1;
}

function drawEnergyGraph() {
    if (typeof energyGraphCanvas === 'undefined' || !energyGraphCanvas) return;
    const ctxGraph = energyGraphCanvas.getContext('2d');
    ctxGraph.clearRect(0, 0, energyGraphCanvas.width, energyGraphCanvas.height);
    // background
    ctxGraph.save();
    ctxGraph.fillStyle = 'rgba(0,0,0,0.18)';
    ctxGraph.fillRect(0, 0, energyGraphCanvas.width, energyGraphCanvas.height);
    ctxGraph.restore();

    if (energyHistory.length < 2) return;

    // layout margins for labels
    const marginLeft = 48;
    const marginRight = 12;
    const marginTop = 8;
    const marginBottom = 20;
    const innerW = energyGraphCanvas.width - marginLeft - marginRight;
    const innerH = energyGraphCanvas.height - marginTop - marginBottom;
    const originX = marginLeft;
    const originY = energyGraphCanvas.height - marginBottom;

    // compute range and pad it for visibility (energyHistory is percent error)
    let maxVal = Math.max(...energyHistory);
    let minVal = Math.min(...energyHistory);
    // ensure zero included so baseline shows
    maxVal = Math.max(maxVal, 0);
    minVal = Math.min(minVal, 0);
    let range = maxVal - minVal;
    if (range < 1e-6) {
        // small constant to avoid flat line; use small padding
        range = Math.abs(maxVal) * 0.2 + 1e-3;
        maxVal += range * 0.5;
        minVal -= range * 0.5;
        range = maxVal - minVal;
    } else {
        // pad 10%
        const pad = range * 0.1;
        maxVal += pad;
        minVal -= pad;
        range = maxVal - minVal;
    }

    // draw grid lines and y labels
    ctxGraph.save();
    ctxGraph.strokeStyle = 'rgba(255,255,255,0.06)';
    ctxGraph.fillStyle = 'rgba(255,255,255,0.7)';
    ctxGraph.font = '10px Inter, Arial';
    ctxGraph.textAlign = 'right';
    ctxGraph.textBaseline = 'middle';

    const horizLines = 4;
    for (let i = 0; i < horizLines; i++) {
        const t = i / (horizLines - 1);
        const y = originY - t * innerH;
        ctxGraph.beginPath();
        ctxGraph.moveTo(originX, y);
        ctxGraph.lineTo(originX + innerW, y);
        ctxGraph.stroke();

        const value = (minVal + (1 - t) * range);
        ctxGraph.fillText(value.toFixed(3) + '%', originX - 8, y);
    }

    // x-axis ticks (time percent)
    ctxGraph.textAlign = 'center';
    ctxGraph.textBaseline = 'top';
    const vertTicks = 5;
    for (let i = 0; i < vertTicks; i++) {
        const tx = originX + (i / (vertTicks - 1)) * innerW;
        ctxGraph.beginPath();
        ctxGraph.moveTo(tx, originY);
        ctxGraph.lineTo(tx, originY + 6);
        ctxGraph.stroke();
        const pct = Math.round((i / (vertTicks - 1)) * 100);
        ctxGraph.fillText(pct + '%', tx, originY + 8);
    }
    ctxGraph.restore();

    // draw energy line
    ctxGraph.save();
    ctxGraph.clip();
    ctxGraph.beginPath();
    ctxGraph.strokeStyle = '#66fcf1';
    ctxGraph.lineWidth = 2;

    energyHistory.forEach((value, index) => {
        const x = originX + (index / (energyHistory.length - 1 || 1)) * innerW;
        const y = originY - ((value - minVal) / range) * innerH;
        if (index === 0) ctxGraph.moveTo(x, y);
        else ctxGraph.lineTo(x, y);
    });

    ctxGraph.stroke();
    ctxGraph.restore();

    // draw marker for current value (uses scrub position if active)
    const lastIndex = energyHistory.length - 1;
    let markerIndex = lastIndex;
    if (typeof timeScrubSidebar !== 'undefined' && timeScrubActive && simulationHistory.length > 0) {
        // map sidebar percent to history index
        const v = parseInt(timeScrubSidebar.value || '100', 10);
        markerIndex = Math.floor((v / 100) * (energyHistory.length - 1));
        markerIndex = Math.max(0, Math.min(markerIndex, lastIndex));
    }

    const markerX = originX + (markerIndex / (energyHistory.length - 1 || 1)) * innerW;
    const markerY = originY - ((energyHistory[markerIndex] - minVal) / range) * innerH;

    ctxGraph.save();
    ctxGraph.fillStyle = '#ffb86b';
    ctxGraph.strokeStyle = '#ffb86b';
    ctxGraph.beginPath();
    ctxGraph.arc(markerX, markerY, 4, 0, Math.PI * 2);
    ctxGraph.fill();
    ctxGraph.lineWidth = 1;
    ctxGraph.stroke();
    ctxGraph.fillStyle = 'white';
    ctxGraph.font = '11px Inter, Arial';
    ctxGraph.textAlign = 'left';
    ctxGraph.textBaseline = 'bottom';
    const displayVal = energyHistory[markerIndex];
    ctxGraph.fillText(displayVal.toFixed(4) + '%', markerX + 8, markerY - 2);
    ctxGraph.restore();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (showGrid) {
        const worldSpacing = Math.max(0.25, 80 / camera.zoom);
        const halfW = canvas.width / 2;
        const halfH = canvas.height / 2;
        const xStart = Math.floor((camera.x - halfW / camera.zoom) / worldSpacing) * worldSpacing;
        const xEnd = Math.ceil((camera.x + halfW / camera.zoom) / worldSpacing) * worldSpacing;
        const yStart = Math.floor((camera.y - halfH / camera.zoom) / worldSpacing) * worldSpacing;
        const yEnd = Math.ceil((camera.y + halfH / camera.zoom) / worldSpacing) * worldSpacing;

        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;

        for (let x = xStart; x <= xEnd; x += worldSpacing) {
            const p1 = worldToScreen(x, yStart);
            const p2 = worldToScreen(x, yEnd);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }

        for (let y = yStart; y <= yEnd; y += worldSpacing) {
            const p1 = worldToScreen(xStart, y);
            const p2 = worldToScreen(xEnd, y);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }

        ctx.restore();
    }

    for (let i = 0; i < 3; i++) {
        if (trails[i].length < 2) continue;
        ctx.beginPath();
        let pt = worldToScreen(trails[i][0].x, trails[i][0].y);
        ctx.moveTo(pt.x, pt.y);
        for (let j = 1; j < trails[i].length; j++) {
            pt = worldToScreen(trails[i][j].x, trails[i][j].y);
            ctx.lineTo(pt.x, pt.y);
        }
        ctx.strokeStyle = bodyColors[i];
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.6;
        ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    if (showVectors) {
        for (let i = 0; i < 3; i++) {
            if (!isBodyActive(i)) continue;
            const x = state[i * 4 + 0];
            const y = state[i * 4 + 1];
            const vx = state[i * 4 + 2];
            const vy = state[i * 4 + 3];
            const start = worldToScreen(x, y);
            const end = worldToScreen(x + vx * 0.18, y + vy * 0.18);

            ctx.save();
            ctx.strokeStyle = bodyColors[i];
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();

            const angle = Math.atan2(end.y - start.y, end.x - start.x);
            ctx.beginPath();
            ctx.moveTo(end.x, end.y);
            ctx.lineTo(end.x - 5 * Math.cos(angle - Math.PI / 6), end.y - 5 * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(end.x - 5 * Math.cos(angle + Math.PI / 6), end.y - 5 * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fillStyle = bodyColors[i];
            ctx.fill();
            ctx.restore();
        }
    }

    for (let i = 0; i < 3; i++) {
        if (!isBodyActive(i)) continue;
        const pt = worldToScreen(state[i * 4 + 0], state[i * 4 + 1]);
        const radius = Math.max(3, Math.log10(masses[i] + 1) * 5 + 4);

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius * 2, 0, 2 * Math.PI);
        const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius * 2);
        grad.addColorStop(0, bodyColors[i]);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = 'white';
        ctx.fill();
    }
}

function updateEnergyHUD() {
    const currentEnergy = calculateEnergy();
    const error = initialEnergy === 0 ? 0 : Math.abs((currentEnergy - initialEnergy) / initialEnergy) * 100;
    energyHud.textContent = `Energy Error: ${error.toFixed(4)}%`;
    energyHud.style.color = error > 2 ? '#ff4757' : '#2ed573';
    if (energyHistory.length >= maxEnergyHistoryPoints) energyHistory.shift();
    energyHistory.push(error);
    drawEnergyGraph();
}

function computeScientificMetrics() {
    const momentum = { x: 0, y: 0 };
    let angularMomentum = 0;
    let kinetic = 0;
    let potential = 0;
    const accelerations = [];
    const pairMetrics = [];
    const bodyStats = [];

    for (let i = 0; i < 3; i++) {
        if (!isBodyActive(i)) continue;
        momentum.x += masses[i] * state[i * 4 + 2];
        momentum.y += masses[i] * state[i * 4 + 3];
        kinetic += 0.5 * masses[i] * (state[i * 4 + 2] ** 2 + state[i * 4 + 3] ** 2);
        angularMomentum += masses[i] * (state[i * 4 + 0] * state[i * 4 + 3] - state[i * 4 + 1] * state[i * 4 + 2]);

        const speed = Math.hypot(state[i * 4 + 2], state[i * 4 + 3]);
        const distanceFromOrigin = Math.hypot(state[i * 4 + 0], state[i * 4 + 1]);
        bodyStats.push({ index: i, speed, distanceFromOrigin });
    }

    for (let i = 0; i < 3; i++) {
        if (!isBodyActive(i)) continue;
        let ax = 0;
        let ay = 0;
        for (let j = 0; j < 3; j++) {
            if (!isBodyActive(j) || i === j) continue;
            const dx = state[j * 4 + 0] - state[i * 4 + 0];
            const dy = state[j * 4 + 1] - state[i * 4 + 1];
            const dist3 = Math.pow(dx * dx + dy * dy + 1e-4, 1.5);
            const f = G * masses[j] / dist3;
            ax += f * dx;
            ay += f * dy;
        }
        accelerations.push({ index: i, ax, ay, magnitude: Math.hypot(ax, ay) });
    }

    for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
            if (!isBodyActive(i) || !isBodyActive(j)) continue;
            const dx = state[i * 4 + 0] - state[j * 4 + 0];
            const dy = state[i * 4 + 1] - state[j * 4 + 1];
            const dist = Math.hypot(dx, dy) + 1e-6;
            const forceMag = (G * masses[i] * masses[j]) / (dist * dist);
            const accelOnI = forceMag / masses[i];
            const accelOnJ = forceMag / masses[j];
            pairMetrics.push({ indexI: i, indexJ: j, dist, forceMag, accelOnI, accelOnJ });
            potential -= G * masses[i] * masses[j] / Math.sqrt(dx * dx + dy * dy + 1e-4);
        }
    }

    return { momentum, angularMomentum, kinetic, potential, accelerations, pairMetrics, bodyStats };
}

function renderAnalysisPanel() {
    const metrics = computeScientificMetrics();
    const energy = metrics.kinetic + metrics.potential;
    const energyDrift = initialEnergy === 0 ? 0 : Math.abs((energy - initialEnergy) / initialEnergy) * 100;

    analysisContent.innerHTML = `
        <div class="analysis-block">
            <h4>Newtonian gravity</h4>
            <p><code>F_ij = G m_i m_j / r_ij^2</code></p>
            ${metrics.pairMetrics.map((pair) => `<p>Body ${pair.indexI + 1} ↔ Body ${pair.indexJ + 1}: r = ${pair.dist.toFixed(3)}, F = ${pair.forceMag.toFixed(4)}</p>`).join('')}
        </div>
        <div class="analysis-block">
            <h4>Acceleration from other bodies</h4>
            <p><code>a_i = Σ_j G m_j / r_ij^3 (r_j - r_i)</code></p>
            ${metrics.accelerations.map((item) => `<p>Body ${item.index + 1}: ax = ${item.ax.toFixed(4)}, ay = ${item.ay.toFixed(4)}, |a| = ${item.magnitude.toFixed(4)}</p>`).join('')}
        </div>
        <div class="analysis-block">
            <h4>Energy</h4>
            <p><code>T = 1/2 Σ m_i v_i^2</code></p>
            <p><code>U = -Σ G m_i m_j / r_ij</code></p>
            <p>Kinetic energy: ${metrics.kinetic.toFixed(4)}</p>
            <p>Potential energy: ${metrics.potential.toFixed(4)}</p>
            <p>Total energy: ${energy.toFixed(4)}</p>
            <p>Energy drift: ${energyDrift.toFixed(3)}%</p>
        </div>
        <div class="analysis-block">
            <h4>Angular momentum</h4>
            <p><code>L = Σ m_i (x_i v_{yi} - y_i v_{xi})</code></p>
            <p>Total angular momentum: ${metrics.angularMomentum.toFixed(4)}</p>
            <p>Momentum: (${metrics.momentum.x.toFixed(4)}, ${metrics.momentum.y.toFixed(4)})</p>
        </div>
        <div class="analysis-block">
            <h4>Live body motion</h4>
            ${metrics.bodyStats.map((body) => `<p>Body ${body.index + 1}: speed = ${body.speed.toFixed(3)}, radius from origin = ${body.distanceFromOrigin.toFixed(3)}</p>`).join('')}
            <p><strong>Collision status:</strong> ${collisionMessage || 'No active mergers'}</p>
        </div>
    `;
}

function renderSnapshots() {
    snapshotList.innerHTML = '';
    if (snapshots.length === 0) {
        snapshotList.innerHTML = '<div class="snapshot-card"><strong>No snapshots yet</strong><p>Capture a moment to compare trajectories.</p></div>';
        return;
    }

    snapshots.forEach((snapshot, index) => {
        const card = document.createElement('div');
        card.className = 'snapshot-card';
        card.innerHTML = `<strong>${snapshot.name}</strong><p>${snapshot.note}</p><button data-index="${index}">Restore</button>`;
        card.querySelector('button').addEventListener('click', () => restoreSnapshot(index));
        snapshotList.appendChild(card);
    });
}

function takeSnapshot() {
    snapshots.unshift({
        name: `Snapshot ${snapshots.length + 1}`,
        note: `Energy error ${energyHistory[energyHistory.length - 1]?.toFixed(2) || '0.00'}%`,
        state: [...state],
        masses: [...masses],
        activeBodies: [...activeBodies],
        camera: { ...camera },
        trails: trails.map((trail) => [...trail]),
        collisionMessage
    });
    if (snapshots.length > maxSnapshots) snapshots.pop();
    renderSnapshots();
}

function restoreSnapshot(index) {
    const snapshot = snapshots[index];
    if (!snapshot) return;
    state = [...snapshot.state];
    masses = [...snapshot.masses];
    activeBodies = [...snapshot.activeBodies];
    camera = { ...snapshot.camera };
    trails = snapshot.trails.map((trail) => [...trail]);
    collisionMessage = snapshot.collisionMessage || '';
    initialEnergy = calculateEnergy();
    updateUIToMatchPhysics();
    drawEnergyGraph();
    renderAnalysisPanel();
}

let frameCount = 0;
function animate() {
    if (isPlaying && !timeScrubActive) {
        const steps = 10;
        const actualDt = (baseDt * simulationSpeed) / steps;

        for (let s = 0; s < steps; s++) {
            stepRK4(actualDt);
            applySoftCollisions();
        }

        simulationHistory.push(captureSimulationState());
        if (simulationHistory.length > maxSimulationHistory) simulationHistory.shift();

        frameCount++;
        if (frameCount % 3 === 0) {
            for (let i = 0; i < 3; i++) {
                if (!isBodyActive(i)) continue;
                trails[i].push({ x: state[i * 4 + 0], y: state[i * 4 + 1] });
                if (trails[i].length > maxTrailLength) trails[i].shift();
            }
        }

        updateEnergyHUD();
        if (!analysisModal.classList.contains('hidden')) {
            renderAnalysisPanel();
        }

        if (followSelectedBody) {
            const idx = followBodyIndex;
            const targetX = state[idx * 4 + 0];
            const targetY = state[idx * 4 + 1];
            camera.x += (targetX - camera.x) * 0.06;
            camera.y += (targetY - camera.y) * 0.06;
        }

        if (frameCount % 30 === 0 && presetSelector.value !== 'custom') {
            updateUIToMatchPhysics();
        }
    }

    draw();
    requestAnimationFrame(animate);
}

btnPlayPause.addEventListener('click', () => {
    isPlaying = !isPlaying;
    btnPlayPause.textContent = isPlaying ? 'Pause' : 'Play';
});

btnReset.addEventListener('click', () => {
    loadPreset(presetSelector.value);
});

btnPlacementMode.addEventListener('click', () => {
    placementMode = !placementMode;
    btnPlacementMode.textContent = placementMode ? 'Placement Mode On' : 'Enable Placement Mode';
    btnPlacementMode.classList.toggle('primary', placementMode);
    if (!placementMode) {
        placementDrag = null;
        placementWasPlaying = false;
        isDragging = false;
    }
});

presetSelector.addEventListener('change', (e) => {
    if (e.target.value !== 'custom') {
        loadPreset(e.target.value);
    }
});

speedSlider.addEventListener('input', (e) => {
    simulationSpeed = parseFloat(e.target.value);
    speedValue.textContent = simulationSpeed.toFixed(1);
});

trailSlider.addEventListener('input', (e) => {
    maxTrailLength = parseInt(e.target.value, 10);
    trailValue.textContent = maxTrailLength;
    for (let i = 0; i < 3; i++) {
        while (trails[i].length > maxTrailLength) trails[i].shift();
    }
});

showVectorsCheckbox.addEventListener('change', (e) => {
    showVectors = e.target.checked;
});

showGridCheckbox.addEventListener('change', (e) => {
    showGrid = e.target.checked;
});

followBodyCheckbox.addEventListener('change', (e) => {
    followSelectedBody = e.target.checked;
});

followBodySelect.addEventListener('change', (e) => {
    followBodyIndex = parseInt(e.target.value, 10);
});

enforceMomentumCheckbox.addEventListener('change', (e) => {
    enforceMomentum = e.target.checked;
    updatePhysicsFromUI();
});

softCollisionsCheckbox.addEventListener('change', (e) => {
    softCollisions = e.target.checked;
    if (!softCollisions) collisionMessage = '';
});

showConservationCheckbox.addEventListener('change', (e) => {
    showConservation = e.target.checked;
    energyHud.style.display = showConservation ? 'block' : 'none';
});

btnSnapshot.addEventListener('click', takeSnapshot);

timeScrubSidebar.addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    if (v < 100 && simulationHistory.length > 0) {
        timeScrubActive = true;
        const idx = Math.floor((v / 100) * (simulationHistory.length - 1));
        const snapshot = simulationHistory[idx];
        if (snapshot) restoreSimulationState(snapshot);
        timeScrubSidebarValue.textContent = `${v}%`;
    } else {
        timeScrubActive = false;
        timeScrubSidebarValue.textContent = 'Live';
        // restore most recent live state if available
        const latest = simulationHistory[simulationHistory.length - 1];
        if (latest) restoreSimulationState(latest);
    }
});

btnGoLive.addEventListener('click', () => {
    timeScrubSidebar.value = 100;
    timeScrubSidebar.dispatchEvent(new Event('input'));
});

analysisToggle.addEventListener('click', () => {
    renderAnalysisPanel();
    analysisModal.classList.remove('hidden');
    analysisModal.setAttribute('aria-hidden', 'false');
});

analysisClose.addEventListener('click', () => {
    analysisModal.classList.add('hidden');
    analysisModal.setAttribute('aria-hidden', 'true');
});

canvas.addEventListener('mousedown', (e) => {
    if (placementMode) {
        const bodyIndex = findBodyAtScreen(e.clientX, e.clientY);
        if (bodyIndex >= 0) {
            placementDrag = {
                index: bodyIndex,
                startWorld: screenToWorld(e.clientX, e.clientY),
                pointerStart: { x: e.clientX, y: e.clientY }
            };
            placementWasPlaying = isPlaying;
            if (isPlaying) {
                isPlaying = false;
                btnPlayPause.textContent = 'Play';
            }
            e.preventDefault();
            return;
        }
    }

    isDragging = true;
    lastMouse = { x: e.clientX, y: e.clientY };
});
window.addEventListener('mouseup', () => {
    if (placementDrag) {
        placementDrag = null;
        if (placementWasPlaying) {
            isPlaying = true;
            btnPlayPause.textContent = 'Pause';
        }
        placementWasPlaying = false;
        updateUIToMatchPhysics();
        renderAnalysisPanel();
        draw();
        return;
    }
    isDragging = false;
});
window.addEventListener('mousemove', (e) => {
    if (placementDrag) {
        const world = screenToWorld(e.clientX, e.clientY);
        const idx = placementDrag.index;
        const dx = world.x - placementDrag.startWorld.x;
        const dy = world.y - placementDrag.startWorld.y;
        state[idx * 4 + 0] = world.x;
        state[idx * 4 + 1] = world.y;
        state[idx * 4 + 2] = dx * 0.2;
        state[idx * 4 + 3] = dy * 0.2;
        updateUIToMatchPhysics();
        if (!isPlaying) draw();
        return;
    }

    if (isDragging) {
        const dx = e.clientX - lastMouse.x;
        const dy = e.clientY - lastMouse.y;
        camera.x -= dx / camera.zoom;
        camera.y += dy / camera.zoom;
        lastMouse = { x: e.clientX, y: e.clientY };
        if (!isPlaying) draw();
    }
});
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    if (e.deltaY > 0) camera.zoom /= zoomFactor;
    else camera.zoom *= zoomFactor;
    if (!isPlaying) draw();
});

buildUI();
loadPreset('figure8');
renderAnalysisPanel();
renderSnapshots();
animate();
