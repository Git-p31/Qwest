import * as Core from './core.js'; // Базовый движок (Supabase, state, fetchQuizData и т.д.)

// Глобальная переменная для хранения логики миссий (будет заполнена в initGame)
let MissionLogic = {}; 

// =======================================================
// ===== I. UI CONFIG & GLOBAL STATE MANAGEMENT (MAIN) =====
// =======================================================
const TEAMS_UI_CONFIG = {
    101: { color: '#8be9fd', symbol: '❄️' },
    102: { color: '#ff5555', symbol: '🔴' },
    103: { color: '#f1fa8c', symbol: '💡' },
    104: { color: '#bd93f9', symbol: '🎅' },
};
window.TEAMS_UI_CONFIG = TEAMS_UI_CONFIG;

const TELEGRAM_GROUP_LINK = 'https://t.me/stuttgart_quest_group'; 
const MAX_SNOW_PILES = 5;
window.TELEGRAM_GROUP_LINK = TELEGRAM_GROUP_LINK;

const VALID_TASK_IDS = {
    101: [1, 2, 3, 4, 5, 6],
    103: [1, 2, 3, 4, 5, 6],
    102: [10, 11, 12, 13, 14, 15],
    104: [10, 11, 12, 13, 14, 15],
};
const MAIN_MISSION_IDS = [1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 14, 15]; 

// --- NEW CONSTANTS FOR GLOBAL WIN/TIMER ---
const FINAL_MISSION_IDS = [6, 15]; // Финальные миссии для обеих групп
const LAST_CHANCE_DURATION_MS = 5 * 60 * 1000; // 5 минут (300,000 мс)
const SNOW_SPAWN_INTERVAL_MS = 180000; // 3 минуты (180,000 мс)
const FREEZE_DURATION_MS = 2 * 60 * 1000; // 2 минуты (120,000 мс)

// --- ФИНАЛЬНЫЕ ТРЕБОВАНИЯ (На основе предоставленной таблицы) ---
const FINAL_ITEM_REQUIREMENTS = {
    // Команда 101 (A): {1, 3, 5, 7, 9}
    101: { 1: 1, 3: 1, 5: 1, 7: 1, 9: 1 }, 
    // Команда 103 (C): {1, 3, 6, 7, 9}
    103: { 1: 1, 3: 1, 6: 1, 7: 1, 9: 1 }, 
    
    // Команда 102 (B): {2, 4, 6, 8, 10}
    102: { 2: 1, 4: 1, 6: 1, 8: 1, 10: 1 }, 
    // Команда 104 (D): {1, 2, 3, 8, 10}
    104: { 1: 1, 2: 1, 3: 1, 8: 1, 10: 1 }, 
};
// --- END NEW CONSTANTS ---

// --- DYNAMIC STATE ---
let map = null;
let mapMarkers = {};
let wasFrozen = false;
let hasShownVictory = false;
let staticMapPoints = []; 
let dynamicSnowPiles = []; 
let snowSpawnInterval = null;
let lastScavengeTime = Number(localStorage.getItem('lastScavengeTime')) || 0; 
window.selectedAnswers = {}; // Глобальное состояние для квизов остается здесь или в модулях

// --- NEW GLOBAL STATE FOR LAST CHANCE TIMER ---
let lastChanceActive = false;
let lastChanceEndTime = 0;
const LAST_CHANCE_FORCED_FLAG = 'lastChanceForced'; 
const LAST_CHANCE_ENDED_FLAG = 'lastChanceEnded'; // НОВЫЙ ФЛАГ ДЛЯ ПОСТОЯННОЙ БЛОКИРОВКИ
// --- END NEW GLOBAL STATE ---

// НОВОЕ: Интервал для таймера заморозки
let freezeTimerInterval = null;

// --- ФУНКЦИЯ ПРИВЯЗКИ ФУНКЦИЙ МИССИЙ К WINDOW (для HTML) ---
function assignMissionFunctionsToWindow() {
    if (!MissionLogic || !MissionLogic.routeTaskToModal) return;

    // Перечисляем все функции, которые мы ожидаем вызывать из HTML/других частей game.js
    const functionsToAssign = [
        'routeTaskToModal', 'openQuizModal', 'renderSequentialQuestion', 
        'handleSequentialAnswer', 'renderBulkQuiz', 'handleBulkSubmit', 
        'finalizeQuizResult', 'openSecretWordModal', 'handleSecretWordSubmit', 
        'openTicTacToeModal', 'sendGameChallenge', 'handleTicTacToeResult'
    ];

    functionsToAssign.forEach(funcName => {
        if (typeof MissionLogic[funcName] === 'function') {
            window[funcName] = MissionLogic[funcName];
        }
    });
}
// --- КОНЕЦ ФУНКЦИИ ПРИВЯЗКИ ---


// ===== INITIALIZATION & CORE (Исправлено) =====
async function initGame() {
    
    // 1. Аутентификация игрока (заполняет Core.state.me)
    const player = await Core.authPlayer();
    if (!player) return alert("Ошибка входа! Игрок не найден.");

    // 2. Динамический импорт логики заданий ПОСЛЕ аутентификации
    const teamId = Core.state.me.team_id;
    try {
        if (teamId === 101 || teamId === 103) {
            MissionLogic = await import('./missions_101_103.js');
        } else if (teamId === 102 || teamId === 104) {
            MissionLogic = await import('./missions_102_104.js');
        } else {
            // Если teamId существует, но не соответствует ожидаемым группам
            throw new Error("ID команды не соответствует ни одной группе заданий (101-104).");
        }
        
        // Привязка функций к window, чтобы они работали из HTML
        assignMissionFunctionsToWindow();
        
    } catch (e) {
        console.error("Критическая ошибка загрузки MissionLogic:", e);
        // Используем alert из оригинального кода, который теперь корректно срабатывает
        alert("Ошибка: Логика заданий для вашей команды не загружена."); 
        return; // Останавливаем инициализацию
    }


    document.getElementById('myNameHeader').textContent = Core.state.me.name;
    document.getElementById('myPlayerRole').textContent = Core.ROLES_DATA[Core.state.me.role] || Core.state.me.role;
    
    // Role Buttons Visibility
    if (Core.state.me.role === 'Spy') document.getElementById('btnSpyAction')?.classList.remove('hidden'); 
    if (Core.state.me.role === 'Scavenger') document.getElementById('btnScavenge')?.classList.remove('hidden');
    if (Core.state.me.role === 'Guardian') document.getElementById('btnGuardianWarm')?.classList.remove('hidden'); 
    if (['leader', 'Negotiator'].includes(Core.state.me.role)) {
        document.getElementById('btnShowTrades')?.classList.remove('hidden');
    }
    
    // Показать кнопку принудительного запуска только Лидеру
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
    
    // Проверяем, был ли таймер принудительно запущен ранее
    if (sessionStorage.getItem(LAST_CHANCE_FORCED_FLAG) === 'true') {
        lastChanceActive = true;
    }
    
    // Устанавливаем интервал проверки таймеров
    setInterval(checkGlobalWinCondition, 1000); 

    Core.setupRealtimeListeners(
        async (newTeam, oldTeam) => {
            Object.assign(Core.state.currentTeam, newTeam);
            renderGameInterface();
        },
        (updatedTeam) => {
            renderMarkers(); 
        }
    );

    if(['leader', 'Negotiator'].includes(Core.state.me.role)) Core.clearTentStatus();
}

// -------------------------------------------------------
// ===== II. UI RENDERING FUNCTIONS (Inventory, Tasks, Map) =====
// -------------------------------------------------------

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
                ? `<img src="${item.emoji}" alt="${item.name}" style="width: 32px; height: 32px; object-fit: contain; filter: drop-shadow(0 0 1px #FFF);">` 
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
                    ${iconHtml} <div style="display:flex; flex-direction:column;">
                        <span style="font-weight:bold; font-size:0.9rem;">${item.name}</span>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap: 10px;">
                    ${actionBtn}
                    <span class="inv-count">x${inv[id]}</span>
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
    
    const tasks = (Core.state.currentTeam.tasks || []).filter(t => validIds.includes(t.id));

    let completedCount = 0;

    tasks.forEach(task => {
        if(task.completed) completedCount++;
        const isChecked = task.completed ? 'checked disabled' : ''; 
        
        const reward = task.reward_item_id 
            ? (Core.state.globalItems[task.reward_item_id]?.emoji || '🎁') 
            : '';

        let taskText = task.text;
        


        const tr = document.createElement('tr');
        tr.className = task.completed ? 'task-row completed' : 'task-row';
        
        tr.innerHTML = `
            <td style="text-align:center; width:30px;">
                <input type="checkbox" ${isChecked} onclick="return false;">
            </td>
            <td>${taskText}</td>
            <td style="text-align:center; font-size:1.2rem;">${reward}</td>
        `;
        tbody.appendChild(tr);
    });
    if (tasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="muted" style="padding:10px;">Нет активных задач</td></tr>';
        progressEl.textContent = '0%';
        return;
    }
    
    progressEl.textContent = Math.round((completedCount / tasks.length) * 100) + '%';
    
    // Проверка на победу (п. 3 и 6)
    if (tasks.filter(t => MAIN_MISSION_IDS.includes(t.id)).every(t => t.completed) && !hasShownVictory) {
        hasShownVictory = true;
        const finalStall = (teamId === 101 || teamId === 103) ? 'Палатка №409 (ФИНАЛ)' : 'Палатка №325 (ФИНАЛ)';
        window.showVictoryModal(
            "🎉 ПОБЕДА! ВЫ СПАСЛИ РОЖДЕСТВО!", 
            `Вы выполнили все основные миссии и собрали все необходимые предметы! Срочно идите к организаторам в ${finalStall} для финального поощрения!`
        );
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

// --- MAP & MARKERS ---

function initMapLogic() {
    if (map) map.remove();
    map = L.map('interactiveMap', { crs: L.CRS.Simple, minZoom: -2, maxZoom: 2, zoomControl: false, attributionControl: false });
    const bounds = [[0, 0], [1500, 2000]];
    L.imageOverlay('map.png', bounds).addTo(map);
    map.fitBounds(bounds);
    map.on('click', () => window.closeModal('interactionModal'));

    renderMarkers();
    // Симуляция движения других команд
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
    const validIds = VALID_TASK_IDS[teamId] || [];
    const activeTask = tasks.find(t => !t.completed && validIds.includes(t.id));
    
    // --- CHECK FINAL MISSION LOCK (NEW LOGIC) ---
    const finalMissionId = (teamId === 101 || teamId === 103) ? 6 : 15;
    
    if (activeTask && activeTask.id === finalMissionId) {
        const requiredItems = FINAL_ITEM_REQUIREMENTS[teamId];
        const inventory = Core.state.currentTeam.inventory || {};
        let requirementsMet = true;
        
        // Iterate over required items and check inventory count
        for (const itemId in requiredItems) {
            const requiredCount = requiredItems[itemId];
            const currentCount = inventory[itemId] || 0;
            
            if (currentCount < requiredCount) {
                requirementsMet = false;
                break;
            }
        }

        if (!requirementsMet) {
            // The team HAS NOT collected all required items. Lock the mission.
            const stallName = (teamId === 101 || teamId === 103) ? 'Палатка №409 (ФИНАЛ)' : 'Палатка №325 (ФИНАЛ)';
            
            return {
                id: 'mission_locked', 
                type: 'npc', // Use generic NPC type to prevent interaction, or new custom type
                x: staticMapPoints.find(p => p.title === stallName)?.x || 50,
                y: staticMapPoints.find(p => p.title === stallName)?.y || 50,
                title: '🔒 ФИНАЛ ЗАБЛОКИРОВАН', 
                desc: 'Необходимо собрать все финальные предметы. Проверьте ваш рюкзак и Миссии.',
                icon: '🔒'
            };
        }
    }
    // --- END FINAL MISSION LOCK CHECK ---

    if (!activeTask) return null; 

    let pathKey = '';
    if (Core.state.me.team_id === 101 || Core.state.me.team_id === 103) {
        pathKey = '101_103';
    } else if (Core.state.me.team_id === 102 || Core.state.me.team_id === 104) {
        pathKey = '102_104';
    }

    const pathSequence = Core.MISSION_PATH_STRUCTURE[pathKey];
    if (!pathSequence) return null;

    const missionStep = pathSequence.find(p => p.taskId === activeTask.id);
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
    
    Object.keys(mapMarkers).forEach(id => {
        if (id !== 'me') { mapMarkers[id].remove(); delete mapMarkers[id]; }
    });
    
    const mission = findActiveMission(Core.state.currentTeam.tasks);

    // Всегда отрисовываем статические точки (палатки, NPC)
    staticMapPoints.forEach(item => {
        if (mission && item.title === mission.title) return;
        if (item.type === 'tent' || item.type === 'npc') {
            updateMarker(item.id, item.type, item.x, item.y, item.title, item, item.icon);
        }
    });

    // АКТИВНАЯ МИССИЯ: Отрисовываем только если найдена
    if (mission) {
        updateMarker(mission.id, mission.type, mission.x, mission.y, mission.title, mission, '🎯');
    }
    
    dynamicSnowPiles.forEach(item => updateMarker(item.id, 'snow_pile', item.x, item.y, item.title, item, '🧤'));
    
    Core.state.otherTeams.forEach(t => {
        const symbol = TEAMS_UI_CONFIG[t.id]?.symbol || '👥';
        const teamName = t.name_by_leader || t.name;
        const isFrozen = t.frozen_until && new Date(t.frozen_until) > new Date();
        const label = isFrozen ? `🧊 ${teamName}` : teamName;
        updateMarker('team_'+t.id, 'team', t.x, t.y, label, { title: label, desc: `Игроков: ${t.playerCount}` }, symbol);
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
            if (type === 'mission_stall') { showMissionPopup(data); } else { showPopup(data, type, id); }
            setTimeout(() => { map.flyTo(loc, map.getZoom()); }, 50); 
        });
        mapMarkers[id] = m;
    }
}

function startSnowPileSpawning() {
    const spawnSnowPile = () => {
        if (dynamicSnowPiles.length >= MAX_SNOW_PILES) return;

        const newPile = {
            id: `snow_${Date.now()}`,
            type: 'snow_pile',
            x: 20 + Math.random() * 60, 
            y: 20 + Math.random() * 60,
            title: 'Сугроб',
            desc: 'Кладоискатель может поискать здесь ресурсы или гаджет.',
        };
        dynamicSnowPiles.push(newPile);
        renderMarkers();
    };

    spawnSnowPile(); 
    snowSpawnInterval = setInterval(spawnSnowPile, SNOW_SPAWN_INTERVAL_MS); 
}


// -------------------------------------------------------
// ===== III. CORE GAME LOGIC (Tasks, Modals, Interactions) =====
// -------------------------------------------------------

window.toggleTask = async (taskId, checkboxEl) => {
    if(Core.state.me.role !== 'leader') { 
        checkboxEl.checked = !checkboxEl.checked; 
        return alert("Только лидер может отмечать задачи!"); 
    }
    
    if (MAIN_MISSION_IDS.includes(taskId)) {
        alert("Это специальное задание. Его статус обновляется автоматически по результатам квиза/игры.");
        checkboxEl.checked = !checkboxEl.checked; 
        return;
    }

    const task = Core.state.currentTeam.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const isChecking = checkboxEl.checked;
    let newInventory = { ...Core.state.currentTeam.inventory };
    
    if (isChecking) {
        if (task.required_item_id) { 
            if ((newInventory[task.required_item_id] || 0) < 1) { 
                alert(`Не хватает предмета: ${Core.state.globalItems[task.required_item_id]?.name || '???'}`); 
                checkboxEl.checked = false;
                return;
            }
            newInventory[task.required_item_id]--;
        }
        
        if (task.reward_item_id) { 
            const rewardId = task.reward_item_id;
            newInventory[rewardId] = (newInventory[rewardId] || 0) + 1;
            alert(`🎉 Получена награда: ${Core.state.globalItems[rewardId]?.name}!`);
        }
    } 
    
    const newTasks = Core.state.currentTeam.tasks.map(t => t.id === taskId ? {...t, completed: isChecking} : t);

    const result = await Core.updateTaskAndInventory(Core.state.me.team_id, newTasks, newInventory);
    
    if (!result.success) {
        console.error('Task update error:', result.error);
        alert('Ошибка сохранения задачи!');
        checkboxEl.checked = !isChecking;
        return;
    }
    renderMarkers();
    await Core.refreshTeamData();
    renderGameInterface();
};


window.routeTaskToModal = (taskId) => {
    if (Core.state.me.role !== 'leader') {
        return alert("Только лидер может запускать специальные задания (Квизы/Игры)!");
    }
    
    if (MissionLogic && MissionLogic.routeTaskToModal) {
        // Вызываем функцию из импортированного модуля заданий
        MissionLogic.routeTaskToModal(taskId);
    } else {
        // Эта ветка теперь должна быть недостижима, если initGame отработал корректно
        alert("Ошибка: Логика заданий для вашей команды не загружена.");
    }
};


// --- ITEM USE & CRAFTING ---

window.handleItemUse = async (id) => {
    const now = Date.now();
    if(now - Core.state.lastGadgetUsage < Core.GADGET_COOLDOWN_MS) {
        const remaining = Math.ceil((Core.GADGET_COOLDOWN_MS - (now - Core.state.lastGadgetUsage)) / 1000);
        return alert(`Перезарядка: ${remaining} секунд.`);
    }
    
    if(id == 11) { // Ледяная Бомба
        const targetId = prompt("ID цели (101-104):");
        const targetTeam = Core.state.otherTeams.find(t => t.id == targetId);
        if(!targetTeam) return alert("Команда не найдена или неверный ID");

        if ((Core.state.currentTeam.inventory[id] || 0) < 1) return alert("У вас нет этого гаджета.");
        
        // useGadgetLogic обновляет Core.state.lastGadgetUsage только при успехе
        const res = await Core.useGadgetLogic(id, targetId); 
        if(res.success) {
            // ИСПОЛЬЗУЕМ СТАРУЮ, РАБОЧУЮ DB ЛОГИКУ ДЛЯ ЗАМОРОЗКИ (Core.updateTeamFreezeStatus)
            const freezeDurationMs = FREEZE_DURATION_MS;
            await Core.updateTeamFreezeStatus(targetId, freezeDurationMs);
            
            // Если заморозили себя, запускаем таймер немедленно
            if (targetId === Core.state.me.team_id) {
                // Вызываем refresh, чтобы получить новый frozen_until и запустить таймер
                await Core.refreshTeamData(); 
            }
            
            alert(`Успех! Команда ${targetTeam.name_by_leader || targetTeam.name} заморожена.`);
        } else {
            alert(res.msg);
        }
        await Core.refreshTeamData(); // Final refresh
        renderGameInterface();
    } else {
        alert("Гаджет не настроен для использования.");
    }
};

window.openCraftModal = () => {
    if(Core.state.me.role !== 'Explorer') return alert("Только Исследователь!");
    window.closeModal('craftModal'); // Закрыть предыдущее, если открыто
    document.getElementById('craftModal').classList.remove('hidden');
    renderCraftUI();
};

function renderCraftUI() {
    const cont = document.getElementById('craftRecipesList'); cont.innerHTML = '';
    const inv = Core.state.currentTeam.inventory || {};
    
    Core.CRAFT_RECIPES.forEach(r => {
        const resItem = Core.state.globalItems[r.resultId];
        let can = true;
        const ingHTML = r.ingredients.map(ing => {
            const item = Core.state.globalItems[ing.id];
            const has = inv[ing.id] || 0;
            if(has < ing.count) can = false;
            return `<div class="ingredient-box ${has >= ing.count?'has-it':'missing'}">
                        ${item?.emoji && item.emoji.startsWith('http') ? `<img src="${item.emoji}" alt="${item.name}" style="width: 24px; height: 24px; object-fit: contain; filter: drop-shadow(0 0 1px #FFF);">` : `<span class="ing-icon">${item?.emoji || '❓'}</span>`}
                        <span class="ing-count">${has}/${ing.count}</span>
                    </div>`;
        }).join('');

        cont.innerHTML += `
        <div class="craft-recipe">
            <div class="recipe-header"><strong>${r.name}</strong></div>
            <div class="recipe-row">
                <div class="ingredients-group">${ingHTML}</div>
                <div class="arrow-sign">➔</div>
                <div class="craft-result">${resItem?.emoji || '❓'}</div>
            </div>
            <button class="start-button" style="${can?'':'opacity:0.5'}" ${can?'':'disabled'} onclick="${can?`window.doCraft(${r.id})`:''}">СОЗДАТЬ</button>
        </div>`;
    });
}

window.doCraft = async (rid) => {
    const res = await Core.craftItemLogic(rid);
    if(res.success) { alert(`Создано: ${res.itemName}`); renderCraftUI(); renderGameInterface(); }
    else alert(res.msg);
};

// --- SCAVENGE LOGIC ---

window.handleScavengeInteraction = async (snowPileId) => {
    if (Core.state.me.role !== 'Scavenger') return alert("Это могут делать только Кладоискатели!");

    const now = Date.now();
    const timePassed = now - lastScavengeTime;
    
    if (timePassed < Core.SCAVENGER_COOLDOWN_MS) {
        const remaining = Math.ceil((Core.SCAVENGER_COOLDOWN_MS - timePassed) / 1000);
        const m = Math.floor(remaining / 60);
        const s = (remaining % 60).toString().padStart(2, '0');
        return alert(`⏳ Перезарядка. Поиск в сугробах возможен через ${m}:${s}.`);
    }

    const modal = document.getElementById('interactionModal');
    const descEl = document.getElementById('interactDesc');
    const btns = document.getElementById('interactButtons');

    const originalDesc = descEl.innerHTML;
    const originalBtns = btns.innerHTML;
    
    descEl.innerHTML = `<div class="tent-waiting"><div class="loader-spinner"></div><p style="font-size:1.1rem; margin-bottom:5px;">Идет поиск...</p><p class="muted" style="font-size:0.8rem; line-height:1.4;">Это может занять некоторое время.</p></div>`;
    btns.innerHTML = `<button class="secondary" disabled>ИДЕТ ПОИСК</button>`;
    
    await new Promise(resolve => setTimeout(resolve, 1500));

    const result = await Core.scavengeItemLogic();
    
    if (result.success) {
        lastScavengeTime = now;
        localStorage.setItem('lastScavengeTime', now);

        dynamicSnowPiles = dynamicSnowPiles.filter(p => p.id !== snowPileId);
        if (mapMarkers[snowPileId]) {
            mapMarkers[snowPileId].remove();
            delete mapMarkers[snowPileId];
        }

        descEl.innerHTML = `<div style="text-align:center; padding:20px;">
                                 <div style="font-size:3rem;">${result.itemId ? '✅' : '🧊'}</div>
                                 <h3 style="color:var(--accent-gold); margin:10px 0;">РЕЗУЛЬТАТ ПОИСКА</h3>
                                 <p>${result.message.replace(/\*\*/g, '<strong>')}</p>
                             </div>`;
        btns.innerHTML = `<button class="start-button" onclick="window.closeModal('interactionModal');">Готово</button>`;
        
        await Core.refreshTeamData(); 
        renderGameInterface();
    } else {
        alert("Ошибка поиска: " + result.message);
        descEl.innerHTML = originalDesc;
        btns.innerHTML = originalBtns;
    }
}


// --- MAP POPUP LOGIC ---

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
                                 Обмен теперь происходит путем прямого предложения. Используйте кнопку 
                                 <span style="font-weight:bold; color:var(--accent-ice);">"ВХОДЯЩИЕ 💛"</span> в шапке
                                 и кнопку "ПРЕДЛОЖИТЬ ОБМЕН" на этой карте, чтобы начать торговлю.
                                 </p>`;
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
        const cooldownText = remaining > 0 
            ? `(Кулдаун: ${Math.floor(remaining / 1000)}с)` 
            : (isScavenger ? '' : '(Только Кладоискатель)');

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

    if (isGroup101) {
        isQuiz = (logicId === 1 || logicId === 4);
    } else {
        isQuiz = (logicId === 2); 
    }

    if (isQuiz) {
        buttonText = `ПЕРЕЙТИ К ЗАДАНИЮ ${missionData.taskId} (Викторина)`;
    } else if (isFinalGame) {
        buttonText = `ПЕРЕЙТИ К ЗАДАНИЮ ${missionData.taskId} (Финал)`;
    } else {
        buttonText = `ПЕРЕЙТИ К ЗАДАНИЮ ${missionData.taskId} (Секретное слово)`;
    }
    
    btns.innerHTML = `<button class="start-button" onclick="${buttonAction}">${buttonText}</button>`;
    
    modal.classList.remove('hidden');
}

// --- TENT LOGIC ---

window.enterTent = async (tentId) => {
    window.closeModal('interactionModal');
    Core.clearTentStatus(); 
    window.openTradeModal();
};

window.leaveTent = async () => {
    window.closeModal('interactionModal');
    await Core.clearTentStatus(); 
};

// --- TRADE LOGIC ---

window.openTradeModal = () => {
    if (!['leader', 'Negotiator'].includes(Core.state.me.role)) {
        alert('Только Лидер или Переговорщик могут предлагать обмен.');
        return;
    }

    const modal = document.getElementById('tradeModal');
    modal.classList.remove('hidden');

    const teamSelect = document.getElementById('tradeTargetTeam');
    teamSelect.innerHTML = '<option value="">Выберите команду</option>';
    Core.state.otherTeams.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.name_by_leader || t.name} ${TEAMS_UI_CONFIG[t.id]?.symbol || ''}`;
        teamSelect.appendChild(opt);
    });

    const inv = Core.state.currentTeam.inventory || {};
    const offerSel = document.getElementById('tradeOfferSelect');
    const reqSel = document.getElementById('tradeRequestSelect');
    offerSel.innerHTML = '<option value="">Что отдать? (У вас:)</option>';
    reqSel.innerHTML = '<option value="">Что получить?</option>';

    // Функция-помощник для определения, что отображать в <option>
    const getDisplayEmoji = (item) => {
        // Если item.emoji начинается с 'http', это ссылка (изображение), используем запасной эмодзи
        if (item.emoji && item.emoji.startsWith('http')) {
            return '🎁'; // Запасной эмодзи, т.к. PNG не работает в <option>
        }
        return item.emoji || '📦'; // Используем Юникод или запасной '📦'
    };


    // 1. Формирование списка "Что отдать?"
    Object.entries(inv)
        .filter(([id, count]) => count > 0)
        .forEach(([id, count]) => {
            const item = Core.state.globalItems[id];
            if (!item) return;

            const displayEmoji = getDisplayEmoji(item);

            const opt1 = document.createElement('option');
            opt1.value = id;
            opt1.textContent = `${displayEmoji} ${item.name} ×${count}`;
            offerSel.appendChild(opt1);
        });

    // 2. Формирование списка "Что получить?"
    Object.values(Core.state.globalItems).forEach(item => {
        const displayEmoji = getDisplayEmoji(item);

        const opt2 = document.createElement('option');
        opt2.value = item.id;
        opt2.textContent = `${displayEmoji} ${item.name}`;
        reqSel.appendChild(opt2);
    });
};

window.sendTradeRequest = async () => {
    const to = Number(document.getElementById('tradeTargetTeam').value);
    const offer = Number(document.getElementById('tradeOfferSelect').value);
    const request = Number(document.getElementById('tradeRequestSelect').value);

    if (!to || !offer || !request) return alert('Заполните все поля');

    const res = await Core.sendTradeRequest(to, offer, request);
    if (res.success) {
        alert('✅ Предложение отправлено! Ждите, пока команда-цель примет его.');
        window.closeModal('tradeModal');
    } else {
        alert('❌ ' + res.msg);
    }
};

window.openIncomingTrades = async () => {
    const trades = await Core.fetchIncomingTrades();
    const list = document.getElementById('incomingTradesList');
    
    // NEW: Helper function to render the item icon correctly (image or emoji)
    const renderItemDisplay = (item) => {
        if (!item) return '???';
        const emoji = item.emoji;
        
        if (emoji && emoji.startsWith('http')) {
            // It's a URL, render as image
            // We use vertical-align: middle and width/height 25px for compact display
            return `<img src="${emoji}" alt="${item.name}" style="width: 25px; height: 25px; object-fit: contain; vertical-align: middle; margin-right: 5px;"> ${item.name}`;
        }
        // It's an emoji/text, use a Unicode symbol
        return `${emoji || '🎁'} ${item.name}`;
    };

    list.innerHTML = trades.length === 0 
        ? '<p class="muted" style="padding:15px;">Нет входящих предложений</p>'
        : trades.map(t => {
            const offer = Core.state.globalItems[t.offer_item_id];
            const req = Core.state.globalItems[t.request_item_id];
            const myInv = Core.state.currentTeam.inventory || {};
            const canFulfill = (myInv[t.request_item_id] || 0) >= 1;

            // Logic to display team avatar
            const avatarHtml = t.from_team_selfie 
                ? `<img src="${t.from_team_selfie}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover; vertical-align: middle; margin-right: 10px;">`
                : `<div style="width: 30px; height: 30px; border-radius: 50%; background: #333; display: inline-flex; align-items: center; justify-content: center; font-size: 1.2rem; margin-right: 10px;">${window.TEAMS_UI_CONFIG[t.from_team_id]?.symbol || '👥'}</div>`;
            
            return `<div class="incoming-trade-card">
                        <p style="display:flex; align-items:center; margin-bottom: 10px;">
                            ${avatarHtml}<strong style="font-size: 1.1em;">${t.from_team_name}</strong>
                        </p>
                        <p>📤 ${renderItemDisplay(offer)}</p>
                        <p style="margin-top: 5px; margin-bottom: 10px;">в обмен на:</p>
                        <p style="color:${canFulfill ? 'var(--accent-green)' : 'var(--accent-red)'}">📥 ${renderItemDisplay(req)} ${!canFulfill ? ' (у вас нет)' : ''}</p>
                        <div style="display:flex; gap:10px; margin-top:12px;">
                            <button class="start-button" ${!canFulfill ? 'disabled' : ''} onclick="window.acceptTrade(${t.id})">Принять</button>
                            <button class="secondary" onclick="window.rejectTrade(${t.id})">Отклонить</button>
                        </div>
                    </div>`;
        }).join('');

    document.getElementById('incomingTradesModal').classList.remove('hidden');
};

window.acceptTrade = async (id) => {
    const res = await Core.respondToTrade(id, true);
    if (res.success) {
        alert('Обмен выполнен!');
        await Core.refreshTeamData();
        renderGameInterface();
        window.openIncomingTrades();
    } else {
        alert('Ошибка: ' + res.msg);
    }
};

window.rejectTrade = async (id) => {
    await Core.respondToTrade(id, false);
    window.openIncomingTrades();
};

window.closeModal = (id) => document.getElementById(id).classList.add('hidden'); 

// --- FREEZE TIMER LOGIC ---

// 1. Запуск таймера заморозки
function startFreezeTimer(endTime) {
    if (freezeTimerInterval) clearInterval(freezeTimerInterval);

    // Показываем оверлей
    document.getElementById('freezeOverlay')?.classList.remove('hidden');
    document.body.classList.add('frozen-mode'); // Добавляем класс, чтобы заблокировать интерфейс

    // Запускаем интервал
    freezeTimerInterval = setInterval(updateFreezeTimerDisplay, 1000);
    updateFreezeTimerDisplay(); // Немедленное обновление
}

// 2. Обновление отображения и проверка окончания
function updateFreezeTimerDisplay() {
    // ПАРСИМ frozen_until (ISO STRING) В MILLISECONDS
    const freezeUntilISO = Core.state.currentTeam?.frozen_until;
    
    // Если поле пустое, прекращаем
    if (!freezeUntilISO) {
        stopFreezeTimer();
        return;
    }
    
    const freezeEndTime = new Date(freezeUntilISO).getTime(); // ПАРСИМ СТРОКУ В ЧИСЛО
    
    const remaining = freezeEndTime - Date.now();
    const timerEl = document.getElementById('freezeCountdown');

    if (remaining > 0) {
        // Отображение оставшегося времени
        const minutes = Math.floor(remaining / 60000).toString().padStart(2, '0');
        const seconds = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
        if (timerEl) timerEl.textContent = `${minutes}:${seconds}`;
        
    } else {
        // Время вышло - размораживаем!
        stopFreezeTimer();
        
        // Отправляем запрос на сервер, чтобы сбросить статус заморозки (Удаляем ISO строку)
        Core.updateTeam({ frozen_until: null }); 
        
        alert("🎉 ВЫ РАЗМОРОЖЕНЫ! Можете двигаться дальше.");
    }
}

// 3. Остановка таймера
function stopFreezeTimer() {
    if (freezeTimerInterval) {
        clearInterval(freezeTimerInterval);
        freezeTimerInterval = null;
    }
    
    // Скрываем оверлей и убираем класс блокировки
    document.getElementById('freezeOverlay')?.classList.add('hidden');
    document.body.classList.remove('frozen-mode');
}

// НОВАЯ ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ ТРИГГЕРА ЗАМОРОЗКИ (например, после провала в квизе)
window.handleQuizFailure = async (teamId) => {
    const freezeDurationMs = FREEZE_DURATION_MS;
    
    // 1. Отправляем запрос на сервер для установки времени заморозки
    const result = await Core.updateTeamFreezeStatus(teamId, freezeDurationMs);
    
    if (result.success && teamId === Core.state.me.team_id) {
        // 2. Если это наша команда, запускаем полный рефреш, который активирует UI таймер
        await Core.refreshTeamData();
        alert(`❌ Неправильный ответ! Вы заморожены на ${FREEZE_DURATION_MS / 60000} минуты.`);
    } else if (!result.success) {
        console.error("Ошибка установки заморозки в DB");
    }
};


// --- UTILITY & EFFECTS ---

function checkFreezeState() {
    // НОВАЯ ЛОГИКА: Проверка заморозки через frozen_until (ISO STRING)
    const freezeUntilISO = Core.state.currentTeam?.frozen_until;
    const freezeEndTime = freezeUntilISO ? new Date(freezeUntilISO).getTime() : 0;
    const isFrozenInDB = freezeEndTime > Date.now();
    
    // Активация/синхронизация таймера
    if (isFrozenInDB && !freezeTimerInterval) {
        startFreezeTimer(freezeEndTime);
    } else if (!isFrozenInDB && freezeTimerInterval) {
        stopFreezeTimer();
    }
    
    // СТАРАЯ ЛОГИКА (iceOverlay): сохраняем для визуального оверлея
    const isFrozenLegacy = freezeUntilISO && new Date(freezeUntilISO) > new Date(); 
    const overlay = document.getElementById('iceOverlay');
    
    if(isFrozenLegacy && !wasFrozen) {
        overlay.classList.remove('hidden'); overlay.classList.add('smash');
        wasFrozen = true;
    } else if(!isFrozenLegacy && wasFrozen) {
        overlay.classList.add('hidden');
        wasFrozen = false;
    }
}

// Новая функция: Проверка глобальной победы (включает логику "Последнего Шанса")
async function checkGlobalWinCondition() {
    if (!Core.state.me) return;

    // 1. Проверяем, активен ли "Последний Шанс" (автоматически или вручную)
    if (lastChanceActive || sessionStorage.getItem(LAST_CHANCE_FORCED_FLAG) === 'true') {
        const timerEl = document.getElementById('timerCountdown');
        const timerBox = document.getElementById('lastChanceTimer');
        
        // Убедимся, что время окончания установлено, если мы только что перезагрузили страницу с флагом FORCE
        if (lastChanceEndTime === 0 && sessionStorage.getItem('lastChanceEndTime')) {
             lastChanceEndTime = Number(sessionStorage.getItem('lastChanceEndTime'));
        } else if (lastChanceEndTime === 0) {
            // Если таймер принудительно запущен, но время не установлено (редкий случай), установим его
            window.forceLastChance(); 
            return;
        }

        const remaining = lastChanceEndTime - Date.now();
        
        if (remaining > 0) {
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
            timerEl.textContent = `${minutes}:${seconds}`;
            timerBox.classList.remove('hidden'); // Показываем таймер
            lastChanceActive = true;
        } else {
            // Таймер истек
            timerBox.classList.add('hidden');
            lastChanceActive = false;
            sessionStorage.removeItem('lastChanceEndTime');
            sessionStorage.removeItem(LAST_CHANCE_FORCED_FLAG); // Снимаем флаг принудительного запуска
            
            // НОВАЯ ЛОГИКА: Конец игры для проигравших
            if (!isTeamVictorious()) {
                window.showLostModal();
            }
        }
        return; 
    }

    // 2. Если таймер НЕ активен вручную, проверяем автоматическое условие
    const globalState = await Core.fetchGlobalGameState();
    const winningTeamIds = [];

    globalState.forEach(team => {
        const teamTasks = team.tasks || [];
        const isTeam101_103 = (team.id === 101 || team.id === 103);
        const finalTaskId = isTeam101_103 ? 6 : 15;

        const finalTask = teamTasks.find(t => t.id === finalTaskId);
        if (finalTask && finalTask.completed) {
            winningTeamIds.push(team.id);
        }
    });

    const currentTeamId = Core.state.me.team_id;
    const currentTeamWon = winningTeamIds.includes(currentTeamId);

    if (winningTeamIds.length >= 2 && !currentTeamWon) {
        // АВТОМАТИЧЕСКИЙ ЗАПУСК: 
        const timerEl = document.getElementById('lastChanceTimer');
        timerEl.classList.remove('hidden');
        
        lastChanceActive = true;
        let savedEndTime = Number(sessionStorage.getItem('lastChanceEndTime')) || 0;
        
        if (savedEndTime > Date.now()) {
            lastChanceEndTime = savedEndTime;
        } else {
            lastChanceEndTime = Date.now() + LAST_CHANCE_DURATION_MS;
            sessionStorage.setItem('lastChanceEndTime', lastChanceEndTime);
        }

        checkGlobalWinCondition(); 

    } else if (winningTeamIds.length < 2) {
        // Менее 2 команд победили, скрываем таймер
        document.getElementById('lastChanceTimer').classList.add('hidden');
        lastChanceActive = false;
        sessionStorage.removeItem('lastChanceEndTime');
    }
}

function isTeamVictorious() {
    if (!Core.state.currentTeam || !Core.state.currentTeam.tasks) return false;
    const tasks = Core.state.currentTeam.tasks;
    return tasks.filter(t => MAIN_MISSION_IDS.includes(t.id)).every(t => t.completed);
}

window.showLostModal = () => {
    const modal = document.getElementById('endGameModal');
    document.getElementById('endTitle').textContent = "❌ ВРЕМЯ ИСТЕКЛО";
    document.getElementById('endMessage').textContent = "К сожалению, время, отведенное на квест, закончилось. Вы не успели спасти Рождество. Пожалуйста, пройдите к организаторам.";
    document.getElementById('btnCloseModal').classList.remove('hidden'); // Allow them to close it
    modal.classList.remove('hidden');
    
    // Optionally: add a class to body to prevent all clicks/scrolling/interaction
    document.body.classList.add('game-over-mode');
};

// НОВЫЕ ФУНКЦИИ ДЛЯ РУЧНОГО ЗАПУСКА "ПОСЛЕДНЕГО ШАНСА" (из предыдущего запроса)
window.confirmForceLastChance = () => {
    if (!Core.state.me || Core.state.me.role !== 'leader') return alert("Нет доступа.");
    
    const confirmation = confirm("ВНИМАНИЕ! Вы уверены, что хотите принудительно запустить таймер 'Последний Шанс' для ВСЕХ команд? Это не обратимо.");
    
    if (confirmation) {
        window.forceLastChance();
    }
}

window.forceLastChance = () => {
    sessionStorage.setItem(LAST_CHANCE_FORCED_FLAG, 'true');
    
    let savedEndTime = Number(sessionStorage.getItem('lastChanceEndTime')) || 0;
    
    if (savedEndTime < Date.now()) {
        lastChanceEndTime = Date.now() + LAST_CHANCE_DURATION_MS;
        sessionStorage.setItem('lastChanceEndTime', lastChanceEndTime);
    } 

    lastChanceActive = true;
    document.getElementById('btnForceLastChance')?.classList.add('hidden');
    alert("Таймер 'Последний Шанс' успешно активирован для всех команд!");
    
    checkGlobalWinCondition(); 
}

// Новая функция: Отображение модального окна победы (п. 3)
window.showVictoryModal = (title, message) => {
    const modal = document.getElementById('endGameModal');
    document.getElementById('endTitle').textContent = title;
    document.getElementById('endMessage').textContent = message;
    document.getElementById('btnCloseModal').classList.remove('hidden');
    modal.classList.remove('hidden');
    // Останавливаем интервал спавна сугробов и таймер последнего шанса
    clearInterval(snowSpawnInterval);
    document.getElementById('lastChanceTimer').classList.add('hidden'); 
    lastChanceActive = false;
    sessionStorage.removeItem('lastChanceEndTime');
    sessionStorage.removeItem(LAST_CHANCE_FORCED_FLAG);
};


function createSnowEffect() {
    const cvs = document.getElementById('snowCanvas'); if(!cvs) return;
    const ctx = cvs.getContext('2d');
    let W=window.innerWidth, H=window.innerHeight;
    cvs.width=W; cvs.height=H;
    const f=Array.from({length:40},()=>({x:Math.random()*W,y:Math.random()*H,s:Math.random()+1}));
    setInterval(()=>{
        ctx.clearRect(0,0,W,H); ctx.fillStyle="rgba(255,255,255,0.7)"; ctx.beginPath();
        f.forEach(p=>{ctx.moveTo(p.x,p.y);ctx.arc(p.x,p.y,p.s,0,Math.PI*2);p.y+=p.s/2;if(p.y>H)p.y=-5;});ctx.fill();
    },40);
}

window.openItemsGuide = () => { 
    window.closeModal('itemsGuideModal');
    document.getElementById('itemsGuideModal').classList.remove('hidden'); 
    const tbody = document.querySelector('#itemsGuideModal tbody');
    if (!tbody) return;

    tbody.innerHTML = Object.values(Core.state.globalItems).map(i => {
        const iconHtml = (i.emoji && i.emoji.startsWith('http')) 
            ? `<img src="${i.emoji}" alt="${i.name}" style="width: 40px; height: 40px; object-fit: contain; filter: drop-shadow(0 0 1px #FFF);">` 
            : `${i.emoji || '❓'}`;
        return `<tr class="guide-item-row"><td class="guide-icon" style="font-size:2rem; text-align:center;">${iconHtml}</td><td class="guide-info" style="padding:10px;"><h4>${i.name}</h4><p class="muted">${i.description || 'Нет описания'}</p></td></tr>`;
    }).join('');
};

window.closeItemsGuide = () => window.closeModal('itemsGuideModal');


// ----------------------------------------------------
// ===== V. GLOBAL ACCESS & STARTUP (Final Step) =====
// ----------------------------------------------------

// ФИКС BUG 1: Явно делаем renderGameInterface глобальной функцией
window.renderGameInterface = renderGameInterface;


window.renderMarkers = renderMarkers;
window.showPopup = showPopup;
window.showMissionPopup = showMissionPopup;
window.toggleTask = window.toggleTask; 
window.handleItemUse = window.handleItemUse; 
window.useGadget = window.handleItemUse; 
window.handleScavengeInteraction = window.handleScavengeInteraction; 

window.openTradeModal = window.openTradeModal;
window.sendTradeRequest = window.sendTradeRequest;
window.openIncomingTrades = window.openIncomingTrades;
window.acceptTrade = window.acceptTrade;
window.rejectTrade = window.rejectTrade;
window.closeIncomingTrades = () => window.closeModal('incomingTradesModal');

window.locateMe = () => { renderMarkers(); }; 
window.openItemsGuide = openItemsGuide;
window.closeItemsGuide = closeItemsGuide;
window.openCraftModal = openCraftModal;
window.doCraft = doCraft;
window.leaveTent = window.leaveTent;
window.enterTent = window.enterTent;

// Start Game
initGame().catch(console.error);