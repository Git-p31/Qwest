import { 
    state, GADGET_COOLDOWN_MS, ROLES_DATA, CRAFT_RECIPES,
    authPlayer, refreshTeamData, fetchAllTeamsData, 
    setTentStatus, clearTentStatus, craftItemLogic, useGadgetLogic, setupRealtimeListeners,
    updateTaskAndInventory, fetchGlobalGameState, updateTeamFreezeStatus, 
    sendTradeRequest, fetchIncomingTrades, respondToTrade,
    scavengeItemLogic, SCAVENGER_COOLDOWN_MS,
    fetchStaticMapPoints,
    MISSION_PATH_STRUCTURE, fetchQuizData,
    SECRET_WORDS // ИМПОРТИРУЕМ ИЗ ENGINE.JS
} from './engine.js';

// =======================================================
// ===== I. UI CONFIG & GLOBAL STATE MANAGEMENT =====
// =======================================================

const TEAMS_UI_CONFIG = {
    101: { color: '#8be9fd', symbol: '❄️' },
    102: { color: '#ff5555', symbol: '🔴' },
    103: { color: '#f1fa8c', symbol: '💡' },
    104: { color: '#bd93f9', symbol: '🎅' },
};

// --- CONSTANTS ---
const TELEGRAM_GROUP_LINK = 'https://t.me/stuttgart_quest_group'; 
const MAX_SNOW_PILES = 5;

// --- DYNAMIC STATE ---
let map = null;
let mapMarkers = {};
let wasFrozen = false;
let timerUiInterval = null;
let hasShownVictory = false;
let staticMapPoints = []; 
let dynamicSnowPiles = []; 
let snowSpawnInterval = null;
let lastScavengeTime = Number(localStorage.getItem('lastScavengeTime')) || 0; 
let quizState = {
    currentTaskId: null, quizInProgress: false, quizData: [], 
    currentQuestionIndex: 0, correctCount: 0, successThreshold: 0,
};
window.selectedAnswers = {};


// ===== INITIALIZATION & CORE =====

async function initGame() {
    const player = await authPlayer();
    if (!player) return alert("Ошибка входа! Игрок не найден.");

    document.getElementById('myNameHeader').textContent = state.me.name;
    document.getElementById('myPlayerRole').textContent = ROLES_DATA[state.me.role] || state.me.role;
    
    // Role Buttons Visibility
    if (state.me.role === 'Spy') document.getElementById('btnSpyAction')?.classList.remove('hidden'); 
    if (state.me.role === 'Scavenger') document.getElementById('btnScavenge')?.classList.remove('hidden');
    if (state.me.role === 'Guardian') document.getElementById('btnGuardianWarm')?.classList.remove('hidden'); 
    if (['leader', 'Negotiator'].includes(state.me.role)) {
        document.getElementById('btnShowTrades')?.classList.remove('hidden');
    }

    staticMapPoints = await fetchStaticMapPoints();
    
    await fetchAllTeamsData();
    await refreshTeamData();
    
    initMapLogic();
    renderGameInterface();
    createSnowEffect();
    
    startSnowPileSpawning(); 

    setupRealtimeListeners(
        async (newTeam, oldTeam) => {
            Object.assign(state.currentTeam, newTeam);
            renderGameInterface();
        },
        (updatedTeam) => {
            renderMarkers(); 
            if (state.currentTeam?.current_tent_id && updatedTeam.current_tent_id === state.currentTeam.current_tent_id && updatedTeam.id !== state.me.team_id) {
                performExchange(updatedTeam);
            }
        }
    );

    if(['leader', 'Negotiator'].includes(state.me.role)) clearTentStatus();
}

// -------------------------------------------------------
// ===== II. UI RENDERING FUNCTIONS (Inventory, Tasks, Map) =====
// -------------------------------------------------------

function renderGameInterface() {
    if(!state.currentTeam) return;

    const uiCfg = TEAMS_UI_CONFIG[state.currentTeam.id] || {symbol: '🎄'};
    const name = state.currentTeam.name_by_leader || state.currentTeam.name;
    document.getElementById('myTeamName').innerHTML = `${name} ${uiCfg.symbol}`;
    if(state.currentTeam.selfie_url) document.getElementById('myTeamAvatar').style.backgroundImage = `url('${state.currentTeam.selfie_url}')`;

    renderInventory();
    renderTasks();
    renderMembers();
    checkFreezeState();
}

function renderInventory() {
    const list = document.getElementById('inventoryList'); list.innerHTML = '';
    const inv = state.currentTeam.inventory || {};
    let hasItems = false;

    Object.keys(inv).forEach(id => {
        if(inv[id] > 0) {
            hasItems = true;
            const item = state.globalItems[id] || {name:'???', emoji:'📦', type:'item'};
            let actionBtn = '';
            
            let iconHtml = (item.emoji && item.emoji.startsWith('http')) 
                ? `<img src="${item.emoji}" alt="${item.name}" style="width: 32px; height: 32px; object-fit: contain; filter: drop-shadow(0 0 1px #FFF);">` 
                : `<span style="font-size:1.5rem">${item.emoji}</span>`;

            if (item.type === 'gadget' && state.me.role === 'Saboteur') {
                const now = Date.now();
                const remaining = GADGET_COOLDOWN_MS - (now - state.lastGadgetUsage);
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
    
    const tasks = state.currentTeam.tasks || [];
    let completedCount = 0;

    tasks.forEach(task => {
        if(task.completed) completedCount++;
        const isChecked = task.completed ? 'checked disabled' : ''; 
        
        const reward = task.reward_item_id 
            ? (state.globalItems[task.reward_item_id]?.emoji || '🎁') 
            : '';

        let taskText = task.text;
        let onClickHandler = `window.toggleTask(${task.id}, this)`;
        
        if ([1, 2, 3, 4, 5, 6].includes(task.id) && !task.completed) {
               taskText = `<a href="#" onclick="window.routeTaskToModal(${task.id}); return false;" style="color: var(--accent-gold); text-decoration: none;">${task.text} (Начать)</a>`;
               onClickHandler = 'return;'; 
        }

        const tr = document.createElement('tr');
        tr.className = task.completed ? 'task-row completed' : 'task-row';
        
        tr.innerHTML = `
            <td style="text-align:center; width:30px;">
                <input type="checkbox" ${isChecked} onclick="${onClickHandler}">
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
    
    if (tasks.filter(t => [1, 2, 3, 4, 5, 6].includes(t.id)).every(t => t.completed) && !hasShownVictory) {
        hasShownVictory = true;
        alert("🎉 ПОЗДРАВЛЯЕМ! Вы выполнили все основные миссии! Идите к организаторам!");
    }
}

function renderMembers() {
    const list = document.getElementById('currentTeamMembersList');
    const countEl = document.getElementById('myTeamMembersCount');
    
    list.innerHTML = '';
    countEl.textContent = state.teamMembers.length;

    state.teamMembers.forEach(m => {
        const roleName = ROLES_DATA[m.role] || m.role;
        const isMe = m.id === state.me.id ? ' (Вы)' : '';
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
        state.otherTeams.forEach(t => {
            t.x = Math.max(10, Math.min(90, t.x + (Math.random() - 0.5) * 2)); 
            t.y = Math.max(10, Math.min(90, t.y + (Math.random() - 0.5) * 2));
        });
        renderMarkers();
    }, 3000);
}

function findActiveMission(tasks) {
    if (!tasks || tasks.length === 0) return null;
    
    const activeTask = tasks.find(t => !t.completed);
    if (!activeTask) return null; 
        
    let pathKey = '';
    if (state.me.team_id === 101 || state.me.team_id === 103) {
        pathKey = '101_103';
    } else if (state.me.team_id === 102 || state.me.team_id === 104) {
        pathKey = '102_104';
    }

    const pathSequence = MISSION_PATH_STRUCTURE[pathKey];
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
    
    const mission = findActiveMission(state.currentTeam.tasks);

    if (mission) {
        updateMarker(mission.id, mission.type, mission.x, mission.y, mission.title, mission, '🎯');
    } else {
        staticMapPoints.filter(p => p.type !== 'mission_stall').forEach(item => updateMarker(item.id, item.type, item.x, item.y, item.title, item, item.icon));
    }
    
    dynamicSnowPiles.forEach(item => updateMarker(item.id, 'snow_pile', item.x, item.y, item.title, item, '🧤'));
    
    state.otherTeams.forEach(t => {
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
    snowSpawnInterval = setInterval(spawnSnowPile, 30000); 
}


// -------------------------------------------------------
// ===== III. CORE GAME LOGIC (Tasks, Modals, Interactions) =====
// -------------------------------------------------------

window.toggleTask = async (taskId, checkboxEl) => {
    if(state.me.role !== 'leader') { 
        checkboxEl.checked = !checkboxEl.checked; 
        return alert("Только лидер может отмечать задачи!"); 
    }
    
    if ([1, 2, 3, 4, 5, 6].includes(taskId)) {
        alert("Это специальное задание. Его статус обновляется автоматически по результатам квиза/игры.");
        checkboxEl.checked = !checkboxEl.checked; 
        return;
    }

    const task = state.currentTeam.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const isChecking = checkboxEl.checked;
    let newInventory = { ...state.currentTeam.inventory };
    
    if (isChecking) {
        if (task.required_item_id) { 
            if ((newInventory[task.required_item_id] || 0) < 1) { 
                alert(`Не хватает предмета: ${state.globalItems[task.required_item_id]?.name || '???'}`); 
                checkboxEl.checked = false;
                return;
            }
            newInventory[task.required_item_id]--;
        }
        
        if (task.reward_item_id) { 
            const rewardId = task.reward_item_id;
            newInventory[rewardId] = (newInventory[rewardId] || 0) + 1;
            alert(`🎉 Получена награда: ${state.globalItems[rewardId]?.name}!`);
        }
    } 
    
    const newTasks = state.currentTeam.tasks.map(t => t.id === taskId ? {...t, completed: isChecking} : t);

    const result = await updateTaskAndInventory(state.me.team_id, newTasks, newInventory);
    
    if (!result.success) {
        console.error('Task update error:', result.error);
        alert('Ошибка сохранения задачи!');
        checkboxEl.checked = !isChecking;
        return;
    }
    renderMarkers();
    await refreshTeamData();
    renderGameInterface();
};

window.routeTaskToModal = (taskId) => {
    if (state.me.role !== 'leader') {
        return alert("Только лидер может запускать специальные задания (Квизы/Игры)!");
    }
    
    if (taskId === 1 || taskId === 4) {
        window.openQuizModal(taskId);
    } else if (taskId === 2) {
        window.openSecretWordModal(2, 'САМЫЙ ДЕШЕВЫЙ ПРЕДМЕТ', '💰', 'Найдите самый дешевый съедобный предмет (на ярмарке) и введите его название как секретное слово.');
    } else if (taskId === 3) {
        window.openSecretWordModal(3, 'ФОРМА ЗВЕЗДЫ', '⭐', 'Соберитесь командой и снимите видео, где вы делаете форму звезды. Отправьте видео в Telegram и получите слово.');
    } else if (taskId === 5) {
        window.openSecretWordModal(5, 'СПЕТЬ ПЕСЕНКУ', '🎤', 'Снимите видео, как ваша команда поет новогоднюю песню. Отправьте видео в Telegram и получите слово.');
    } else if (taskId === 6) {
        window.openTicTacToeModal();
    }
}

// --- ITEM USE & CRAFTING ---

window.handleItemUse = async (id) => {
    const now = Date.now();
    if(now - state.lastGadgetUsage < GADGET_COOLDOWN_MS) {
        const remaining = Math.ceil((GADGET_COOLDOWN_MS - (now - state.lastGadgetUsage)) / 1000);
        return alert(`Перезарядка: ${remaining} секунд.`);
    }
    
    if(id == 11) { // Ледяная Бомба
        const targetId = prompt("ID цели (101-104):");
        const targetTeam = state.otherTeams.find(t => t.id == targetId);
        if(!targetTeam) return alert("Команда не найдена или неверный ID");

        if ((state.currentTeam.inventory[id] || 0) < 1) return alert("У вас нет этого гаджета.");
        
        // useGadgetLogic обновляет state.lastGadgetUsage только при успехе
        const res = await useGadgetLogic(id, targetId); 
        if(res.success) {
            alert(`Успех! Команда ${targetTeam.name_by_leader || targetTeam.name} заморожена.`);
        } else {
            alert(res.msg);
        }
        await refreshTeamData();
        renderGameInterface();
    } else {
        alert("Гаджет не настроен для использования.");
    }
};

window.openCraftModal = () => {
    if(state.me.role !== 'Explorer') return alert("Только Исследователь!");
    window.closeModal('craftModal'); // Закрыть предыдущее, если открыто
    document.getElementById('craftModal').classList.remove('hidden');
    renderCraftUI();
};

function renderCraftUI() {
    const cont = document.getElementById('craftRecipesList'); cont.innerHTML = '';
    const inv = state.currentTeam.inventory || {};
    
    CRAFT_RECIPES.forEach(r => {
        const resItem = state.globalItems[r.resultId];
        let can = true;
        const ingHTML = r.ingredients.map(ing => {
            const item = state.globalItems[ing.id];
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
    const res = await craftItemLogic(rid);
    if(res.success) { alert(`Создано: ${res.itemName}`); renderCraftUI(); renderGameInterface(); }
    else alert(res.msg);
};

// --- SCAVENGE LOGIC ---

window.handleScavengeInteraction = async (snowPileId) => {
    if (state.me.role !== 'Scavenger') return alert("Это могут делать только Кладоискатели!");

    const now = Date.now();
    const timePassed = now - lastScavengeTime;
    
    if (timePassed < SCAVENGER_COOLDOWN_MS) {
        const remaining = Math.ceil((SCAVENGER_COOLDOWN_MS - timePassed) / 1000);
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

    const result = await scavengeItemLogic();
    
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
        
        await refreshTeamData(); 
        renderGameInterface();
    } else {
        alert("Ошибка поиска: " + result.message);
        descEl.innerHTML = originalDesc;
        btns.innerHTML = originalBtns;
    }
}

// --- QUIZ LOGIC FUNCTIONS ---

window.openQuizModal = async (taskId) => {
    if (state.me.role !== 'leader') return alert("Только лидер может запускать квизы!");

    const modal = document.getElementById('quizModal');
    const quizContent = document.getElementById('quizQuestionsContainer');
    const titleEl = document.getElementById('quizModalTitle');
    const teamId = state.me.team_id;

    quizContent.innerHTML = '<div style="text-align: center; padding: 20px;">Загрузка вопросов...</div>';
    document.getElementById('quizFinalMessage').innerHTML = '';
    document.getElementById('quizScoreDisplay').innerHTML = '';
    document.getElementById('quizSubmitBtn')?.classList.add('hidden');
    
    modal.classList.remove('hidden');

    const quizData = await fetchQuizData(taskId, teamId); 
    
    if (!quizData || quizData.length === 0) {
        quizContent.innerHTML = '<p class="muted" style="text-align: center;">❌ Вопросы для вашей команды не найдены. Свяжитесь с организатором.</p>';
        return;
    }
    
    quizState.currentTaskId = taskId;
    quizState.quizData = quizData;
    quizState.currentQuestionIndex = 0;
    quizState.correctCount = 0;
    quizState.quizInProgress = true;
    quizState.successThreshold = Math.ceil(quizData.length / 2) + 1;
    
    titleEl.textContent = taskId === 4 ? '📜 КВИЗ: Немецкие традиции' : '🎬 ЗАДАНИЕ 1: Угадай Сюжет/Персонажа';
    
    const isSequential = (taskId === 4); 
    
    if (isSequential) {
        if (!quizData[0] || !quizData[0].options) {
             quizContent.innerHTML = `<p class="muted" style="text-align: center; color: var(--accent-red);">❌ Критическая ошибка: Для задания №${taskId} не найдены варианты ответа (опции) в базе данных.</p>`;
             return;
        }
        window.renderSequentialQuestion();
    } else {
        window.renderBulkQuiz(quizData, taskId);
    }
};

window.renderSequentialQuestion = () => {
    const container = document.getElementById('quizQuestionsContainer');
    const scoreDisplay = document.getElementById('quizScoreDisplay');
    
    if (!quizState.quizInProgress || quizState.currentQuestionIndex >= quizState.quizData.length) {
        window.finalizeQuizResult(quizState.currentTaskId, quizState.quizData.length, quizState.correctCount, quizState.successThreshold);
        return;
    }

    const currentItem = quizState.quizData[quizState.currentQuestionIndex];
    let optionsArray = [];
    
    let optionsString = currentItem.options;

    // --- УЛУЧШЕННЫЙ ПАРСИНГ JSONB ---
    // 1. Убираем потенциальный префикс типа "(N) "
    const match = String(optionsString).trim().match(/^\((\d+)\)\s*(.*)/);
    if (match) {
        optionsString = match[2];
    }
    
    // Если опции все еще строка, пытаемся распарсить
    if (typeof optionsString === 'string' && optionsString.trim().length > 0) {
        try {
            // Если строка обернута в кавычки (из-за некорректного ввода)
            if (optionsString.startsWith('"') && optionsString.endsWith('"')) {
                 optionsString = optionsString.substring(1, optionsString.length - 1);
            }
            optionsArray = JSON.parse(optionsString);
        } catch (e) {
            console.error("Failed to parse options JSON:", optionsString, e);
            container.innerHTML = `<p class="muted" style="text-align: center; color: var(--accent-red);">❌ Критическая ошибка: Неверный формат вариантов ответа. (Невалидный JSONB)</p>`;
            document.getElementById('quizSubmitBtn')?.classList.add('hidden');
            return; 
        }
    } else if (Array.isArray(optionsString)) {
        // Если база данных вернула уже распарсенный JSONB массив
        optionsArray = optionsString;
    } else {
         container.innerHTML = `<p class="muted" style="text-align: center; color: var(--accent-red);">❌ Критическая ошибка: Варианты ответа пусты или отсутствуют.</p>`;
         document.getElementById('quizSubmitBtn')?.classList.add('hidden');
         return;
    }
    
    if (!optionsArray || optionsArray.length === 0) {
         container.innerHTML = `<p class="muted" style="text-align: center; color: var(--accent-red);">❌ Критическая ошибка: Варианты ответа пусты или отсутствуют.</p>`;
         document.getElementById('quizSubmitBtn')?.classList.add('hidden');
         return;
    }
    // --- КОНЕЦ УЛУЧШЕННОГО ПАРСИНГА ---
    
    scoreDisplay.innerHTML = `Вопрос ${quizState.currentQuestionIndex + 1} из ${quizState.quizData.length} (Верно: <span style="color: var(--accent-gold);">${quizState.correctCount}</span>)`;

    let buttonsHtml = optionsArray.map((option, optIndex) => {
        const escapedOption = option.replace(/'/g, "\\'"); 
        
        return `<button class="quiz-answer-btn" data-answer="${option}" 
                    onclick="window.handleSequentialAnswer(this, ${currentItem.id}, '${escapedOption}')">
                    ${String.fromCharCode(65 + optIndex)}. ${option}
                </button>`;
    }).join('');

    container.innerHTML = `
        <div class="quiz-question-box">
            <p style="font-weight: 900; font-size: 1.3rem; margin-bottom: 20px;">${currentItem.q}</p>
            <div class="quiz-options-grid" id="q_options_${currentItem.id}">
                ${buttonsHtml}
            </div>
        </div>
    `;
    
    document.getElementById('quizSubmitBtn')?.classList.add('hidden');
};


window.handleSequentialAnswer = (button, questionId, selectedAnswer) => {
    if (!quizState.quizInProgress) return;
    
    const currentItem = quizState.quizData[quizState.currentQuestionIndex];
    const isCorrect = (selectedAnswer === currentItem.a);
    
    const parentGrid = button.closest('.quiz-options-grid');
    parentGrid.querySelectorAll('.quiz-answer-btn').forEach(btn => btn.disabled = true);
    
    if (isCorrect) {
        quizState.correctCount++;
        button.classList.add('correct-flash');
    } else {
        button.classList.add('incorrect');
        parentGrid.querySelectorAll('.quiz-answer-btn').forEach(btn => {
            if (btn.dataset.answer === currentItem.a) {
                btn.classList.add('correct-flash');
            }
        });
    }

    quizState.currentQuestionIndex++;
    
    setTimeout(window.renderSequentialQuestion, 2000);
};

window.renderBulkQuiz = (quizData, taskId) => {
    const container = document.getElementById('quizQuestionsContainer');
    const scoreDisplay = document.getElementById('quizScoreDisplay');
    
    let questionsHtml = quizData.map((item, index) => `
        <div class="quiz-question-box" style="margin-bottom: 20px;" data-question-id="${item.id}" data-type="text">
            <p style="font-weight: 700; font-size: 1.1rem; margin-bottom: 10px;">${index + 1}. ${item.q}</p>
            <input type="text" id="q_input_${item.id}" class="modal-input quiz-text-input" placeholder="Введите ответ (одно слово)">
        </div>
    `).join('');
    
    container.innerHTML = questionsHtml;
    
    const totalQuestions = quizData.length;
    const successThreshold = Math.ceil(totalQuestions / 2) + 1;

    document.getElementById('quizSubmitBtn').classList.remove('hidden');
    document.getElementById('quizSubmitBtn').onclick = () => window.handleBulkSubmit(taskId, quizData);

    scoreDisplay.innerHTML = `Всего вопросов: ${totalQuestions}. Требуется ${successThreshold} для успеха.`;
};


window.handleBulkSubmit = async (taskId, quizData) => {
    let correctCount = 0;
    const totalQuestions = quizData.length;
    const successThreshold = Math.ceil(totalQuestions / 2) + 1;
    
    quizData.forEach((item) => {
        const inputEl = document.getElementById(`q_input_${item.id}`);
        if (!inputEl) return;
        
        const submittedAnswer = inputEl.value.trim();
        inputEl.disabled = true;
        
        const correctAnswer = (item.a || '').toUpperCase(); 
        
        if (submittedAnswer.toUpperCase() === correctAnswer && correctAnswer.length > 0) {
            correctCount++;
            inputEl.style.backgroundColor = 'rgba(0, 214, 143, 0.2)';
            inputEl.style.borderColor = 'var(--accent-green)';
        } else {
            inputEl.style.backgroundColor = 'rgba(217, 0, 38, 0.2)';
            inputEl.style.borderColor = 'var(--accent-red)';
            if (correctAnswer.length > 0) {
                 inputEl.value = `${submittedAnswer} (❌ Ответ: ${item.a})`;
            }
        }
    });

    window.finalizeQuizResult(taskId, totalQuestions, correctCount, successThreshold);
};

window.finalizeQuizResult = async (taskId, totalQuestions, correctCount, successThreshold) => {
    const resultMsg = document.getElementById('quizFinalMessage');
    const container = document.getElementById('quizQuestionsContainer');
    const passed = correctCount >= successThreshold;
    
    quizState.quizInProgress = false; 
    document.getElementById('quizSubmitBtn')?.classList.add('hidden'); 
    
    if (passed) {
        resultMsg.innerHTML = `<span style="color: var(--accent-green);">🎉 УСПЕХ! ${correctCount} из ${totalQuestions} верных. Задание №${taskId} выполнено!</span>`;
        
        const task = state.currentTeam.tasks.find(t => t.id === taskId);
        if (task && !task.completed) {
            let newInventory = { ...state.currentTeam.inventory };
            
            if (task.reward_item_id) { 
                const rewardId = task.reward_item_id;
                newInventory[rewardId] = (newInventory[rewardId] || 0) + 1;
                alert(`🎉 Получена награда: ${state.globalItems[rewardId]?.name}!`);
            }
            
            const newTasks = state.currentTeam.tasks.map(t => t.id === taskId ? {...t, completed: true} : t);
            const result = await updateTaskAndInventory(state.me.team_id, newTasks, newInventory);
            if (!result.success) {
                console.error('Task auto-update error:', result.error);
                alert('Ошибка автоматического сохранения задачи!');
            }
        }
        
    } else {
        resultMsg.innerHTML = `<span style="color: var(--accent-red);">❌ ПРОВАЛ! Требуется ${successThreshold}.</span><br>Ваша команда будет ЗАМОРОЖЕНА на 2 минуты!`;
        
        const freezeDurationMs = 2 * 60 * 1000; 
        await updateTeamFreezeStatus(state.me.team_id, freezeDurationMs);
    }
    
    await refreshTeamData(); 
    renderGameInterface();
    
    container.innerHTML = `<div style="text-align: center; margin-top: 20px;">
                            <button class="start-button" onclick="window.closeModal('quizModal'); renderMarkers();">
                                ЗАКРЫТЬ
                            </button>
                            </div>`;
};


// --- SECRET WORD LOGIC ---

window.openSecretWordModal = (taskId, title, icon, description) => {
    if (state.me.role !== 'leader') return alert("Только лидер может запускать задания с секретным словом!");

    const modal = document.getElementById('secretWordModal');
    
    document.getElementById('swModalTitle').textContent = `ЗАДАНИЕ ${taskId}: ${title}`;
    document.getElementById('swModalIcon').innerHTML = icon;
    
    const telegramLinkHTML = `<p style="font-size: 1.1rem; color: var(--text-main); margin-bottom: 15px;">${description}</p>`;
    
    document.getElementById('swModalDesc').innerHTML = telegramLinkHTML;
    document.getElementById('swModalTelegramLink').href = TELEGRAM_GROUP_LINK;
    
    document.getElementById('swModalStatus').textContent = '';
    document.getElementById('secretWordInput').value = '';
    document.getElementById('secretWordInput').disabled = false;
    document.getElementById('swModalSubmitBtn').disabled = false;
    
    document.getElementById('swModalSubmitBtn').setAttribute('onclick', `window.handleSecretWordSubmit(${taskId})`);
    
    modal.classList.remove('hidden');
};

window.handleSecretWordSubmit = async (taskId) => {
    if (state.me.role !== 'leader') return alert("Только лидер может отправлять ответ!");
    
    const input = document.getElementById('secretWordInput');
    const statusEl = document.getElementById('swModalStatus');
    const correctWord = SECRET_WORDS[taskId]; 
    
    if (!correctWord) {
        statusEl.textContent = 'Ошибка: Задание не настроено.';
        statusEl.style.color = 'var(--accent-red)';
        return;
    }

    const submittedWord = input.value.trim().toUpperCase();

    if (submittedWord === correctWord.toUpperCase()) {
        statusEl.textContent = '✅ Правильно! Задание выполнено.';
        statusEl.style.color = 'var(--accent-green)';
        input.disabled = true;
        document.getElementById('swModalSubmitBtn').disabled = true;
        
        const task = state.currentTeam.tasks.find(t => t.id === taskId);
        if (task && !task.completed) {
            let newInventory = { ...state.currentTeam.inventory };
            
            if (task.reward_item_id) { 
                const rewardId = task.reward_item_id;
                newInventory[rewardId] = (newInventory[rewardId] || 0) + 1;
                alert(`🎉 Получена награда: ${state.globalItems[rewardId]?.name}!`);
            }
            
            const newTasks = state.currentTeam.tasks.map(t => t.id === taskId ? {...t, completed: true} : t);
            const result = await updateTaskAndInventory(state.me.team_id, newTasks, newInventory);
            if (!result.success) {
                 console.error('Task auto-update error:', result.error);
                 alert('Ошибка автоматического сохранения задачи!');
            }
            
            await refreshTeamData();
            renderGameInterface();
        }
        
    } else {
        statusEl.textContent = '❌ Неверное слово. Попробуйте еще раз.';
        statusEl.style.color = 'var(--accent-red)';
    }
};

// --- TIC TAC TOE LOGIC ---

window.openTicTacToeModal = () => {
    if (state.me.role !== 'leader') return alert("Только лидер может запускать финальную игру!");
    
    const modal = document.getElementById('ticTacToeModal');
    const teamSelect = document.getElementById('tttTargetTeam');
    
    teamSelect.innerHTML = '<option value="">Выберите команду для вызова</option>';
    state.otherTeams.forEach(t => {
        const isFrozen = t.frozen_until && new Date(t.frozen_until) > new Date();
        const frozenText = isFrozen ? ' (Заморожена!)' : '';
        const isDisabled = isFrozen ? 'disabled' : '';

        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.name_by_leader || t.name} ${TEAMS_UI_CONFIG[t.id]?.symbol || ''} ${frozenText}`;
        opt.disabled = isDisabled;
        teamSelect.appendChild(opt);
    });

    document.getElementById('tttSelectOpponent').classList.remove('hidden');
    document.getElementById('tttGameContainer').classList.add('hidden');
    document.getElementById('tttStatusMessage').textContent = 'Выберите команду и отправьте вызов:';
    document.getElementById('gameBoardPlaceholder').innerHTML = '';
    
    modal.classList.remove('hidden');
};

window.sendGameChallenge = async () => {
    if (state.me.role !== 'leader') return alert("Только лидер может отправлять вызов!");

    const targetSelect = document.getElementById('tttTargetTeam');
    const targetId = Number(targetSelect.value);
    const targetName = targetSelect.options[targetSelect.selectedIndex].textContent;
    
    if (!targetId) return alert('Выберите команду!');
    
    document.getElementById('tttStatusMessage').textContent = `⏳ Вызов отправлен команде ${targetName}. Ожидайте результата.`;
    document.getElementById('tttSelectOpponent').classList.add('hidden');
    document.getElementById('tttGameContainer').classList.remove('hidden');
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const teamWon = Math.random() < 0.5; 
    
    window.handleTicTacToeResult(teamWon);
};

window.handleTicTacToeResult = async (attackerWon) => {
    const taskId = 6;
    let resultMessage;

    if (attackerWon) {
        resultMessage = `🎉 ПОБЕДА! Вы выиграли в Крестики-нолики! Задание №${taskId} выполнено!`;
        
        const task = state.currentTeam.tasks.find(t => t.id === taskId);
        if (task && !task.completed) {
            let newInventory = { ...state.currentTeam.inventory };
            
            if (task.reward_item_id) { 
                const rewardId = task.reward_item_id;
                newInventory[rewardId] = (newInventory[rewardId] || 0) + 1;
                alert(`🎉 Получена награда: ${state.globalItems[rewardId]?.name}!`);
            }
            
            const newTasks = state.currentTeam.tasks.map(t => t.id === taskId ? {...t, completed: true} : t);
            const result = await updateTaskAndInventory(state.me.team_id, newTasks, newInventory);
            if (!result.success) {
                 console.error('Task auto-update error:', result.error);
                 alert('Ошибка автоматического сохранения задачи!');
            }
        }
    } else {
        const freezeDurationMs = 2 * 60 * 1000;
        resultMessage = `❌ ПОРАЖЕНИЕ! Ваша команда ЗАМОРОЖЕНА на 2 минуты. Повторная попытка будет доступна после разморозки.`;
        
        await updateTeamFreezeStatus(state.me.team_id, freezeDurationMs);
    }
    
    await refreshTeamData(); 
    renderGameInterface();

    document.getElementById('tttStatusMessage').textContent = resultMessage;
    document.getElementById('gameBoardPlaceholder').innerHTML = `<h3 style="color:${attackerWon ? 'var(--accent-green)' : 'var(--accent-red)'}; font-size: 1.5rem;">${attackerWon ? 'УСПЕХ' : 'ПОРАЖЕНИЕ'}!</h3>`;
    
    document.getElementById('tttGameContainer').innerHTML += `<button class="start-button" style="margin-top: 15px;" onclick="window.closeModal('ticTacToeModal'); renderGameInterface();">ГОТОВО</button>`;
};

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
        if (['leader', 'Negotiator'].includes(state.me.role)) {
            btns.innerHTML = `<button class="start-button" onclick="window.enterTent('${id}')">ПРИЙТИ В ПАЛАТКУ</button>`;
            descEl.innerHTML += `<p style="margin-top:10px; font-size:0.9rem; color:var(--text-muted);">Приходите в эту палатку. Если другая команда придет сюда, начнется обмен.</p>`;
        } else {
            descEl.innerHTML += `<br><br><span class="muted" style="color:#ff5555">Только Лидер или Переговорщик могут инициировать обмен.</span>`;
            btns.innerHTML = `<button class="start-button" onclick="window.closeModal('interactionModal')">ЗАКРЫТЬ</button>`;
        }
    } else if (type === 'npc') {
        iconEl.innerHTML = item.icon || '👤';
        btns.innerHTML = `<button class="start-button" onclick="window.closeModal('interactionModal')">ЗАКРЫТЬ</button>`;
    } else if (type === 'snow_pile') {
        const isScavenger = state.me.role === 'Scavenger';
        const now = Date.now();
        const remaining = SCAVENGER_COOLDOWN_MS - (now - lastScavengeTime);
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
    
    if (state.me.role !== 'leader') {
        btns.innerHTML = `<p style="color:var(--accent-red); margin-top:10px;">Только лидер может начать это задание.</p><button class="start-button" style="margin-top:10px;" onclick="window.closeModal('interactionModal')">ЗАКРЫТЬ</button>`;
        modal.classList.remove('hidden');
        return;
    }

    let buttonAction = `window.routeTaskToModal(${missionData.taskId}); window.closeModal('interactionModal');`;
    let buttonText;

    if (missionData.taskId === 1 || missionData.taskId === 4) {
        buttonText = `ПЕРЕЙТИ К ЗАДАНИЮ ${missionData.taskId} (Викторина)`;
    } else if ([2, 3, 5].includes(missionData.taskId)) {
        buttonText = `ПЕРЕЙТИ К ЗАДАНИЮ ${missionData.taskId} (Секретное слово)`;
    } else if (missionData.taskId === 6) {
        buttonText = `ПЕРЕЙТИ К ЗАДАНИЮ 6 (Финал)`;
    } else {
        buttonText = "ЗАКРЫТЬ";
        buttonAction = `window.closeModal('interactionModal')`;
    }
    
    btns.innerHTML = `<button class="start-button" onclick="${buttonAction}">${buttonText}</button>`;
    
    modal.classList.remove('hidden');
}

// --- TENT LOGIC ---

window.enterTent = async (tentId) => {
    const descEl = document.getElementById('interactDesc');
    const btns = document.getElementById('interactButtons');

    descEl.innerHTML = `<div class="tent-waiting"><div class="loader-spinner"></div><p style="font-size:1.1rem; margin-bottom:5px;">Ждем другую команду...</p><p class="muted" style="font-size:0.8rem; line-height:1.4;">Когда вторая команда придет сюда, обмен произойдет автоматически.</p></div>`;
    btns.innerHTML = `<button class="secondary" style="border:1px solid #555; color:#ccc;" onclick="window.leaveTent()">Отмена</button>`;
    
    const partner = await setTentStatus(tentId);
    
    if(partner) performExchange(partner);
};

window.leaveTent = async () => {
    window.closeModal('interactionModal');
    await clearTentStatus(); 
};

function performExchange(partner) {
    const descEl = document.getElementById('interactDesc');
    const btns = document.getElementById('interactButtons');
    
    if(document.getElementById('interactionModal').classList.contains('hidden')) {
        clearTentStatus();
        return;
    }

    descEl.innerHTML = `<div style="text-align:center; padding:20px;"><div style="font-size:3rem;">✅</div><h3 style="color:#00D68F; margin:10px 0;">ОБНАРУЖЕН ПАРТНЕР!</h3><p>Начало обмена с командой:</p><strong style="color:var(--accent-gold); font-size:1.2rem;">${partner.name_by_leader || partner.name}</strong></div>`;
    btns.innerHTML = `<button class="start-button" onclick="window.leaveTent()">Готово</button>`;
    
    if(navigator.vibrate) navigator.vibrate([100, 50, 100]);
}


// --- TRADE LOGIC ---

window.openTradeModal = () => {
    if (!['leader', 'Negotiator'].includes(state.me.role)) {
        alert('Только Лидер или Переговорщик могут предлагать обмен.');
        return;
    }

    const modal = document.getElementById('tradeModal');
    modal.classList.remove('hidden');

    const teamSelect = document.getElementById('tradeTargetTeam');
    teamSelect.innerHTML = '<option value="">Выберите команду</option>';
    state.otherTeams.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.name_by_leader || t.name} ${TEAMS_UI_CONFIG[t.id]?.symbol || ''}`;
        teamSelect.appendChild(opt);
    });

    const inv = state.currentTeam.inventory || {};
    const offerSel = document.getElementById('tradeOfferSelect');
    const reqSel = document.getElementById('tradeRequestSelect');
    offerSel.innerHTML = '<option value="">Что отдать? (У вас:)</option>';
    reqSel.innerHTML = '<option value="">Что получить?</option>';

    Object.entries(inv)
        .filter(([id, count]) => count > 0)
        .forEach(([id, count]) => {
            const item = state.globalItems[id];
            if (!item) return;

            const opt1 = document.createElement('option');
            opt1.value = id;
            opt1.textContent = `${item.emoji || '📦'} ${item.name} ×${count}`;
            offerSel.appendChild(opt1);
        });

    Object.values(state.globalItems).forEach(item => {
        const opt2 = document.createElement('option');
        opt2.value = item.id;
        opt2.textContent = `${item.emoji || '🎁'} ${item.name}`;
        reqSel.appendChild(opt2);
    });
};

window.sendTradeRequest = async () => {
    const to = Number(document.getElementById('tradeTargetTeam').value);
    const offer = Number(document.getElementById('tradeOfferSelect').value);
    const request = Number(document.getElementById('tradeRequestSelect').value);

    if (!to || !offer || !request) return alert('Заполните все поля');

    const res = await sendTradeRequest(to, offer, request);
    if (res.success) {
        alert('✅ Предложение отправлено! Ждите, пока команда-цель примет его.');
        window.closeModal('tradeModal');
    } else {
        alert('❌ ' + res.msg);
    }
};

window.openIncomingTrades = async () => {
    const trades = await fetchIncomingTrades();
    const list = document.getElementById('incomingTradesList');
    list.innerHTML = trades.length === 0 
        ? '<p class="muted" style="padding:15px;">Нет входящих предложений</p>'
        : trades.map(t => {
            const offer = state.globalItems[t.offer_item_id];
            const req = state.globalItems[t.request_item_id];
            const myInv = state.currentTeam.inventory || {};
            const canFulfill = (myInv[t.request_item_id] || 0) >= 1;

            return `<div class="incoming-trade-card"><p><strong>${t.from_team_name}</strong> предлагает:</p><p>📤 ${offer?.emoji || '📦'} ${offer?.name || '???'}</p><p>в обмен на:</p><p style="color:${canFulfill ? 'var(--accent-green)' : 'var(--accent-red)'}">📥 ${req?.emoji || '🎁'} ${req?.name || '???'} ${!canFulfill ? ' (у вас нет)' : ''}</p><div style="display:flex; gap:10px; margin-top:12px;"><button class="start-button" ${!canFulfill ? 'disabled' : ''} onclick="window.acceptTrade(${t.id})">Принять</button><button class="secondary" onclick="window.rejectTrade(${t.id})">Отклонить</button></div></div>`;
        }).join('');

    document.getElementById('incomingTradesModal').classList.remove('hidden');
};

window.acceptTrade = async (id) => {
    const res = await respondToTrade(id, true);
    if (res.success) {
        alert('Обмен выполнен!');
        await refreshTeamData();
        renderGameInterface();
        window.openIncomingTrades();
    } else {
        alert('Ошибка: ' + res.msg);
    }
};

window.rejectTrade = async (id) => {
    await respondToTrade(id, false);
    window.openIncomingTrades();
};

window.closeModal = (id) => document.getElementById(id).classList.add('hidden'); // Упрощенная функция закрытия

// --- UTILITY & EFFECTS ---

function checkFreezeState() {
    const isFrozen = state.currentTeam?.frozen_until && new Date(state.currentTeam.frozen_until) > new Date();
    const overlay = document.getElementById('iceOverlay');
    
    if(isFrozen && !wasFrozen) {
        document.body.classList.add('frozen-mode', 'body-shake');
        overlay.classList.remove('hidden'); overlay.classList.add('smash');
        wasFrozen = true;
    } else if(!isFrozen && wasFrozen) {
        document.body.classList.remove('frozen-mode', 'body-shake');
        overlay.classList.add('hidden');
        wasFrozen = false;
    }
}

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

    tbody.innerHTML = Object.values(state.globalItems).map(i => {
        const iconHtml = (i.emoji && i.emoji.startsWith('http')) 
            ? `<img src="${i.emoji}" alt="${i.name}" style="width: 40px; height: 40px; object-fit: contain; filter: drop-shadow(0 0 1px #FFF);">` 
            : `${i.emoji || '❓'}`;
        return `<tr class="guide-item-row"><td class="guide-icon" style="font-size:2rem; text-align:center;">${iconHtml}</td><td class="guide-info" style="padding:10px;"><h4>${i.name}</h4><p class="muted">${i.description || 'Нет описания'}</p></td></tr>`;
    }).join('');
};

window.closeItemsGuide = () => window.closeModal('itemsGuideModal');


// ----------------------------------------------------
// ===== V. GLOBAL ACCESS & STARTUP =====
// ----------------------------------------------------

// Make core functions globally accessible (window.)
window.renderMarkers = renderMarkers;
window.showPopup = showPopup;
window.showMissionPopup = showMissionPopup;
window.openQuizModal = openQuizModal;
window.renderSequentialQuestion = renderSequentialQuestion;
window.handleSequentialAnswer = handleSequentialAnswer;
window.renderBulkQuiz = renderBulkQuiz;
window.handleBulkSubmit = handleBulkSubmit;
window.finalizeQuizResult = finalizeQuizResult;
window.openSecretWordModal = openSecretWordModal; 
window.handleSecretWordSubmit = handleSecretWordSubmit;
window.openTicTacToeModal = openTicTacToeModal; 
window.sendGameChallenge = sendGameChallenge;
window.handleTicTacToeResult = handleTicTacToeResult;
window.toggleTask = window.toggleTask; 
window.routeTaskToModal = routeTaskToModal; 
window.handleItemUse = handleItemUse; 
window.useGadget = handleItemUse; 
window.handleScavengeInteraction = handleScavengeInteraction; 

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