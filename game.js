import * as Core from './core.js'; 
import * as Games from './games.js'; 

// =======================================================
// ===== SECTION 1: CONFIGURATION & CONSTANTS =====
// =======================================================

const CONFIG = {
    TELEGRAM_LINK: 'https://t.me/stuttgart_quest_group',
    MAX_SNOW_PILES: 1,
    LAST_CHANCE_DURATION_MS: 5 * 60 * 1000, // 5 minutes
    TEAMS_UI: {
        101: { color: '#8be9fd', symbol: '❄️' },
        102: { color: '#ff5555', symbol: '🔴' },
        103: { color: '#f1fa8c', symbol: '💡' },
        104: { color: '#bd93f9', symbol: '🎅' },
    },
    // Final Task IDs
    FINAL_TASK_IDS: { 101: 6, 103: 6, 102: 15, 104: 15 },
    // Main missions for victory check
    MAIN_MISSION_IDS: [1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 14, 15]
};

// Mission Sequences
const TEAM_MISSION_SEQUENCES = {
    101: [3, 4, 1, 2, 5, 6],
    102: [10, 14, 12, 11, 13, 15],
    103: [2, 4, 5, 3, 1, 6],
    104: [14, 11, 10, 13, 12, 15]
};

// Valid IDs for UI display
const VALID_TASK_IDS = {
    101: [1, 2, 3, 4, 5, 6],
    103: [1, 2, 3, 4, 5, 6],
    102: [10, 11, 12, 13, 14, 15],
    104: [10, 11, 12, 13, 14, 15],
};

// Final Item Requirements
const FINAL_ITEM_REQUIREMENTS = {
    101: { 1: 1, 3: 1, 5: 1, 7: 1, 9: 1 }, 
    103: { 1: 1, 3: 1, 6: 1, 7: 1, 9: 1 }, 
    102: { 2: 1, 4: 1, 6: 1, 8: 1, 10: 1 }, 
    104: { 1: 1, 2: 1, 3: 1, 8: 1, 10: 1 }, 
};

// =======================================================
// ===== SECTION 2: GLOBAL STATE =====
// =======================================================

let State = {
    map: null,
    mapMarkers: {},
    staticPoints: [],
    dynamicSnowPiles: [],
    MissionLogic: {}, 
    
    // Timers & Flags
    lastScavengeTime: Number(localStorage.getItem('lastScavengeTime')) || 0,
    lastChanceActive: false,
    hasShownVictory: false,
    freezeTimerInterval: null
};

// Expose configs to window for legacy support if needed
window.TEAMS_UI_CONFIG = CONFIG.TEAMS_UI;
window.TELEGRAM_GROUP_LINK = CONFIG.TELEGRAM_LINK;
const LAST_CHANCE_FORCED_FLAG = 'lastChanceForced'; 

// =======================================================
// ===== SECTION 3: INITIALIZATION =====
// =======================================================

async function initGame() {
    // 1. Auth
    const player = await Core.authPlayer();
    if (!player) return alert("Ошибка входа! Игрок не найден.");

    // 2. Load Logic
    await loadMissionLogic(Core.state.me.team_id);

    // 3. Setup UI
    setupStaticUI();
    
    // 4. Load Data
    State.staticPoints = await Core.fetchStaticMapPoints();
    await Core.fetchAllTeamsData();
    await Core.refreshTeamData();
    
    // 5. Start Systems
    initMapLogic();
    renderGameInterface();
    createSnowEffect();
    startSnowPileSpawning(); 
    
    // 6. Check Last Chance State
    if (sessionStorage.getItem(LAST_CHANCE_FORCED_FLAG) === 'true') {
        State.lastChanceActive = true;
    }
    
    // 7. Global Loops
    setInterval(checkGlobalWinCondition, 1000); 

    // 8. Realtime Listeners
    Core.setupRealtimeListeners(
        async (newTeam) => {
            Object.assign(Core.state.currentTeam, newTeam);
            renderGameInterface();
        },
        () => { renderMarkers(); }
    );

    if(['leader', 'Negotiator'].includes(Core.state.me.role)) Core.clearTentStatus();
}

async function loadMissionLogic(teamId) {
    try {
        let module;
        if (teamId === 101 || teamId === 103) {
            module = await import('./missions_101_103.js');
        } else if (teamId === 102 || teamId === 104) {
            module = await import('./missions_102_104.js');
        }
        
        if (module) {
            State.MissionLogic = { ...module };
            State.MissionLogic.openTicTacToeModal = () => {
                const gameType = (teamId === 101 || teamId === 103) ? 'tictactoe' : 'bingo';
                Games.openGameChallengeModal(gameType);
            };
        }
    } catch (e) {
        console.error("Ошибка загрузки MissionLogic:", e);
    }
}

function setupStaticUI() {
    document.getElementById('myNameHeader').textContent = Core.state.me.name;
    document.getElementById('myPlayerRole').textContent = Core.ROLES_DATA[Core.state.me.role] || Core.state.me.role;
    
    const role = Core.state.me.role;
    if (role === 'Spy') document.getElementById('btnSpyAction')?.classList.remove('hidden'); 
    if (role === 'Scavenger') document.getElementById('btnScavenge')?.classList.remove('hidden');
    if (role === 'Guardian') document.getElementById('btnGuardianWarm')?.classList.remove('hidden'); 
    if (['leader', 'Negotiator'].includes(role)) document.getElementById('btnShowTrades')?.classList.remove('hidden');
    if (role === 'leader') document.getElementById('btnForceLastChance')?.classList.remove('hidden');
}

// =======================================================
// ===== SECTION 4: MAP SYSTEM (LEAFLET) =====
// =======================================================

function initMapLogic() {
    if (State.map) State.map.remove();
    
    State.map = L.map('interactiveMap', { crs: L.CRS.Simple, minZoom: -2, maxZoom: 2, zoomControl: false, attributionControl: false });
    const bounds = [[0, 0], [1500, 2000]];
    L.imageOverlay('map.png', bounds).addTo(State.map);
    State.map.fitBounds(bounds);
    State.map.on('click', () => window.closeModal('interactionModal'));

    renderMarkers();
    
    // Marker Jitter Effect
    setInterval(() => {
        Core.state.otherTeams.forEach(t => {
            t.x = Math.max(10, Math.min(90, t.x + (Math.random() - 0.5) * 2)); 
            t.y = Math.max(10, Math.min(90, t.y + (Math.random() - 0.5) * 2));
        });
        renderMarkers();
    }, 3000);
}

function renderMarkers() {
    if(!State.map) return;
    
    Object.keys(State.mapMarkers).forEach(id => { 
        if (id !== 'me') { State.mapMarkers[id].remove(); delete State.mapMarkers[id]; } 
    });
    
    const mission = findActiveMission();
    
    // 1. Static Points
    State.staticPoints.forEach(item => {
        if (mission && item.title === mission.title) return;
        if (item.type === 'tent' || item.type === 'npc') {
            updateMarker(item.id, item.type, item.x, item.y, item.title, item, item.icon);
        }
    });

    // 2. Active Mission
    if (mission) updateMarker(mission.id, mission.type, mission.x, mission.y, mission.title, mission, '🎯');
    
    // 3. Snow Piles
    State.dynamicSnowPiles.forEach(item => updateMarker(item.id, 'snow_pile', item.x, item.y, item.title, item, '🧤'));
    
    // 4. Other Teams
    Core.state.otherTeams.forEach(t => {
        const isFrozen = t.frozen_until && new Date(t.frozen_until) > new Date();
        updateMarker('team_'+t.id, 'team', t.x, t.y, 
            isFrozen ? `🧊 ${t.name}` : t.name, 
            { title: t.name, desc: `Игроков: ${t.playerCount}` }, 
            CONFIG.TEAMS_UI[t.id]?.symbol
        );
    });

    // 5. Me
    updateMarker('me', 'me', 50, 85, 'Я', {title:'Вы', desc:'Ваша позиция'});
}

function updateMarker(id, type, x, y, label, data, customSymbol) {
    const loc = [1500 - ((y / 100) * 1500), (x / 100) * 2000];
    let symbol = customSymbol || '📍';
    if (!customSymbol) {
         if (type === 'tent') symbol = '⛺';
         else if (type === 'npc') symbol = '👤';
         else if (type === 'snow_pile') symbol = '❄️';
         else if (type === 'me') symbol = '🔴';
    }

    const html = `<div class="marker ${type}"><div class="pin"><div>${symbol}</div></div><div class="label">${label}</div></div>`;
    const icon = L.divIcon({ className: 'custom-leaflet-icon', html: html, iconSize: [40, 60], iconAnchor: [20, 50] });

    if (State.mapMarkers[id]) {
        State.mapMarkers[id].setLatLng(loc);
    } else {
        const m = L.marker(loc, {icon: icon}).addTo(State.map);
        m.on('click', (e) => { 
            L.DomEvent.stopPropagation(e); 
            handleMarkerClick(type, data, id);
            setTimeout(() => { State.map.flyTo(loc, State.map.getZoom()); }, 50); 
        });
        State.mapMarkers[id] = m;
    }
}

function handleMarkerClick(type, data, id) {
    if (type === 'final_lock') window.openFinalLockModal(data.requiredItems);
    else if (type === 'mission_stall') showMissionPopup(data); 
    else showPopup(data, type, id);
}

function findActiveMission() {
    const tasks = Core.state.currentTeam.tasks;
    if (!tasks || tasks.length === 0) return null;
    
    const teamId = Core.state.me.team_id;
    const sequence = TEAM_MISSION_SEQUENCES[teamId];
    if (!sequence) return null;

    let activeTask = null;
    // FIX: Using simple for loop instead of for..of
    for(let i = 0; i < sequence.length; i++) {
        const id = sequence[i];
        const task = tasks.find(t => t.id === id);
        if (task && !task.completed) {
            activeTask = task;
            break;
        }
    }
    
    if (!activeTask) return null;

    const finalMissionId = CONFIG.FINAL_TASK_IDS[teamId];
    
    // Final Lock Logic
    if (activeTask.id === finalMissionId) {
        const requiredItems = FINAL_ITEM_REQUIREMENTS[teamId];
        const inventory = Core.state.currentTeam.inventory || {};
        let requirementsMet = true;
        // FIX: Using for..in which is supported
        for (const itemId in requiredItems) {
            if ((inventory[itemId] || 0) < requiredItems[itemId]) {
                requirementsMet = false;
                break;
            }
        }
        if (!requirementsMet) {
            const stallName = (teamId === 101 || teamId === 103) ? 'Палатка №409 (ФИНАЛ)' : 'Палатка №325 (ФИНАЛ)';
            const point = State.staticPoints.find(p => p.title === stallName) || {x:50, y:50};
            return {
                id: 'mission_locked', type: 'final_lock', 
                x: point.x, y: point.y, 
                title: '🔒 ФИНАЛ ЗАБЛОКИРОВАН', 
                desc: 'Соберите все финальные предметы!', icon: '🔒', requiredItems: requiredItems 
            };
        }
    }

    // Active Mission Location
    let pathKey = (teamId === 101 || teamId === 103) ? '101_103' : '102_104';
    const missionStep = Core.MISSION_PATH_STRUCTURE[pathKey]?.find(p => p.taskId === activeTask.id);
    
    if (missionStep) {
        const activeStall = State.staticPoints.find(p => p.title === missionStep.stallName);
        if (activeStall) {
            return {
                id: 'mission_active', type: 'mission_stall', x: activeStall.x, y: activeStall.y, 
                title: activeStall.title, desc: activeStall.desc, taskId: activeTask.id, taskText: activeTask.text,
            };
        }
    }
    return null; 
}

// =======================================================
// ===== SECTION 5: UI RENDERING =====
// =======================================================

function renderGameInterface() {
    if(!Core.state.currentTeam) return;

    const uiCfg = CONFIG.TEAMS_UI[Core.state.currentTeam.id] || {symbol: '🎄'};
    const name = Core.state.currentTeam.name_by_leader || Core.state.currentTeam.name;
    document.getElementById('myTeamName').innerHTML = `${name} ${uiCfg.symbol}`;
    if(Core.state.currentTeam.selfie_url) document.getElementById('myTeamAvatar').style.backgroundImage = `url('${Core.state.currentTeam.selfie_url}')`;

    renderInventory();
    renderTasks();
    renderMembers();
    checkFreezeState();
}

function renderInventory() {
    const list = document.getElementById('inventoryList'); list.innerHTML = '';
    const inv = Core.state.currentTeam.inventory || {};
    let hasItems = false;

    Object.keys(inv).forEach(id => {
        if(inv[id] > 0) {
            hasItems = true;
            const item = Core.state.globalItems[id] || {name:'???', emoji:'📦', type:'item'};
            let actionBtn = '';
            
            if (item.type === 'gadget' && Core.state.me.role === 'Saboteur') {
                const now = Date.now();
                const remaining = Core.GADGET_COOLDOWN_MS - (now - Core.state.lastGadgetUsage);
                const disabled = remaining > 0 ? 'disabled' : '';
                const cooldownText = remaining > 0 ? `(${Math.ceil(remaining / 1000)}с)` : '';
                actionBtn = `<button class="btn-use" ${disabled} onclick="window.handleItemUse(${id})">USE ${cooldownText}</button>`;
            }

            list.innerHTML += `
            <li>
                <div style="display:flex;align-items:center;gap:10px; flex-grow: 1;">
                    ${renderItemIcon(item)} 
                    <div style="display:flex; flex-direction:column;">
                        <span style="font-weight:bold; font-size:0.9rem;">${item.name}</span>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap: 10px;">
                    ${actionBtn} <span class="inv-count">x${inv[id]}</span>
                </div>
            </li>`;
        }
    });
    if(!hasItems) list.innerHTML = '<li class="muted" style="justify-content:center; padding:10px;">Пусто...</li>';
}

function renderTasks() {
    const tbody = document.getElementById('tasksTableBody');
    const progressEl = document.getElementById('taskProgress');
    tbody.innerHTML = '';
    
    const teamId = Core.state.me.team_id;
    const validIds = VALID_TASK_IDS[teamId] || []; 
    const sequence = TEAM_MISSION_SEQUENCES[teamId] || [];
    
    let allTasks = (Core.state.currentTeam.tasks || []).filter(t => validIds.includes(t.id));
    
    allTasks.sort((a, b) => sequence.indexOf(a.id) - sequence.indexOf(b.id));

    const activeIndex = allTasks.findIndex(t => !t.completed);
    const visibleTasks = activeIndex === -1 ? allTasks : allTasks.slice(0, activeIndex + 1);

    visibleTasks.forEach(task => {
        const reward = task.reward_item_id ? (Core.state.globalItems[task.reward_item_id]?.emoji || '🎁') : '';
        tbody.innerHTML += `
            <tr class="${task.completed ? 'task-row completed' : 'task-row'}">
                <td style="text-align:center; width:30px;"><input type="checkbox" ${task.completed ? 'checked disabled' : ''} onclick="return false;"></td>
                <td>${task.text}</td>
                <td style="text-align:center; font-size:1.2rem;">${reward}</td>
            </tr>`;
    });

    if (visibleTasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="muted" style="padding:10px;">Нет активных задач</td></tr>';
        progressEl.textContent = '0%';
    } else {
        let totalCompleted = allTasks.filter(t => t.completed).length;
        progressEl.textContent = Math.round((totalCompleted / allTasks.length) * 100) + '%';
    }
}

function renderMembers() {
    const list = document.getElementById('currentTeamMembersList');
    document.getElementById('myTeamMembersCount').textContent = Core.state.teamMembers.length;
    list.innerHTML = '';

    Core.state.teamMembers.forEach(m => {
        const roleName = Core.ROLES_DATA[m.role] || m.role;
        const isMe = m.id === Core.state.me.id ? ' (Вы)' : '';
        const icon = m.role === 'leader' ? '👑' : '👤';
        list.innerHTML += `
            <li style="display:flex; align-items:center; width:100%; padding: 8px 10px; border-bottom:1px solid rgba(255,255,255,0.05);">
                <span style="margin-right:8px; font-size:1.2rem;">${icon}</span>
                <div style="display:flex; flex-direction:column;">
                    <span style="font-weight:600; color:#fff;">${m.name}${isMe}</span>
                    <span style="font-size:0.8rem; color:var(--text-muted);">${roleName}</span>
                </div>
            </li>`;
    });
}

function renderItemIcon(item) {
    if (item.emoji && item.emoji.startsWith('http')) {
        return `<img src="${item.emoji}" alt="${item.name}" style="width: 32px; height: 32px; object-fit: contain;">`;
    }
    return `<span style="font-size:1.5rem">${item.emoji}</span>`;
}

// =======================================================
// ===== SECTION 6: INTERACTION & MODALS =====
// =======================================================

// --- General Popup ---
function showPopup(item, type, id) {
    const modal = document.getElementById('interactionModal');
    const titleEl = document.getElementById('interactTitle');
    const descEl = document.getElementById('interactDesc');
    const btns = document.getElementById('interactButtons');
    const iconEl = document.getElementById('interactIcon');

    titleEl.textContent = item.title;
    descEl.innerHTML = item.desc || '';
    btns.innerHTML = '';
    iconEl.innerHTML = '⛺';

    if (type === 'tent') {
        if (['leader', 'Negotiator'].includes(Core.state.me.role)) {
            descEl.innerHTML += `<p style="margin-top:15px; color:var(--accent-gold);">Используйте "ВХОДЯЩИЕ 💛" и "ПРЕДЛОЖИТЬ ОБМЕН".</p>`;
            btns.innerHTML = `<button class="start-button" onclick="window.openTradeModal()">ПРЕДЛОЖИТЬ ОБМЕН</button>
                              <button class="secondary" style="margin-top: 10px;" onclick="window.closeModal('interactionModal')">ЗАКРЫТЬ</button>`;
        } else {
            descEl.innerHTML += `<br><span class="muted" style="color:#ff5555">Только Лидер или Переговорщик могут менять.</span>`;
            btns.innerHTML = `<button class="start-button" onclick="window.closeModal('interactionModal')">ЗАКРЫТЬ</button>`;
        }
    } else if (type === 'snow_pile') {
        const isScavenger = Core.state.me.role === 'Scavenger';
        const now = Date.now();
        const remaining = Core.SCAVENGER_COOLDOWN_MS - (now - State.lastScavengeTime);
        const disabled = remaining > 0 || !isScavenger ? 'disabled' : '';
        const cooldownText = remaining > 0 ? `(${Math.floor(remaining / 1000)}с)` : (isScavenger ? '' : '(Только Кладоискатель)');

        iconEl.innerHTML = '🧤'; 
        btns.innerHTML = `<button class="start-button" ${disabled} onclick="window.handleScavengeInteraction('${id}')">ИСКАТЬ ${cooldownText}</button>`;
    } else {
        if(type === 'npc') iconEl.innerHTML = item.icon || '👤';
        btns.innerHTML = `<button class="start-button" onclick="window.closeModal('interactionModal')">ЗАКРЫТЬ</button>`;
    }
    
    modal.classList.remove('hidden');
}

function showMissionPopup(missionData) {
    const modal = document.getElementById('interactionModal');
    document.getElementById('interactTitle').textContent = missionData.title;
    document.getElementById('interactIcon').innerHTML = '🎯';
    document.getElementById('interactDesc').innerHTML = `<p style="font-size: 1.1rem; color: var(--accent-gold); margin-bottom: 15px;">${missionData.taskText}</p><p class="muted">Вы на месте.</p>`;
    
    const logicId = missionData.taskId > 6 ? missionData.taskId - 9 : missionData.taskId;
    const isFinalGame = logicId === 6;
    const btnText = isFinalGame ? `ЗАПУСТИТЬ ФИНАЛ` : `НАЧАТЬ ЗАДАНИЕ ${missionData.taskId}`;
    
    document.getElementById('interactButtons').innerHTML = 
        `<button class="start-button" onclick="window.routeTaskToModal(${missionData.taskId}); window.closeModal('interactionModal');">${btnText}</button>`;
    
    modal.classList.remove('hidden');
}

window.routeTaskToModal = (taskId) => {
    if (Core.state.me.role !== 'leader') return alert("Только лидер может запускать задания!");
    
    const logicId = taskId > 6 ? taskId - 9 : taskId;
    if (logicId === 6) { // Final task is always a game
        const teamId = Core.state.me.team_id;
        const gameType = (teamId === 101 || teamId === 103) ? 'tictactoe' : 'bingo';
        Games.openGameChallengeModal(gameType);
        return;
    }
    
    if (State.MissionLogic && State.MissionLogic.routeTaskToModal) {
        State.MissionLogic.routeTaskToModal(taskId);
    }
};

// --- Scavenger Logic ---
// 1. Define the spawning function at the top level
function spawnSnowPile() {
    if (State.dynamicSnowPiles.length >= CONFIG.MAX_SNOW_PILES) return;
    const newPile = {
        id: `snow_${Date.now()}`, type: 'snow_pile',
        x: 20 + Math.random() * 60, y: 20 + Math.random() * 60,
        title: 'Сугроб', desc: 'Кладоискатель может поискать здесь ресурсы.',
    };
    State.dynamicSnowPiles.push(newPile);
    renderMarkers();
}

// 2. Wrap it for the init call
function startSnowPileSpawning() {
    spawnSnowPile();
}

window.handleScavengeInteraction = async (snowPileId) => {
    const descEl = document.getElementById('interactDesc');
    const btns = document.getElementById('interactButtons');
    const originalDesc = descEl.innerHTML;
    
    descEl.innerHTML = `<div class="tent-waiting"><div class="loader-spinner"></div><p>Идет поиск...</p></div>`;
    btns.innerHTML = `<button class="secondary" disabled>ИДЕТ ПОИСК</button>`;
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    const result = await Core.scavengeItemLogic();
    
    if (result.success) {
        State.lastScavengeTime = Date.now();
        localStorage.setItem('lastScavengeTime', State.lastScavengeTime);
        
        State.dynamicSnowPiles = State.dynamicSnowPiles.filter(p => p.id !== snowPileId);
        if (State.mapMarkers[snowPileId]) { State.mapMarkers[snowPileId].remove(); delete State.mapMarkers[snowPileId]; }
        
        // Use window.spawnSnowPile() to ensure it uses the exported function
        setTimeout(() => { window.spawnSnowPile(); }, 120000); 

        descEl.innerHTML = `<div style="text-align:center;"><h3>РЕЗУЛЬТАТ</h3><p>${result.message}</p></div>`;
        btns.innerHTML = `<button class="start-button" onclick="window.closeModal('interactionModal');">Готово</button>`;
        await Core.refreshTeamData(); 
        renderGameInterface();
    } else {
        alert(result.message);
        descEl.innerHTML = originalDesc;
    }
};

// --- Spy Logic ---
window.openSpyModal = () => {
    if (Core.state.me.role !== 'Spy') return alert("Доступно только Шпиону!");
    const modal = document.getElementById('interactionModal');
    
    document.getElementById('interactTitle').textContent = "🕵️ ШПИОНАЖ";
    document.getElementById('interactIcon').innerHTML = "🕵️‍♂️";
    
    let selectHtml = `<div style="text-align:left; margin-bottom:15px;"><label>Цель:</label><select id="spyTargetSelect" class="modal-input">`;
    Core.state.otherTeams.forEach(t => {
        selectHtml += `<option value="${t.id}">${t.name_by_leader || t.name}</option>`;
    });
    selectHtml += '</select></div>';
    
    document.getElementById('interactDesc').innerHTML = selectHtml;
    document.getElementById('interactButtons').innerHTML = 
        `<button class="start-button" onclick="window.performSpyAction()">🔍 СКАНИРОВАТЬ</button>
         <button class="secondary" style="margin-top: 10px;" onclick="window.closeModal('interactionModal')">ОТМЕНА</button>`;
    
    modal.classList.remove('hidden');
};

window.performSpyAction = async () => {
    const targetId = document.getElementById('spyTargetSelect').value;
    const descEl = document.getElementById('interactDesc');
    
    descEl.innerHTML = `<div class="tent-waiting"><div class="loader-spinner"></div><p>Взлом...</p></div>`;
    document.getElementById('interactButtons').innerHTML = '';
    
    await new Promise(r => setTimeout(r, 1000));
    const data = await Core.getEnemyInventory(targetId);
    
    if (!data) {
        descEl.innerHTML = `<p style="color:red;">❌ Ошибка соединения.</p>`;
        document.getElementById('interactButtons').innerHTML = `<button class="start-button" onclick="window.closeModal('interactionModal')">ЗАКРЫТЬ</button>`;
        return;
    }

    let invHtml = `<h4>🎒 Инвентарь: ${data.name_by_leader || data.name}</h4><ul class="inventory-list" style="max-height:200px;overflow-y:auto;">`;
    const inv = data.inventory || {};
    let hasItems = false;
    
    Object.keys(inv).forEach(itemId => {
        if (inv[itemId] > 0) {
            hasItems = true;
            const item = Core.state.globalItems[itemId];
            const name = item ? item.name : '???';
            invHtml += `<li><span>${name}</span> <span>x${inv[itemId]}</span></li>`;
        }
    });
    if(!hasItems) invHtml += `<li>Пусто...</li>`;
    invHtml += `</ul>`;
    
    descEl.innerHTML = invHtml;
    document.getElementById('interactButtons').innerHTML = `<button class="start-button" onclick="window.closeModal('interactionModal')">ЗАКРЫТЬ</button>`;
};

// --- Trade Logic ---
window.openTradeModal = () => {
    const modal = document.getElementById('tradeModal');
    const targetSelect = document.getElementById('tradeTargetTeam');
    const offerSelect = document.getElementById('tradeOfferSelect');
    const requestSelect = document.getElementById('tradeRequestSelect');

    targetSelect.innerHTML = '';
    Core.state.otherTeams.forEach(t => {
        targetSelect.innerHTML += `<option value="${t.id}">${t.name_by_leader || t.name}</option>`;
    });

    offerSelect.innerHTML = '';
    const myInv = Core.state.currentTeam.inventory || {};
    let hasOffer = false;
    Object.keys(myInv).forEach(id => {
        if(myInv[id] > 0) {
            hasOffer = true;
            const item = Core.state.globalItems[id];
            offerSelect.innerHTML += `<option value="${id}">${item ? item.name : '???'}</option>`;
        }
    });
    if(!hasOffer) offerSelect.innerHTML = '<option disabled selected>Пусто...</option>';

    requestSelect.innerHTML = '';
    Object.values(Core.state.globalItems).forEach(item => {
        requestSelect.innerHTML += `<option value="${item.id}">${item.name}</option>`;
    });

    modal.classList.remove('hidden');
};

window.sendTradeRequest = async () => {
    const targetId = document.getElementById('tradeTargetTeam').value;
    const offerId = document.getElementById('tradeOfferSelect').value;
    const requestId = document.getElementById('tradeRequestSelect').value;
    if (!targetId || !offerId || !requestId) return alert("Заполните все поля!");

    const res = await Core.sendTradeRequest(targetId, offerId, requestId);
    if (res.success) {
        alert("✅ Предложение отправлено!");
        window.closeModal('tradeModal');
    } else {
        alert("❌ Ошибка: " + res.msg);
    }
};

window.openIncomingTrades = async () => {
    const list = document.getElementById('incomingTradesList');
    list.innerHTML = 'Загрузка...';
    document.getElementById('incomingTradesModal').classList.remove('hidden');

    const trades = await Core.fetchIncomingTrades();
    list.innerHTML = '';
    if (!trades || trades.length === 0) {
        list.innerHTML = '<p class="muted">Нет входящих.</p>';
        return;
    }

    trades.forEach(t => {
        const off = Core.state.globalItems[t.offer_item_id]?.name || '???';
        const req = Core.state.globalItems[t.request_item_id]?.name || '???';
        list.innerHTML += `
            <div class="incoming-trade-card">
                <p><b>${t.from_team_name}</b></p>
                <p>Дают: ${off} | Просят: ${req}</p>
                <button onclick="window.acceptTrade(${t.id})">✅</button>
                <button onclick="window.rejectTrade(${t.id})">❌</button>
            </div>`;
    });
};

window.acceptTrade = async (id) => {
    const res = await Core.respondToTrade(id, true);
    if(res.success) { alert("Обмен успешен!"); window.openIncomingTrades(); Core.refreshTeamData(); renderGameInterface(); }
    else alert(res.msg);
};

window.rejectTrade = async (id) => {
    await Core.respondToTrade(id, false);
    window.openIncomingTrades();
};

// --- Craft Logic ---
window.openCraftModal = () => {
    if(Core.state.me.role !== 'Explorer') return alert("Только Исследователь!");
    renderCraftUI();
    document.getElementById('craftModal').classList.remove('hidden');
};

function renderCraftUI() {
    const container = document.getElementById('craftRecipesList');
    container.innerHTML = '';
    Core.CRAFT_RECIPES.forEach(recipe => {
        const resultItem = Core.state.globalItems[recipe.resultId];
        if (!resultItem) return;
        
        let canCraft = true;
        let ingHtml = '';
        recipe.ingredients.forEach(ing => {
            const has = (Core.state.currentTeam.inventory || {})[ing.id] || 0;
            if (has < ing.count) canCraft = false;
            const item = Core.state.globalItems[ing.id];
            ingHtml += `<div class="${has < ing.count ? 'missing' : ''}">${item.emoji} ${has}/${ing.count}</div>`;
        });

        container.innerHTML += `
            <div class="craft-recipe">
                <div class="recipe-header"><b>${recipe.name}</b></div>
                <div class="recipe-row">${ingHtml} ➔ ${resultItem.emoji}</div>
                <button class="start-button" ${!canCraft ? 'disabled' : ''} onclick="window.doCraft(${recipe.id})">СОЗДАТЬ</button>
            </div>`;
    });
}

window.doCraft = async (rid) => {
    const res = await Core.craftItemLogic(rid);
    if(res.success) { alert(`Создано: ${res.itemName}`); renderCraftUI(); renderGameInterface(); }
    else alert(res.msg);
};

// --- Final Lock Logic ---
window.openFinalLockModal = (requirements) => {
    const grid = document.getElementById('finalItemsGrid');
    const btn = document.getElementById('btnActivateFinal');
    grid.innerHTML = '';
    
    let allCollected = true;
    const inv = Core.state.currentTeam.inventory || {};

    // FIX: Replaced for..of with Object.keys.forEach
    Object.keys(requirements).forEach(itemId => {
        const countNeeded = requirements[itemId];
        const item = Core.state.globalItems[itemId];
        const has = inv[itemId] || 0;
        if (has < countNeeded) allCollected = false;
        
        const slot = document.createElement('div');
        slot.className = `lock-item-slot ${has >= countNeeded ? 'collected' : 'missing'}`;
        slot.innerHTML = renderItemIcon(item);
        grid.appendChild(slot);
    });

    btn.disabled = !allCollected;
    document.getElementById('finalLockStatus').textContent = allCollected ? 'ГОТОВО!' : 'Соберите предметы!';
    document.getElementById('finalLockModal').classList.remove('hidden');
};

window.tryActivateFinal = () => {
    document.getElementById('finalLockModal').classList.add('hidden');
    renderMarkers(); 
    alert("Проверка завершена. Если все условия выполнены, задание откроется!");
};

// =======================================================
// ===== SECTION 7: TIMERS & WIN/LOSS LOGIC =====
// =======================================================

// --- Timer "Last Chance" ---
async function checkGlobalWinCondition() {
    if (isTeamVictorious()) {
        if (!State.hasShownVictory) window.showVictoryModal();
        return;
    }

    let storedEndTime = sessionStorage.getItem('lastChanceEndTime');

    if (!storedEndTime) {
        if (sessionStorage.getItem(LAST_CHANCE_FORCED_FLAG) === 'true') {
            const forcedTime = Date.now() + CONFIG.LAST_CHANCE_DURATION_MS;
            sessionStorage.setItem('lastChanceEndTime', forcedTime);
            storedEndTime = forcedTime;
        } else {
            // Check server for 2 winning teams
            try {
                const globalState = await Core.fetchGlobalGameState();
                const winners = globalState.filter(team => {
                    const finalId = CONFIG.FINAL_TASK_IDS[team.id];
                    return (team.tasks || []).find(t => t.id === finalId && t.completed);
                });

                if (winners.length >= 2) {
                    const newEndTime = Date.now() + CONFIG.LAST_CHANCE_DURATION_MS;
                    sessionStorage.setItem('lastChanceEndTime', newEndTime);
                    storedEndTime = newEndTime;
                }
            } catch (e) { console.error(e); }
        }
    }

    if (storedEndTime) {
        State.lastChanceActive = true;
        const remaining = parseInt(storedEndTime, 10) - Date.now();
        const timerBox = document.getElementById('lastChanceTimer');
        
        if (remaining > 0) {
            const m = Math.floor(remaining / 60000);
            const s = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
            document.getElementById('timerCountdown').textContent = `${m}:${s}`;
            if(timerBox) timerBox.classList.remove('hidden');
        } else {
            if(timerBox) timerBox.classList.add('hidden');
            if (!isTeamVictorious()) window.showLostModal();
        }
    }
}

function isTeamVictorious() {
    if (!Core.state.currentTeam || !Core.state.currentTeam.tasks) return false;
    return Core.state.currentTeam.tasks
        .filter(t => CONFIG.MAIN_MISSION_IDS.includes(t.id))
        .every(t => t.completed);
}

// --- Modals ---
window.showVictoryModal = () => {
    document.getElementById('endTitle').textContent = "🎉 ПОБЕДА! ВЫ СПАСЛИ РОЖДЕСТВО!";
    document.getElementById('endMessage').textContent = "Вы выполнили все основные миссии и собрали все необходимые предметы! Срочно идите к организаторам в Палатка №409 (ФИНАЛ) для финального поощрения!";
    document.getElementById('endGameModal').classList.remove('hidden');
    State.hasShownVictory = true;
};

window.showLostModal = () => {
    document.getElementById('endTitle').textContent = "❌ ВРЕМЯ ИСТЕКЛО";
    document.getElementById('endMessage').textContent = "К сожалению, время, отведенное на квест, закончилось. Вы не успели спасти Рождество. Пожалуйста, пройдите к организаторам.";
    document.getElementById('endGameModal').classList.remove('hidden');
    document.getElementById('timerCountdown').textContent = "00:00";
};

window.forceLastChance = () => {
    sessionStorage.setItem(LAST_CHANCE_FORCED_FLAG, 'true');
    document.getElementById('btnForceLastChance')?.classList.add('hidden');
    alert("Таймер 'Последний Шанс' активирован вручную!");
};

// --- Freeze Logic ---
function checkFreezeState() {
    const freezeUntil = Core.state.currentTeam?.frozen_until;
    if (freezeUntil && new Date(freezeUntil) > new Date() && !State.freezeTimerInterval) {
        document.getElementById('freezeOverlay').classList.remove('hidden');
        document.body.classList.add('frozen-mode');
        State.freezeTimerInterval = setInterval(() => {
            const rem = new Date(freezeUntil) - Date.now();
            if (rem <= 0) {
                clearInterval(State.freezeTimerInterval);
                State.freezeTimerInterval = null;
                document.getElementById('freezeOverlay').classList.add('hidden');
                document.body.classList.remove('frozen-mode');
                Core.updateTeam({ frozen_until: null });
                alert("🎉 РАЗМОРОЗКА!");
            } else {
                const m = Math.floor(rem / 60000).toString().padStart(2, '0');
                const s = Math.floor((rem % 60000) / 1000).toString().padStart(2, '0');
                document.getElementById('freezeCountdown').textContent = `${m}:${s}`;
            }
        }, 1000);
    }
}

window.handleQuizFailure = async (teamId) => {
    await Core.updateTeamFreezeStatus(teamId, 2 * 60 * 1000);
    if (teamId === Core.state.me.team_id) { 
        await Core.refreshTeamData(); 
        alert("❌ Провал! Заморозка на 2 мин."); 
    }
};

// =======================================================
// ===== SECTION 8: EFFECTS & EXPORTS =====
// =======================================================
// 
function createSnowEffect() {
    const cvs = document.getElementById('snowCanvas'); 
    if(!cvs) return;
    const ctx = cvs.getContext('2d');
    let W = window.innerWidth, H = window.innerHeight;
    const resize = () => { W=cvs.width=window.innerWidth; H=cvs.height=window.innerHeight; };
    window.addEventListener('resize', resize);
    resize();
    const flakes = Array.from({length: 50}, () => ({x: Math.random()*W, y: Math.random()*H, r: Math.random()*2+1, d: Math.random()+0.5}));
    
    function draw() {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
        ctx.beginPath();
        // FIX: Replaced for..of with standard for loop
        for(let i = 0; i < flakes.length; i++) {
            let f = flakes[i];
            ctx.moveTo(f.x, f.y);
            ctx.arc(f.x, f.y, f.r, 0, Math.PI*2, true);
        }
        ctx.fill();
        // FIX: Replaced for..of with standard for loop
        for(let i = 0; i < flakes.length; i++) {
            let f = flakes[i];
            f.y += Math.pow(f.d, 2) + 1;
            if(f.y > H) Object.assign(f, {x: Math.random()*W, y: 0});
        }
        requestAnimationFrame(draw);
    }
    draw();
}

// Bind to window for HTML calls
Object.assign(window, {
    startChallenge: Games.startChallenge,
    handleGameMove: Games.handleGameMove,
    handleBingoClick: Games.handleBingoClick,
    handleSequentialAnswer: (id, ans) => State.MissionLogic.handleSequentialAnswer?.(id, ans),
    handleBulkSubmit: (id, answers) => State.MissionLogic.handleBulkSubmit?.(id, answers),
    handleSecretWordSubmit: (id) => State.MissionLogic.handleSecretWordSubmit?.(id),
    handleItemUse: window.handleItemUse,
    
    // UI Helpers
    closeModal: (id) => document.getElementById(id).classList.add('hidden'),
    openItemsGuide: () => {
        document.getElementById('itemsGuideModal').classList.remove('hidden');
        const tbody = document.querySelector('#itemsGuideModal tbody');
        tbody.innerHTML = Object.values(Core.state.globalItems).map(i => 
            `<tr><td style="font-size:2rem;">${i.emoji}</td><td><h4>${i.name}</h4><p>${i.description || ''}</p></td></tr>`
        ).join('');
    },
    closeItemsGuide: () => document.getElementById('itemsGuideModal').classList.add('hidden'),
    
    // Exports
    renderGameInterface, renderMarkers, showPopup, showMissionPopup, 
    openTradeModal, sendTradeRequest, openIncomingTrades, acceptTrade, rejectTrade,
    openCraftModal, doCraft,
    openSpyModal, performSpyAction,
    openFinalLockModal, tryActivateFinal,
    handleScavengeInteraction, spawnSnowPile,
    forceLastChance, showVictoryModal, showLostModal, handleQuizFailure
});

// Start
initGame().catch(console.error);