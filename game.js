import * as Core from './core.js'; 
import * as Games from './games.js'; 

// Глобальная переменная для хранения логики миссий
let MissionLogic = {}; 

// =======================================================
// ===== I. CONFIG & GLOBAL STATE =====
// =======================================================
const TEAMS_UI_CONFIG = {
    101: { color: '#8be9fd', symbol: '❄️' },
    102: { color: '#ff5555', symbol: '🔴' },
    103: { color: '#f1fa8c', symbol: '💡' },
    104: { color: '#bd93f9', symbol: '🎅' },
};
window.TEAMS_UI_CONFIG = TEAMS_UI_CONFIG;

const TELEGRAM_GROUP_LINK = 'https://t.me/stuttgart_quest_group'; 
const MAX_SNOW_PILES = 1; 
const LAST_CHANCE_DURATION_MS = 5 * 60 * 1000; // 5 минут для режима "Последний шанс"

window.TELEGRAM_GROUP_LINK = TELEGRAM_GROUP_LINK;

// --- ПОРЯДОК МИССИЙ ---
const TEAM_MISSION_SEQUENCES = {
    101: [3, 4, 1, 2, 5, 6],
    102: [10, 14, 12, 11, 13, 15],
    103: [2, 4, 5, 3, 1, 6],
    104: [14, 11, 10, 13, 12, 15]
};

const VALID_TASK_IDS = {
    101: [1, 2, 3, 4, 5, 6],
    103: [1, 2, 3, 4, 5, 6],
    102: [10, 11, 12, 13, 14, 15],
    104: [10, 11, 12, 13, 14, 15],
};
const MAIN_MISSION_IDS = [1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 14, 15]; 

// --- ФИНАЛЬНЫЕ УСЛОВИЯ ---
const FINAL_ITEM_REQUIREMENTS = {
    101: { 1: 1, 3: 1, 5: 1, 7: 1, 9: 1 }, 
    103: { 1: 1, 3: 1, 6: 1, 7: 1, 9: 1 }, 
    102: { 2: 1, 4: 1, 6: 1, 8: 1, 10: 1 }, 
    104: { 1: 1, 2: 1, 3: 1, 8: 1, 10: 1 }, 
};

// --- DYNAMIC STATE ---
let map = null;
let mapMarkers = {};
let wasFrozen = false;
let hasShownVictory = false;
let staticMapPoints = []; 
let dynamicSnowPiles = []; 
let lastScavengeTime = Number(localStorage.getItem('lastScavengeTime')) || 0; 
window.selectedAnswers = {}; 

// --- TIMERS ---
let lastChanceActive = false;
let lastChanceEndTime = 0;
const LAST_CHANCE_FORCED_FLAG = 'lastChanceForced'; 
let freezeTimerInterval = null;

// =======================================================
// ===== II. INITIALIZATION & SETUP =====
// =======================================================

function assignGlobalFunctions() {
    // Функции игр
    window.startChallenge = Games.startChallenge;
    window.handleGameMove = Games.handleGameMove;
    window.handleBingoClick = Games.handleBingoClick;

    // Функции миссий
    if (MissionLogic) {
        if(MissionLogic.handleSequentialAnswer) window.handleSequentialAnswer = MissionLogic.handleSequentialAnswer;
        if(MissionLogic.handleBulkSubmit) window.handleBulkSubmit = MissionLogic.handleBulkSubmit;
        if(MissionLogic.handleSecretWordSubmit) window.handleSecretWordSubmit = MissionLogic.handleSecretWordSubmit;
        
        // Переопределяем функцию открытия финала на games.js
        MissionLogic.openTicTacToeModal = () => {
            const teamId = Core.state.me.team_id;
            const gameType = (teamId === 101 || teamId === 103) ? 'tictactoe' : 'bingo';
            Games.openGameChallengeModal(gameType);
        };
    }
}

async function initGame() {
    const player = await Core.authPlayer();
    if (!player) return alert("Ошибка входа! Игрок не найден.");

    const teamId = Core.state.me.team_id;
    try {
        if (teamId === 101 || teamId === 103) {
            MissionLogic = await import('./missions_101_103.js');
        } else if (teamId === 102 || teamId === 104) {
            MissionLogic = await import('./missions_102_104.js');
        }
        assignGlobalFunctions(); 
    } catch (e) {
        console.error("Ошибка загрузки MissionLogic:", e);
    }

    document.getElementById('myNameHeader').textContent = Core.state.me.name;
    document.getElementById('myPlayerRole').textContent = Core.ROLES_DATA[Core.state.me.role] || Core.state.me.role;
    
    // UI Кнопок
    if (Core.state.me.role === 'Spy') document.getElementById('btnSpyAction')?.classList.remove('hidden'); 
    if (Core.state.me.role === 'Scavenger') document.getElementById('btnScavenge')?.classList.remove('hidden');
    if (Core.state.me.role === 'Guardian') document.getElementById('btnGuardianWarm')?.classList.remove('hidden'); 
    if (['leader', 'Negotiator'].includes(Core.state.me.role)) {
        document.getElementById('btnShowTrades')?.classList.remove('hidden');
    }
    if (Core.state.me.role === 'leader') {
        document.getElementById('btnForceLastChance')?.classList.remove('hidden');
    }

    staticMapPoints = await Core.fetchStaticMapPoints();
    await Core.fetchAllTeamsData();
    await Core.refreshTeamData();
    
    initMapLogic();
    renderGameInterface();
    createSnowEffect();
    startSnowPileSpawning(); 
    
    if (sessionStorage.getItem(LAST_CHANCE_FORCED_FLAG) === 'true') {
        lastChanceActive = true;
    }
    setInterval(checkGlobalWinCondition, 1000); 

    Core.setupRealtimeListeners(
        async (newTeam, oldTeam) => {
            Object.assign(Core.state.currentTeam, newTeam);
            renderGameInterface();
        },
        (updatedTeam) => { renderMarkers(); }
    );

    if(['leader', 'Negotiator'].includes(Core.state.me.role)) Core.clearTentStatus();
}

// =======================================================
// ===== III. UI RENDERING =====
// =======================================================

function renderGameInterface() {
    if(!Core.state.currentTeam) return;

    const uiCfg = TEAMS_UI_CONFIG[Core.state.currentTeam.id] || {symbol: '🎄'};
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
            
            let iconHtml = (item.emoji && item.emoji.startsWith('http')) 
                ? `<img src="${item.emoji}" alt="${item.name}" style="width: 32px; height: 32px; object-fit: contain;">` 
                : `<span style="font-size:1.5rem">${item.emoji}</span>`;

            if (item.type === 'gadget' && Core.state.me.role === 'Saboteur') {
                const now = Date.now();
                const remaining = Core.GADGET_COOLDOWN_MS - (now - Core.state.lastGadgetUsage);
                const disabled = remaining > 0 ? 'disabled' : '';
                const cooldownText = remaining > 0 ? `(${Math.ceil(remaining / 1000)}с)` : '';
                actionBtn = `<button class="btn-use" ${disabled} onclick="window.handleItemUse(${id})">USE ${cooldownText}</button>`;
            } else if (item.type === 'gadget') {
                actionBtn = `<span style="font-size:0.7rem; opacity:0.5;">(Гаджет)</span>`;
            }

            list.innerHTML += `
            <li>
                <div style="display:flex;align-items:center;gap:10px; flex-grow: 1;">
                    ${iconHtml} 
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
    
    allTasks.sort((a, b) => {
        const idxA = sequence.indexOf(a.id);
        const idxB = sequence.indexOf(b.id);
        return idxA - idxB;
    });

    const activeIndex = allTasks.findIndex(t => !t.completed);
    const visibleTasks = activeIndex === -1 ? allTasks : allTasks.slice(0, activeIndex + 1);

    let completedCount = 0;
    visibleTasks.forEach(task => {
        if(task.completed) completedCount++;
        const isChecked = task.completed ? 'checked disabled' : ''; 
        const reward = task.reward_item_id ? (Core.state.globalItems[task.reward_item_id]?.emoji || '🎁') : '';
        
        tbody.innerHTML += `
            <tr class="${task.completed ? 'task-row completed' : 'task-row'}">
                <td style="text-align:center; width:30px;"><input type="checkbox" ${isChecked} onclick="return false;"></td>
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
    const countEl = document.getElementById('myTeamMembersCount');
    list.innerHTML = '';
    countEl.textContent = Core.state.teamMembers.length;

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

// =======================================================
// ===== IV. MAP & MARKERS =====
// =======================================================

function initMapLogic() {
    if (map) map.remove();
    map = L.map('interactiveMap', { crs: L.CRS.Simple, minZoom: -2, maxZoom: 2, zoomControl: false, attributionControl: false });
    const bounds = [[0, 0], [1500, 2000]];
    L.imageOverlay('map.png', bounds).addTo(map);
    map.fitBounds(bounds);
    map.on('click', () => window.closeModal('interactionModal'));

    renderMarkers();
    setInterval(() => {
        Core.state.otherTeams.forEach(t => {
            t.x = Math.max(10, Math.min(90, t.x + (Math.random() - 0.5) * 2)); 
            t.y = Math.max(10, Math.min(90, t.y + (Math.random() - 0.5) * 2));
        });
        renderMarkers();
    }, 3000);
}

function findActiveMission(tasks) {
    if (!tasks || tasks.length === 0) return null;
    const teamId = Core.state.me.team_id;
    const sequence = TEAM_MISSION_SEQUENCES[teamId];
    if (!sequence) return null;

    let activeTask = null;
    for (const id of sequence) {
        const task = tasks.find(t => t.id === id);
        if (task && !task.completed) {
            activeTask = task;
            break;
        }
    }

    const finalMissionId = (teamId === 101 || teamId === 103) ? 6 : 15;
    if (activeTask && activeTask.id === finalMissionId) {
        const requiredItems = FINAL_ITEM_REQUIREMENTS[teamId];
        const inventory = Core.state.currentTeam.inventory || {};
        let requirementsMet = true;
        for (const itemId in requiredItems) {
            if ((inventory[itemId] || 0) < requiredItems[itemId]) {
                requirementsMet = false;
                break;
            }
        }
        if (!requirementsMet) {
            const stallName = (teamId === 101 || teamId === 103) ? 'Палатка №409 (ФИНАЛ)' : 'Палатка №325 (ФИНАЛ)';
            return {
                id: 'mission_locked', type: 'final_lock', 
                x: staticMapPoints.find(p => p.title === stallName)?.x || 50,
                y: staticMapPoints.find(p => p.title === stallName)?.y || 50,
                title: '🔒 ФИНАЛ ЗАБЛОКИРОВАН', 
                desc: 'Соберите все финальные предметы!', icon: '🔒', requiredItems: requiredItems 
            };
        }
    }

    if (!activeTask) return null; 
    let pathKey = (teamId === 101 || teamId === 103) ? '101_103' : '102_104';
    const missionStep = Core.MISSION_PATH_STRUCTURE[pathKey]?.find(p => p.taskId === activeTask.id);
    if (!missionStep) return null;

    const activeStall = staticMapPoints.find(p => p.title === missionStep.stallName);
    if (activeStall) {
        return {
            id: 'mission_active', type: 'mission_stall', x: activeStall.x, y: activeStall.y, 
            title: activeStall.title, desc: activeStall.desc, taskId: activeTask.id, taskText: activeTask.text,
        };
    }
    return null; 
}

function renderMarkers() {
    if(!map) return;
    Object.keys(mapMarkers).forEach(id => { if (id !== 'me') { mapMarkers[id].remove(); delete mapMarkers[id]; } });
    
    const mission = findActiveMission(Core.state.currentTeam.tasks);
    staticMapPoints.forEach(item => {
        if (mission && item.title === mission.title) return;
        if (item.type === 'tent' || item.type === 'npc') updateMarker(item.id, item.type, item.x, item.y, item.title, item, item.icon);
    });
    if (mission) updateMarker(mission.id, mission.type, mission.x, mission.y, mission.title, mission, '🎯');
    
    dynamicSnowPiles.forEach(item => updateMarker(item.id, 'snow_pile', item.x, item.y, item.title, item, '🧤'));
    
    Core.state.otherTeams.forEach(t => {
        const isFrozen = t.frozen_until && new Date(t.frozen_until) > new Date();
        updateMarker('team_'+t.id, 'team', t.x, t.y, isFrozen ? `🧊 ${t.name}` : t.name, { title: t.name, desc: `Игроков: ${t.playerCount}` }, TEAMS_UI_CONFIG[t.id]?.symbol);
    });
    updateMarker('me', 'me', 50, 85, 'Я', {title:'Вы', desc:'Ваша позиция'});
}

function updateMarker(id, type, x, y, label, data, customSymbol) {
    const loc = [1500 - ((y / 100) * 1500), (x / 100) * 2000];
    let symbol = (type === 'tent') ? '⛺' : (type === 'npc') ? '👤' : (type === 'mission_stall') ? '🎯' : (type === 'snow_pile') ? '❄️' : (type === 'me') ? '🔴' : '📍';
    if(customSymbol) symbol = customSymbol;
    const html = `<div class="marker ${type}"><div class="pin"><div>${symbol}</div></div><div class="label">${label}</div></div>`;
    const icon = L.divIcon({ className: 'custom-leaflet-icon', html: html, iconSize: [40, 60], iconAnchor: [20, 50] });

    if (mapMarkers[id]) mapMarkers[id].setLatLng(loc);
    else {
        const m = L.marker(loc, {icon: icon}).addTo(map);
        m.on('click', (e) => { 
            L.DomEvent.stopPropagation(e); 
            if (type === 'final_lock') window.openFinalLockModal(data.requiredItems);
            else if (type === 'mission_stall') showMissionPopup(data); 
            else showPopup(data, type, id); 
            setTimeout(() => { map.flyTo(loc, map.getZoom()); }, 50); 
        });
        mapMarkers[id] = m;
    }
}

// =======================================================
// ===== V. INTERACTIONS & LOGIC =====
// =======================================================

// --- SNOW & SCAVENGE ---
function startSnowPileSpawning() {
    window.spawnSnowPile = () => {
        if (dynamicSnowPiles.length >= MAX_SNOW_PILES) return;
        const newPile = {
            id: `snow_${Date.now()}`, type: 'snow_pile',
            x: 20 + Math.random() * 60, y: 20 + Math.random() * 60,
            title: 'Сугроб', desc: 'Кладоискатель может поискать здесь ресурсы.',
        };
        dynamicSnowPiles.push(newPile);
        renderMarkers();
    };
    window.spawnSnowPile();
}

window.handleScavengeInteraction = async (snowPileId) => {
    if (Core.state.me.role !== 'Scavenger') return alert("Это могут делать только Кладоискатели!");
    const now = Date.now();
    if (now - lastScavengeTime < Core.SCAVENGER_COOLDOWN_MS) {
        const remaining = Math.ceil((Core.SCAVENGER_COOLDOWN_MS - (now - lastScavengeTime)) / 1000);
        return alert(`⏳ Перезарядка. Ждите ${remaining} сек.`);
    }

    const modal = document.getElementById('interactionModal');
    const descEl = document.getElementById('interactDesc');
    const btns = document.getElementById('interactButtons');
    const originalDesc = descEl.innerHTML;
    
    descEl.innerHTML = `<div class="tent-waiting"><div class="loader-spinner"></div><p>Идет поиск...</p></div>`;
    btns.innerHTML = `<button class="secondary" disabled>ИДЕТ ПОИСК</button>`;
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    const result = await Core.scavengeItemLogic();
    
    if (result.success) {
        lastScavengeTime = now;
        localStorage.setItem('lastScavengeTime', now);
        
        dynamicSnowPiles = dynamicSnowPiles.filter(p => p.id !== snowPileId);
        if (mapMarkers[snowPileId]) { mapMarkers[snowPileId].remove(); delete mapMarkers[snowPileId]; }
        setTimeout(() => { window.spawnSnowPile(); }, 120000); // 2 минуты

        descEl.innerHTML = `<div style="text-align:center;"><h3>РЕЗУЛЬТАТ</h3><p>${result.message}</p></div>`;
        btns.innerHTML = `<button class="start-button" onclick="window.closeModal('interactionModal');">Готово</button>`;
        await Core.refreshTeamData(); 
        renderGameInterface();
    } else {
        alert(result.message);
        descEl.innerHTML = originalDesc;
    }
}

// --- POPUPS & ROUTING ---
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
        iconEl.innerHTML = '⛺';
        if (['leader', 'Negotiator'].includes(Core.state.me.role)) {
            descEl.innerHTML += `<p style="margin-top:15px; font-size:1rem; color:var(--accent-gold);">
                                 Используйте кнопку <span style="font-weight:bold; color:var(--accent-ice);">"ВХОДЯЩИЕ 💛"</span>
                                 и кнопку "ПРЕДЛОЖИТЬ ОБМЕН" на этой карте.</p>`;
            btns.innerHTML = `<button class="start-button" onclick="window.openTradeModal()">ПРЕДЛОЖИТЬ ОБМЕН</button>
                              <button class="secondary" style="margin-top: 10px;" onclick="window.closeModal('interactionModal')">ЗАКРЫТЬ</button>`;
        } else {
            descEl.innerHTML += `<br><br><span class="muted" style="color:#ff5555">Только Лидер или Переговорщик могут инициировать обмен.</span>`;
            btns.innerHTML = `<button class="start-button" onclick="window.closeModal('interactionModal')">ЗАКРЫТЬ</button>`;
        }
    } else if (type === 'npc') {
        iconEl.innerHTML = item.icon || '👤';
        btns.innerHTML = `<button class="start-button" onclick="window.closeModal('interactionModal')">ЗАКРЫТЬ</button>`;
    } else if (type === 'snow_pile') {
        const isScavenger = Core.state.me.role === 'Scavenger';
        const now = Date.now();
        const remaining = Core.SCAVENGER_COOLDOWN_MS - (now - lastScavengeTime);
        const disabled = remaining > 0 || !isScavenger ? 'disabled' : '';
        const cooldownText = remaining > 0 ? `(${Math.floor(remaining / 1000)}с)` : (isScavenger ? '' : '(Только Кладоискатель)');

        iconEl.innerHTML = '🧤'; 
        descEl.innerHTML += `<p style="margin-top:10px; font-size:0.9rem; color:var(--text-muted);">Искать можно раз в 1м 50с.</p>`;
        btns.innerHTML = `<button class="start-button" ${disabled} onclick="window.handleScavengeInteraction('${id}')">ИСКАТЬ ${cooldownText}</button>`;
    } else {
        btns.innerHTML = `<button class="start-button" onclick="window.closeModal('interactionModal')">ЗАКРЫТЬ</button>`;
    }
    
    modal.classList.remove('hidden');
}

function showMissionPopup(missionData) {
    const modal = document.getElementById('interactionModal');
    const titleEl = document.getElementById('interactTitle');
    const descEl = document.getElementById('interactDesc');
    const btns = document.getElementById('interactButtons');
    const iconEl = document.getElementById('interactIcon');

    titleEl.textContent = missionData.title;
    iconEl.innerHTML = '🎯';
    
    descEl.innerHTML = `<p style="font-size: 1.1rem; color: var(--accent-gold); margin-bottom: 15px;">${missionData.taskText}</p><p class="muted">Вы на месте. Чтобы начать, нажмите кнопку ниже.</p>`;
    
    let buttonAction = `window.routeTaskToModal(${missionData.taskId}); window.closeModal('interactionModal');`;
    let buttonText;
    const logicId = missionData.taskId > 6 ? missionData.taskId - 9 : missionData.taskId;
    const isGroup101 = Core.state.me.team_id === 101 || Core.state.me.team_id === 103;
    let isQuiz = false;
    let isFinalGame = logicId === 6;

    if (isGroup101) isQuiz = (logicId === 1 || logicId === 4);
    else isQuiz = (logicId === 2); 

    if (isQuiz) buttonText = `ПЕРЕЙТИ К ЗАДАНИЮ ${missionData.taskId} (Викторина)`;
    else if (isFinalGame) buttonText = `ПЕРЕЙТИ К ЗАДАНИЮ ${missionData.taskId} (Финал)`;
    else buttonText = `ПЕРЕЙТИ К ЗАДАНИЮ ${missionData.taskId} (Секретное слово)`;
    
    btns.innerHTML = `<button class="start-button" onclick="${buttonAction}">${buttonText}</button>`;
    modal.classList.remove('hidden');
}

window.routeTaskToModal = (taskId) => {
    if (Core.state.me.role !== 'leader') return alert("Только лидер может запускать задания!");
    // Перехват финального задания
    const logicId = taskId > 6 ? taskId - 9 : taskId;
    if (logicId === 6) {
        const teamId = Core.state.me.team_id;
        const gameType = (teamId === 101 || teamId === 103) ? 'tictactoe' : 'bingo';
        Games.openGameChallengeModal(gameType);
        return;
    }
    if (MissionLogic && MissionLogic.routeTaskToModal) {
        MissionLogic.routeTaskToModal(taskId);
    }
};

// --- SPY, ITEM USE, CRAFT ---

// 🕵️ НОВАЯ ЛОГИКА ШПИОНА
window.openSpyModal = () => {
    if (Core.state.me.role !== 'Spy') return alert("Доступно только Шпиону!");
    
    // Используем универсальное модальное окно
    const modal = document.getElementById('interactionModal');
    const titleEl = document.getElementById('interactTitle');
    const descEl = document.getElementById('interactDesc');
    const btns = document.getElementById('interactButtons');
    const iconEl = document.getElementById('interactIcon');

    // Настраиваем заголовки
    titleEl.textContent = "🕵️ ШПИОНАЖ";
    iconEl.innerHTML = "🕵️‍♂️";
    
    // Генерируем выпадающий список команд (кроме своей)
    let selectHtml = `
        <div style="margin-bottom:15px; text-align:left;">
            <p class="muted" style="margin-bottom:10px;">Выберите команду для взлома базы данных:</p>
            <label class="label-accent">Цель:</label>
            <select id="spyTargetSelect" class="modal-input">
    `;
    
    Core.state.otherTeams.forEach(t => {
        // Отображаем имя (либо лидерское, либо дефолтное)
        selectHtml += `<option value="${t.id}">${t.name_by_leader || t.name}</option>`;
    });
    selectHtml += '</select></div>';

    descEl.innerHTML = selectHtml;
    
    // Кнопки действий
    btns.innerHTML = `
        <button class="start-button" onclick="window.performSpyAction()">🔍 СКАНИРОВАТЬ ИНВЕНТАРЬ</button>
        <button class="secondary" style="margin-top: 10px;" onclick="window.closeModal('interactionModal')">ОТМЕНА</button>
    `;

    modal.classList.remove('hidden');
};

// Функция выполнения сканирования (вызывается по кнопке)
window.performSpyAction = async () => {
    const select = document.getElementById('spyTargetSelect');
    if (!select) return;
    const targetId = select.value;
    
    const descEl = document.getElementById('interactDesc');
    const btns = document.getElementById('interactButtons');
    
    // 1. Показываем анимацию загрузки
    descEl.innerHTML = `<div class="tent-waiting"><div class="loader-spinner"></div><p>Взлом систем безопасности...</p></div>`;
    btns.innerHTML = ''; // Скрываем кнопки на время загрузки

    // Искусственная задержка для эффекта "работы" (1 секунда)
    await new Promise(r => setTimeout(r, 1000));

    // 2. Запрашиваем данные через Core
    const data = await Core.getEnemyInventory(targetId);
    
    if (!data) {
        descEl.innerHTML = `<p style="color:var(--accent-red); font-weight:bold;">❌ Ошибка соединения. Цель недоступна.</p>`;
        btns.innerHTML = `<button class="start-button" onclick="window.closeModal('interactionModal')">ЗАКРЫТЬ</button>`;
        return;
    }

    // 3. Формируем список предметов
    const targetName = data.name_by_leader || data.name || 'Цель';
    let invHtml = `<h4 style="color:var(--accent-gold); margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:5px;">🎒 Инвентарь: ${targetName}</h4>`;
    invHtml += `<ul class="inventory-list" style="max-height: 250px; overflow-y: auto; padding-right:5px;">`;
    
    const inv = data.inventory || {};
    let hasItems = false;
    
    // Проходим по всем предметам в инвентаре врага
    Object.keys(inv).forEach(itemId => {
        if (inv[itemId] > 0) {
            hasItems = true;
            const itemDef = Core.state.globalItems[itemId];
            const itemName = itemDef ? itemDef.name : 'Неизвестный предмет';
            
            // Логика отображения иконки (картинка или эмодзи)
            let iconDisplay = '📦';
            if (itemDef) {
                 if (itemDef.emoji && itemDef.emoji.startsWith('http')) {
                     iconDisplay = `<img src="${itemDef.emoji}" style="width:28px;height:28px;vertical-align:middle; object-fit:contain;">`;
                 } else {
                     iconDisplay = `<span style="font-size:1.2rem;">${itemDef.emoji}</span>`;
                 }
            }
            
            invHtml += `
            <li style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.05); background:rgba(0,0,0,0.2); margin-bottom:4px; border-radius:4px;">
                <div style="display:flex; align-items:center; gap:10px;">
                    ${iconDisplay}
                    <span>${itemName}</span>
                </div>
                <span class="inv-count" style="background:#444; color:#fff;">x${inv[itemId]}</span>
            </li>`;
        }
    });

    if (!hasItems) {
        invHtml += `<li class="muted" style="text-align:center; padding:20px;">Инвентарь пуст...</li>`;
    }
    invHtml += `</ul>`;

    // 4. Выводим результат
    descEl.innerHTML = invHtml;
    btns.innerHTML = `<button class="start-button" onclick="window.closeModal('interactionModal')">ЗАКРЫТЬ ОТЧЕТ</button>`;
};

window.handleItemUse = async (id) => {
    const now = Date.now();
    if(now - Core.state.lastGadgetUsage < Core.GADGET_COOLDOWN_MS) {
        const remaining = Math.ceil((Core.GADGET_COOLDOWN_MS - (now - Core.state.lastGadgetUsage)) / 1000);
        return alert(`Перезарядка: ${remaining} секунд.`);
    }
    if(id == 11) { 
        const targetId = prompt("ID цели (101-104):");
        const targetTeam = Core.state.otherTeams.find(t => t.id == targetId);
        if(!targetTeam) return alert("Неверный ID");
        if ((Core.state.currentTeam.inventory[id] || 0) < 1) return alert("Нет гаджета.");
        
        const res = await Core.useGadgetLogic(id, targetId); 
        if(res.success) {
            await Core.updateTeamFreezeStatus(targetId, 2 * 60 * 1000);
            if (targetId === Core.state.me.team_id) await Core.refreshTeamData(); 
            alert(`Успех! Команда ${targetTeam.name} заморожена.`);
        } else { alert(res.msg); }
        await Core.refreshTeamData(); 
        renderGameInterface();
    } else { alert("Гаджет не настроен."); }
};

window.openCraftModal = () => {
    if(Core.state.me.role !== 'Explorer') return alert("Только Исследователь!");
    window.closeModal('craftModal'); document.getElementById('craftModal').classList.remove('hidden'); renderCraftUI();
};

window.doCraft = async (rid) => {
    const res = await Core.craftItemLogic(rid);
    if(res.success) { alert(`Создано: ${res.itemName}`); renderCraftUI(); renderGameInterface(); }
    else alert(res.msg);
};

// --- GLOBAL EXPORTS ---
window.renderGameInterface = renderGameInterface;
window.renderMarkers = renderMarkers;
window.showPopup = showPopup;
window.showMissionPopup = showMissionPopup;
window.handleItemUse = window.handleItemUse; 
window.openTradeModal = window.openTradeModal;
window.sendTradeRequest = window.sendTradeRequest;
window.openIncomingTrades = window.openIncomingTrades;
window.acceptTrade = window.acceptTrade;
window.rejectTrade = window.rejectTrade;
window.closeIncomingTrades = () => window.closeModal('incomingTradesModal');
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');
window.openItemsGuide = () => { 
    window.closeModal('itemsGuideModal');
    document.getElementById('itemsGuideModal').classList.remove('hidden'); 
    const tbody = document.querySelector('#itemsGuideModal tbody');
    if (!tbody) return;
    tbody.innerHTML = Object.values(Core.state.globalItems).map(i => {
        const iconHtml = (i.emoji && i.emoji.startsWith('http')) ? `<img src="${i.emoji}" style="width:40px;">` : `${i.emoji || '❓'}`;
        return `<tr><td style="font-size:2rem;">${iconHtml}</td><td style="padding:10px;"><h4>${i.name}</h4><p class="muted">${i.description || ''}</p></td></tr>`;
    }).join('');
};
window.closeItemsGuide = () => document.getElementById('itemsGuideModal').classList.add('hidden');
window.enterTent = async () => { window.closeModal('interactionModal'); Core.clearTentStatus(); window.openTradeModal(); };
window.leaveTent = async () => { window.closeModal('interactionModal'); await Core.clearTentStatus(); };

// ✅ FIX: Восстановлены функции финального замка
window.openFinalLockModal = (requirements) => {
    const modal = document.getElementById('finalLockModal');
    const grid = document.getElementById('finalItemsGrid');
    const btn = document.getElementById('btnActivateFinal');
    const status = document.getElementById('finalLockStatus');
    
    grid.innerHTML = '';
    
    const inventory = Core.state.currentTeam.inventory || {};
    let allCollected = true;

    for (const [itemId, countNeeded] of Object.entries(requirements)) {
        const itemData = Core.state.globalItems[itemId];
        const hasCount = inventory[itemId] || 0;
        const isCollected = hasCount >= countNeeded;

        if (!isCollected) allCollected = false;

        const slot = document.createElement('div');
        slot.className = `lock-item-slot ${isCollected ? 'collected' : 'missing'}`;
        
        if (itemData && itemData.emoji && itemData.emoji.startsWith('http')) {
            slot.innerHTML = `<img src="${itemData.emoji}" alt="${itemData.name}">`;
        } else {
            slot.innerHTML = `<span>${itemData ? itemData.emoji : '❓'}</span>`;
        }
        
        grid.appendChild(slot);
    }

    if (allCollected) {
        btn.disabled = false;
        status.innerHTML = '<span style="color:#50fa7b">ГОТОВО К АКТИВАЦИИ!</span>';
    } else {
        btn.disabled = true;
        status.textContent = 'Найдите недостающие предметы, чтобы зажечь огни!';
    }

    modal.classList.remove('hidden');
};

window.tryActivateFinal = () => {
    document.getElementById('finalLockModal').classList.add('hidden');
    renderMarkers(); 
    alert("Проверка завершена. Если все условия выполнены, задание откроется!");
};

// --- FREEZE & WIN LOGIC ---
function startFreezeTimer(endTime) {
    if (freezeTimerInterval) clearInterval(freezeTimerInterval);
    document.getElementById('freezeOverlay')?.classList.remove('hidden');
    document.body.classList.add('frozen-mode'); 
    freezeTimerInterval = setInterval(() => {
        const remaining = endTime - Date.now();
        if (remaining > 0) {
            const m = Math.floor(remaining / 60000).toString().padStart(2, '0');
            const s = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
            document.getElementById('freezeCountdown').textContent = `${m}:${s}`;
        } else {
            stopFreezeTimer();
            Core.updateTeam({ frozen_until: null }); 
            alert("🎉 РАЗМОРОЗКА!");
        }
    }, 1000);
}
function stopFreezeTimer() {
    if (freezeTimerInterval) { clearInterval(freezeTimerInterval); freezeTimerInterval = null; }
    document.getElementById('freezeOverlay')?.classList.add('hidden');
    document.body.classList.remove('frozen-mode');
}
function checkFreezeState() {
    const freezeUntilISO = Core.state.currentTeam?.frozen_until;
    const freezeEndTime = freezeUntilISO ? new Date(freezeUntilISO).getTime() : 0;
    if (freezeEndTime > Date.now() && !freezeTimerInterval) startFreezeTimer(freezeEndTime);
}
window.handleQuizFailure = async (teamId) => {
    await Core.updateTeamFreezeStatus(teamId, 2 * 60 * 1000);
    if (teamId === Core.state.me.team_id) { await Core.refreshTeamData(); alert("❌ Провал! Заморозка на 2 мин."); }
};

async function checkGlobalWinCondition() {
    if (!Core.state.me) return;
    
    if (lastChanceActive || sessionStorage.getItem(LAST_CHANCE_FORCED_FLAG) === 'true') {
        const timerEl = document.getElementById('timerCountdown');
        const timerBox = document.getElementById('lastChanceTimer');
        
        if (lastChanceEndTime === 0 && sessionStorage.getItem('lastChanceEndTime')) {
             lastChanceEndTime = Number(sessionStorage.getItem('lastChanceEndTime'));
        } else if (lastChanceEndTime === 0) {
            window.forceLastChance(); 
            return;
        }

        const remaining = lastChanceEndTime - Date.now();
        if (remaining > 0) {
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
            timerEl.textContent = `${minutes}:${seconds}`;
            timerBox.classList.remove('hidden'); 
            lastChanceActive = true;
        } else {
            timerBox.classList.add('hidden');
            lastChanceActive = false;
            sessionStorage.removeItem('lastChanceEndTime');
            sessionStorage.removeItem(LAST_CHANCE_FORCED_FLAG); 
            if (!isTeamVictorious()) window.showLostModal();
        }
        return; 
    }

    const globalState = await Core.fetchGlobalGameState();
    const winningTeamIds = [];
    globalState.forEach(team => {
        const finalId = (team.id === 101 || team.id === 103) ? 6 : 15;
        const task = (team.tasks || []).find(t => t.id === finalId);
        if (task && task.completed) winningTeamIds.push(team.id);
    });
    
    const myId = Core.state.me.team_id;
    const currentTeamWon = winningTeamIds.includes(myId);

    if (winningTeamIds.length >= 2 && !currentTeamWon) {
        lastChanceActive = true;
        let savedEndTime = Number(sessionStorage.getItem('lastChanceEndTime')) || 0;
        if (savedEndTime > Date.now()) {
            lastChanceEndTime = savedEndTime;
        } else {
            lastChanceEndTime = Date.now() + LAST_CHANCE_DURATION_MS;
            sessionStorage.setItem('lastChanceEndTime', lastChanceEndTime);
        }
        checkGlobalWinCondition(); 
    }
}

function isTeamVictorious() {
    if (!Core.state.currentTeam || !Core.state.currentTeam.tasks) return false;
    const tasks = Core.state.currentTeam.tasks;
    return tasks.filter(t => MAIN_MISSION_IDS.includes(t.id)).every(t => t.completed);
}

window.showLostModal = () => {
    document.getElementById('endTitle').textContent = "❌ ВРЕМЯ ИСТЕКЛО";
    document.getElementById('endMessage').textContent = "Время вышло.";
    document.getElementById('endGameModal').classList.remove('hidden');
};

window.forceLastChance = () => {
    sessionStorage.setItem(LAST_CHANCE_FORCED_FLAG, 'true');
    lastChanceActive = true;
    lastChanceEndTime = Date.now() + LAST_CHANCE_DURATION_MS;
    sessionStorage.setItem('lastChanceEndTime', lastChanceEndTime);
    document.getElementById('btnForceLastChance')?.classList.add('hidden');
    alert("Таймер 'Последний Шанс' активирован!");
};

window.showVictoryModal = (title, msg) => {
    document.getElementById('endTitle').textContent = title;
    document.getElementById('endMessage').textContent = msg;
    document.getElementById('endGameModal').classList.remove('hidden');
    document.getElementById('btnCloseModal').classList.remove('hidden');
};

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
        for(let i = 0; i < flakes.length; i++) {
            let f = flakes[i];
            ctx.moveTo(f.x, f.y);
            ctx.arc(f.x, f.y, f.r, 0, Math.PI*2, true);
        }
        ctx.fill();
        move();
    }
    function move() {
        for(let i = 0; i < flakes.length; i++) {
            let f = flakes[i];
            f.y += Math.pow(f.d, 2) + 1;
            if(f.y > H) flakes[i] = {x: Math.random()*W, y: 0, r: f.r, d: f.d};
        }
        requestAnimationFrame(draw);
    }
    draw();
}

// Запуск
initGame().catch(console.error);