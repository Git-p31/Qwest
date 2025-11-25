import { 
    state, GADGET_COOLDOWN_MS, ROLES_DATA, CRAFT_RECIPES,
    authPlayer, refreshTeamData, fetchAllTeamsData, 
    setTentStatus, clearTentStatus, craftItemLogic, useGadgetLogic, setupRealtimeListeners,
    updateTaskAndInventory, fetchGlobalGameState,
    sendTradeRequest, fetchIncomingTrades, respondToTrade,
    scavengeItemLogic, SCAVENGER_COOLDOWN_MS,
    fetchStaticMapPoints // <-- ИМПОРТ ДЛЯ ЗАГРУЗКИ ТОЧЕК КАРТЫ ИЗ БД
} from './engine.js';

// ===== UI CONFIG and GLOBALS =====
const TEAMS_UI_CONFIG = {
    101: { color: '#8be9fd', symbol: '❄️' },
    102: { color: '#ff5555', symbol: '🔴' },
    103: { color: '#f1fa8c', symbol: '💡' },
    104: { color: '#bd93f9', symbol: '🎅' },
};

// ХАРДКОД STATIC_MAP_ITEMS УДАЛЕН. Точки будут загружены в staticMapPoints.

let map = null;
let mapMarkers = {};
let wasFrozen = false;
let timerUiInterval = null;
let hasShownVictory = false;

// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ КАРТЫ И КЛАДОИСКАТЕЛЯ
let staticMapPoints = []; // Точки (Tent, NPC) из БД
let dynamicSnowPiles = []; // Динамические сугробы
let snowSpawnInterval = null;
let lastScavengeTime = Number(localStorage.getItem('lastScavengeTime')) || 0; 
const MAX_SNOW_PILES = 5;

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

    // ЗАГРУЗКА СТАТИЧЕСКИХ ТОЧЕК КАРТЫ ИЗ БД
    staticMapPoints = await fetchStaticMapPoints();
    
    await fetchAllTeamsData();
    await refreshTeamData();
    
    initMapLogic();
    renderGameInterface();
    createSnowEffect();
    
    startSnowPileSpawning(); // ЗАПУСК СПАВНА СУГРОБОВ

    setupRealtimeListeners(
        async (newTeam, oldTeam) => {
            await refreshTeamData(); 
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

// ================= UI RENDERERS =================

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
            
            if (item.type === 'gadget' && state.me.role === 'Saboteur') {
                actionBtn = `<button class="btn-use" onclick="window.handleItemUse(${id})">USE</button>`;
            } else if (item.type === 'gadget') {
                actionBtn = `<span style="font-size:0.7rem; opacity:0.5;">(Гаджет)</span>`;
            }

            list.innerHTML += `
            <li>
                <div style="display:flex;align-items:center;gap:10px; flex-grow: 1;">
                    <span style="font-size:1.5rem">${item.emoji}</span> 
                    <div style="display:flex; flex-direction:column;">
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

    if (tasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="muted" style="text-align:center; padding:15px;">Нет активных задач</td></tr>';
        progressEl.textContent = '0%';
        return;
    }

    tasks.forEach(task => {
        if(task.completed) completedCount++;
        const isChecked = task.completed ? 'checked disabled' : ''; 
        const isDisabled = state.me.role !== 'leader' ? 'disabled' : '';
        
        const reward = task.reward_item_id 
            ? (state.globalItems[task.reward_item_id]?.emoji || '🎁') 
            : '';

        const tr = document.createElement('tr');
        tr.className = task.completed ? 'task-row completed' : 'task-row';
        tr.innerHTML = `
            <td style="text-align:center; width:30px;">
                <input type="checkbox" ${isChecked} ${isDisabled} onclick="window.toggleTask(${task.id}, this)">
            </td>
            <td>${task.text}</td>
            <td style="text-align:center; font-size:1.2rem;">${reward}</td>
        `;
        tbody.appendChild(tr);
    });

    progressEl.textContent = Math.round((completedCount / tasks.length) * 100) + '%';
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

// ================= ЗАДАЧИ И НАГРАДЫ (CORE) =================
window.toggleTask = async (taskId, checkboxEl) => {
    if(state.me.role !== 'leader') { 
        checkboxEl.checked = !checkboxEl.checked; 
        return alert("Только лидер может отмечать задачи!"); 
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
};

// ================= СПРАВОЧНИК (ФИКС БАГА 1) =================

window.openItemsGuide = () => { 
    document.getElementById('itemsGuideModal').classList.remove('hidden'); 
    const tbody = document.querySelector('#itemsGuideModal tbody');
    if (!tbody) return;

    tbody.innerHTML = Object.values(state.globalItems).map(i => `
        <tr class="guide-item-row">
            <td class="guide-icon" style="font-size:2rem; text-align:center;">${i.emoji || '❓'}</td>
            <td class="guide-info" style="padding:10px;">
                <h4>${i.name}</h4>
                <p class="muted">${i.description || 'Нет описания'}</p>
            </td>
        </tr>
    `).join('');
};

window.closeItemsGuide = () => document.getElementById('itemsGuideModal').classList.add('hidden');


// ================= ГЛОБАЛЬНЫЙ СТАТУС И ТАЙМЕР (ВОССТАНОВЛЕНО) =================

async function checkGlobalGameState() {
    const teams = await fetchGlobalGameState(); 
    if (!teams) return;
    
    const winners = teams.filter(t => t.tasks && t.tasks.length > 0 && t.tasks.every(task => task.completed));
    const amIWinner = winners.some(w => w.id === state.me.team_id);
    const lastChanceEl = document.getElementById('lastChanceTimer');
    const timerEl = document.getElementById('timerCountdown');
    
    // 1. Победа 
    if (amIWinner && !hasShownVictory) { 
        console.log("ПОБЕДА!");
        hasShownVictory = true; 
    }
    
    // 2. Последний шанс (Нужно хотя бы 2 победителя)
    if (winners.length >= 2 && !amIWinner) {
        const secondWinnerTime = new Date(winners[1].updated_at).getTime();
        const deadline = secondWinnerTime + (5 * 60 * 1000); 
        
        lastChanceEl?.classList.remove('hidden');
        
        if (!timerUiInterval) { 
            timerUiInterval = setInterval(() => {
                const left = deadline - Date.now();
                
                if (left <= 0) {
                     if(timerEl) timerEl.textContent = "00:00";
                     clearInterval(timerUiInterval);
                     timerUiInterval = null;
                     alert("Время истекло! Игра закончена.");
                } else {
                     const m = Math.floor(left / 60000); 
                     const s = Math.floor((left % 60000) / 1000);
                     if(timerEl) timerEl.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
                }
            }, 1000); 
        }
    } else {
        lastChanceEl?.classList.add('hidden');
        if(timerUiInterval) {
            clearInterval(timerUiInterval);
            timerUiInterval = null;
        }
    }
}


// ================= TENTS & MAP (CORE) =================

function startSnowPileSpawning() {
    if(snowSpawnInterval) clearInterval(snowSpawnInterval);
    
    const spawnPile = () => {
        if (dynamicSnowPiles.length < MAX_SNOW_PILES) {
            const newPile = {
                id: 'snow_' + Date.now() + Math.floor(Math.random() * 1000),
                type: 'snow_pile',
                x: 15 + Math.random() * 70, // Random X (15-85)
                y: 15 + Math.random() * 70, // Random Y (15-85)
                title: 'Сугроб',
                desc: 'Здесь может быть что-то ценное, если поторопиться...',
            };
            dynamicSnowPiles.push(newPile);
            renderMarkers(); 
        }
    };
    
    // Изначальный спавн
    for(let i = 0; i < Math.floor(Math.random() * MAX_SNOW_PILES) + 1; i++) {
        spawnPile();
    }

    // Интервал для респавна (раз в 30 секунд)
    snowSpawnInterval = setInterval(spawnPile, 30000); 
}

function initMapLogic() {
    if (map) map.remove();
    map = L.map('interactiveMap', { crs: L.CRS.Simple, minZoom: -2, maxZoom: 2, zoomControl: false, attributionControl: false });
    const bounds = [[0, 0], [1500, 2000]];
    L.imageOverlay('map.png', bounds).addTo(map);
    map.fitBounds(bounds);
    map.on('click', () => document.getElementById('interactionModal').classList.add('hidden'));

    renderMarkers();
    setInterval(() => {
        state.otherTeams.forEach(t => {
            t.x = Math.max(10, Math.min(90, t.x + (Math.random() - 0.5)));
            t.y = Math.max(10, Math.min(90, t.y + (Math.random() - 0.5)));
        });
        renderMarkers();
    }, 3000);
}

function renderMarkers() {
    if(!map) return;
    
    // 1. Статические точки (Tents, NPC) из БД
    staticMapPoints.forEach(item => updateMarker(item.id, item.type, item.x, item.y, item.title, item, item.icon));
    
    // 2. Динамические сугробы
    dynamicSnowPiles.forEach(item => updateMarker(item.id, 'snow_pile', item.x, item.y, item.title, item, '🧤'));
    
    // 3. Другие игроки и вы
    state.otherTeams.forEach(t => {
        const symbol = TEAMS_UI_CONFIG[t.id]?.symbol || '👥';
        updateMarker('team_'+t.id, 'team', t.x, t.y, `${t.name}`, { title: t.name, desc: `Игроков: ${t.playerCount}` }, symbol);
    });

    updateMarker('me', 'me', 50, 85, 'Я', {title:'Вы', desc:'Ваша позиция'});
}

function updateMarker(id, type, x, y, label, data, customSymbol) {
    const loc = [1500 - ((y / 100) * 1500), (x / 100) * 2000];
    let symbol = '📍';
    if(type === 'tent') symbol = '⛺';
    if(type === 'npc') symbol = '👤';
    if(type === 'snow_pile') symbol = '❄️';
    if(type === 'me') symbol = '🔴';
    if(customSymbol) symbol = customSymbol;

    const html = `<div class="marker ${type}"><div class="pin"><div>${symbol}</div></div><div class="label">${label}</div></div>`;
    const icon = L.divIcon({ className: 'custom-leaflet-icon', html: html, iconSize: [40, 60], iconAnchor: [20, 50] });

    // Очищаем старый маркер перед обновлением, если он уже не "сугроб", чтобы избежать утечек памяти
    if (mapMarkers[id] && type !== 'snow_pile') mapMarkers[id].setLatLng(loc);
    else if (mapMarkers[id]) mapMarkers[id].setLatLng(loc);
    else {
        const m = L.marker(loc, {icon: icon}).addTo(map);
        m.on('click', (e) => { L.DomEvent.stopPropagation(e); showPopup(data, type, id); map.flyTo(loc, map.getZoom()); });
        mapMarkers[id] = m;
    }
}

// ================= MODALS & ACTIONS (CORE) =================

function showPopup(item, type, id) {
    const modal = document.getElementById('interactionModal');
    const titleEl = document.getElementById('interactTitle');
    const descEl = document.getElementById('interactDesc');
    const btns = document.getElementById('interactButtons');
    const iconEl = document.getElementById('interactIcon'); // Получаем элемент иконки

    titleEl.textContent = item.title;
    descEl.innerHTML = item.desc || '';
    btns.innerHTML = '';
    iconEl.innerHTML = '⛺'; // Default icon

    if (type === 'tent') {
        iconEl.innerHTML = '⛺';
        if (['leader', 'Negotiator'].includes(state.me.role)) {
            btns.innerHTML = `
                <button class="propose-trade-btn" onclick="window.openTradeModal()">
                    💛 ПРЕДЛОЖИТЬ ОБМЕН
                </button>
            `;
            descEl.innerHTML += `<p style="margin-top:10px; font-size:0.9rem; color:var(--text-muted);">Приходите в эту палатку — когда другая команда придет сюда, обмен произойдет автоматически.</p>`;
        } else {
            descEl.innerHTML += `<br><br><span class="muted" style="color:#ff5555">Только Лидер или Переговорщик могут предлагать обмены.</span>`;
        }
    } else if (type === 'npc') {
        iconEl.innerHTML = item.icon || '👤'; // Используем иконку из БД
        // Для NPC только описание
    } else if (type === 'snow_pile') { // <--- ЛОГИКА ДЛЯ СУГРОБА
        if (state.me.role !== 'Scavenger') {
            iconEl.innerHTML = '❄️'; 
            descEl.innerHTML += `<br><br><span class="muted" style="color:#ff5555">Только Кладоискатель может рыться в снегу.</span>`;
        } else {
            iconEl.innerHTML = '🧤'; 
            descEl.innerHTML += `<p style="margin-top:10px; font-size:0.9rem; color:var(--text-muted);">Искать можно раз в 5 минут.</p>`;
            btns.innerHTML = `
                <button class="start-button" onclick="window.handleScavengeInteraction('${id}')">
                    НАЧАТЬ ПОИСК
                </button>
            `;
        }
    }
    
    modal.classList.remove('hidden');
}

window.enterTent = async (tentId) => {
    const descEl = document.getElementById('interactDesc');
    const btns = document.getElementById('interactButtons');

    descEl.innerHTML = `
        <div class="tent-waiting">
            <div class="loader-spinner"></div>
            <p style="font-size:1.1rem; margin-bottom:5px;">Ждем другую команду...</p>
            <p class="muted" style="font-size:0.8rem; line-height:1.4;">Когда вторая команда придет сюда и нажмет "Обмен", произойдет сделка.</p>
        </div>
    `;
    
    btns.innerHTML = `<button class="secondary" style="border:1px solid #555; color:#ccc;" onclick="window.leaveTent()">Отмена</button>`;
    
    const partner = await setTentStatus(tentId);
    
    if(partner) performExchange(partner);
};

window.leaveTent = async () => {
    document.getElementById('interactionModal').classList.add('hidden');
    await clearTentStatus(); 
};

function performExchange(partner) {
    const descEl = document.getElementById('interactDesc');
    const btns = document.getElementById('interactButtons');

    descEl.innerHTML = `
        <div style="text-align:center; padding:20px;">
            <div style="font-size:3rem;">✅</div>
            <h3 style="color:#00D68F; margin:10px 0;">УСПЕХ!</h3>
            <p>Обмен с командой:</p>
            <strong style="color:var(--accent-gold); font-size:1.2rem;">${partner.name}</strong>
        </div>
    `;
    btns.innerHTML = `<button class="start-button" onclick="window.leaveTent()">Готово</button>`;
    
    if(navigator.vibrate) navigator.vibrate([100, 50, 100]);
    setTimeout(() => clearTentStatus(), 3000); 
}

// --- Crafting ---
window.openCraftModal = () => {
    if(state.me.role !== 'Explorer') return alert("Только Исследователь!");
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
            const has = inv[ing.id] || 0;
            if(has < ing.count) can = false;
            return `<div class="ingredient-box ${has >= ing.count?'has-it':'missing'}"><span class="ing-icon">${state.globalItems[ing.id]?.emoji || '❓'}</span><span class="ing-count">${has}/${ing.count}</span></div>`;
        }).join('');

        cont.innerHTML += `
        <div class="craft-recipe">
            <div class="recipe-header"><strong>${r.name}</strong></div>
            <div class="recipe-row">
                <div class="ingredients-group">${ingHTML}</div>
                <div class="arrow-sign">➔</div>
                <div class="craft-result">${resItem?.emoji || '❓'}</div>
            </div>
            <button class="start-button" style="${can?'':'opacity:0.5'}" onclick="${can?`window.doCraft(${r.id})`:''}">СОЗДАТЬ</button>
        </div>`;
    });
}

window.doCraft = async (rid) => {
    const res = await craftItemLogic(rid);
    if(res.success) { alert(`Создано: ${res.itemName}`); renderCraftUI(); renderGameInterface(); }
    else alert(res.msg);
};

window.handleItemUse = async (id) => {
    const now = Date.now();
    if(now - state.lastGadgetUsage < GADGET_COOLDOWN_MS) return alert("Перезарядка...");
    
    if(id == 11) { 
        const targetId = prompt("ID цели (101-104):");
        if(targetId) {
            const res = await useGadgetLogic(id, targetId);
            if(res.success) alert("Успех!"); else alert(res.msg);
        }
    } else {
         alert("Гаджет не настроен для использования.");
    }
};

// --- НОВАЯ ФУНКЦИЯ: Обработка взаимодействия с сугробом ---
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

    // 1. Show loading state
    const originalDesc = descEl.innerHTML;
    const originalBtns = btns.innerHTML;
    descEl.innerHTML = `
        <div class="tent-waiting">
            <div class="loader-spinner"></div>
            <p style="font-size:1.1rem; margin-bottom:5px;">Идет поиск...</p>
            <p class="muted" style="font-size:0.8rem; line-height:1.4;">Это может занять некоторое время.</p>
        </div>
    `;
    btns.innerHTML = `<button class="secondary" disabled>ИДЕТ ПОИСК</button>`;
    
    // Временно отключаем кнопку на главном экране
    const btnScavenge = document.getElementById('btnScavenge');
    if(btnScavenge) btnScavenge.disabled = true;

    // Имитация времени поиска
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 2. Perform scavenge logic and set cooldown
    const result = await scavengeItemLogic();
    
    // В любом случае (даже если ошибка/ничего не найдено) устанавливаем кулдаун
    lastScavengeTime = now;
    localStorage.setItem('lastScavengeTime', now);

    // 3. Update UI based on result
    if (result.success) {
        
        // Remove snow pile from local state и удаляем маркер
        dynamicSnowPiles = dynamicSnowPiles.filter(p => p.id !== snowPileId);
        
        // Удаляем маркер из Leaflet
        if (mapMarkers[snowPileId]) {
            mapMarkers[snowPileId].remove();
            delete mapMarkers[snowPileId];
        }

        // Обновление модального окна для показа результата
        descEl.innerHTML = `
            <div style="text-align:center; padding:20px;">
                <div style="font-size:3rem;">${result.itemId ? '✅' : '🧊'}</div>
                <h3 style="color:var(--accent-gold); margin:10px 0;">РЕЗУЛЬТАТ ПОИСКА</h3>
                <p>${result.message.replace(/\*\*/g, '<strong>')}</p>
            </div>
        `;
        btns.innerHTML = `<button class="start-button" onclick="document.getElementById('interactionModal').classList.add('hidden');">Готово</button>`;
        
        // Refresh inventory/UI
        await refreshTeamData(); 
        renderGameInterface();
    } else {
        // Восстановление UI в случае ошибки
        alert("Ошибка поиска: " + result.message);
        descEl.innerHTML = originalDesc;
        btns.innerHTML = originalBtns;
    }
    
    if(btnScavenge) btnScavenge.disabled = false;
}


// ================= ОБМЕН ЧЕРЕЗ МОДАЛЬНОЕ ОКНО =================

window.openTradeModal = () => {
  if (!['leader', 'Negotiator'].includes(state.me.role)) {
    alert('Только Лидер или Переговорщик могут предлагать обмен.');
    return;
  }

  const modal = document.getElementById('tradeModal');
  modal.classList.remove('hidden');

  // Команды
  const teamSelect = document.getElementById('tradeTargetTeam');
  teamSelect.innerHTML = '<option value="">Выберите команду</option>';
  state.otherTeams.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.name_by_leader || t.name} ${TEAMS_UI_CONFIG[t.id]?.symbol || ''}`;
    teamSelect.appendChild(opt);
  });

  // Предметы
  const inv = state.currentTeam.inventory || {};
  const offerSel = document.getElementById('tradeOfferSelect');
  const reqSel = document.getElementById('tradeRequestSelect');
  offerSel.innerHTML = '<option value="">Что отдать?</option>';
  reqSel.innerHTML = '<option value="">Что получить?</option>';

  // Отдаем — только то, что есть
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

  // Просим — все предметы из базы
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
    alert('✅ Предложение отправлено!');
    document.getElementById('tradeModal').classList.add('hidden');
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

        return `
          <div class="incoming-trade-card">
            <p><strong>${t.from_team_name}</strong> предлагает:</p>
            <p>📤 ${offer?.emoji || '📦'} ${offer?.name || '???'}</p>
            <p>в обмен на:</p>
            <p style="color:${canFulfill ? 'var(--accent-green)' : 'var(--accent-red)'}">
              📥 ${req?.emoji || '🎁'} ${req?.name || '???'} ${!canFulfill ? ' (у вас нет)' : ''}
            </p>
            <div style="display:flex; gap:10px; margin-top:12px;">
              <button class="start-button" ${!canFulfill ? 'disabled' : ''} onclick="window.acceptTrade(${t.id})">Принять</button>
              <button class="secondary" onclick="window.rejectTrade(${t.id})">Отклонить</button>
            </div>
          </div>
        `;
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

window.closeTradeModal = () => document.getElementById('tradeModal').classList.add('hidden');
window.closeIncomingTrades = () => document.getElementById('incomingTradesModal').classList.add('hidden');

// ================= FREEZE & EFFECTS =================

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

// Start Game
initGame().catch(console.error);