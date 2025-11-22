// game.js — Полная игровая логика + Крафт
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ===== CONFIG =====
const SUPABASE_URL = 'https://akvvvudcnjnevkzxnfoi.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrdnZ2dWRjbmpuZXZrenhuZm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1NDMyNDQsImV4cCI6MjA3OTExOTI0NH0.pOA1Ebemf3IYY4ckaDQ31uDr8jMBljAzcnai_MWr2pY'; 

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== ДАННЫЕ (Необходимы для отрисовки) =====
const TEAMS_STATIC_DATA = [
    { id: 101, defaultName: 'Снежинки', color: '#8be9fd', symbol: '❄️' },
    { id: 102, defaultName: 'Елочные Шары', color: '#ff5555', symbol: '🔴' },
    { id: 103, defaultName: 'Гирлянды', color: '#f1fa8c', symbol: '💡' },
    { id: 104, defaultName: 'Деды Морозы', color: '#bd93f9', symbol: '🎅' },
];
const ROLES_DATA = { Explorer: 'Исследователь', Guardian: 'Хранитель', Saboteur: 'Диверсант', Negotiator: 'Переговорщик', leader: 'Лидер' };

// ===== КОНФИГУРАЦИЯ КРАФТА =====
// ВАЖНО: Замените ID ниже на реальные ID из вашей таблицы 'items' в Supabase!
const CRAFT_RECIPES = [
    {
        id: 1, // ID рецепта (уникальный)
        name: "Ледяная Бомба",
        resultId: 11, // ID предмета, который получится (например, Заморозка)
        description: "Замораживает врагов на 5 минут",
        ingredients: [
            { id: 1, count: 3 }, // Нужно 3 предмета с ID 1 (Снежок?)
            { id: 2, count: 1 }  // Нужно 1 предмет с ID 2 (Вода?)
        ]
    },
    {
        id: 2,
        name: "Огненная Руна",
        resultId: 12, // ID предмета (Разморозка/Щит)
        description: "Снимает лед и защищает",
        ingredients: [
            { id: 3, count: 2 }, // Нужно 2 предмета с ID 3 (Уголь?)
            { id: 4, count: 1 }  // Нужно 1 предмет с ID 4 (Спички?)
        ]
    },
    {
        id: 3,
        name: "Легендарный Подарок",
        resultId: 99, // Какой-то редкий предмет для победы
        description: "Дает много очков",
        ingredients: [
            { id: 5, count: 1 }, 
            { id: 6, count: 1 }, 
            { id: 7, count: 1 }  
        ]
    }
];

// Глобальные переменные
let me = null; 
let currentTeam = null; 
let GLOBAL_ITEMS = {}; 

// Переменные финала
let hasShownVictory = false; 
let hasShownGameOver = false; 
let deadlineTimestamp = null; // Время окончания игры
let timerUiInterval = null;   // Интервал обновления цифр

// ===== INIT =====
async function initGame() {
    const storedName = localStorage.getItem('playerName');
    if (!storedName) return window.location.href = 'index.html'; 

    // 1. Загрузка справочников
    const { data: items } = await supabase.from('items').select('*');
    if (items) items.forEach(i => GLOBAL_ITEMS[i.id] = i);

    // 2. Загрузка игрока
    const { data: player } = await supabase.from('players').select('*').ilike('name', storedName).single();
    if (!player) {
        localStorage.removeItem('playerName');
        return window.location.href = 'index.html';
    }
    me = player;

    // 3. Настройка интерфейса
    document.getElementById('myNameHeader').textContent = me.name;
    document.getElementById('myPlayerRole').textContent = ROLES_DATA[me.role] || me.role;
    document.getElementById('btnLogout').addEventListener('click', () => { 
        localStorage.removeItem('playerName'); 
        window.location.href='index.html'; 
    });

    const tradeBtn = document.getElementById('btnShowTrades');
    if (me.role === 'leader') tradeBtn.classList.remove('hidden');

    initMapLogic();
    await refreshTeamData();
    setupSubscriptions();
    checkGlobalGameState(); // Проверяем, не идет ли уже финал
    createSnowEffect();
}

function initMapLogic() {
    const mapBlock = document.querySelector('.map-placeholder');
    if(mapBlock) {
        mapBlock.innerHTML = `<img src="https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=800&q=80" style="width:100%; height:100%; object-fit:cover; border-radius:12px; opacity:0.8; cursor:pointer;" alt="Карта">`;
        mapBlock.onclick = () => alert('🗺️ Карта местности:\nСледуйте за подсказками в миссиях!');
    }
}

// ===== SUBSCRIPTIONS (REALTIME) =====
function setupSubscriptions() {
    // Следим за своей командой
    supabase.channel('my_team')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `id=eq.${me.team_id}`}, payload => { 
            currentTeam = {...currentTeam, ...payload.new}; 
            renderGameInterface(); 
            // Если открыто окно крафта, обновляем его тоже (чтобы видеть расход ресурсов)
            if (!document.getElementById('craftModal').classList.contains('hidden')) {
                renderCraftRecipes();
            }
            checkGlobalGameState();
            checkFreezeState(); // Проверка заморозки при обновлении
        })
        .subscribe();

    // Следим за составом
    supabase.channel('team_members')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `team_id=eq.${me.team_id}`}, () => refreshTeamData())
        .subscribe();

    // Уведомления о трейдах (только Лидер)
    if (me.role === 'leader') {
        supabase.channel('incoming_trades')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades', filter: `to_team_id=eq.${me.team_id}`}, () => {
                const btn = document.getElementById('btnShowTrades'); 
                btn.textContent = "Обмен 🤝 (!)"; 
                btn.classList.add('pulse-gold');
            })
            .subscribe();
    }
    
    // Глобальный мониторинг (для старта таймера)
    supabase.channel('global_state')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
            checkGlobalGameState();
        })
        .subscribe();

    // Кик игрока
    supabase.channel('my_player_kick')
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'players', filter: `id=eq.${me.id}` }, () => {
            alert('🚫 Вы были исключены из команды.');
            localStorage.removeItem('playerName');
            window.location.href = 'index.html';
        })
        .subscribe();
}

// ===== FINAL LOGIC (ТАЙМЕР И ПОБЕДА) =====
async function checkGlobalGameState() {
    const { data: teams } = await supabase.from('teams').select('*').order('updated_at', { ascending: true });
    if (!teams) return;

    const winners = teams.filter(t => t.tasks && t.tasks.length > 0 && t.tasks.every(task => task.completed));
    const amIWinner = winners.some(w => w.id === me.team_id);

    if (amIWinner && !hasShownVictory) {
        showVictoryModal();
        return;
    }

    if (!amIWinner && !hasShownGameOver) {
        if (winners.length >= 2) {
            const secondWinnerTime = new Date(winners[1].updated_at).getTime();
            const DEADLINE_MS = 5 * 60 * 1000; // 5 минут
            deadlineTimestamp = secondWinnerTime + DEADLINE_MS;
            
            document.getElementById('lastChanceTimer').classList.remove('hidden');
            
            if (!timerUiInterval) {
                timerUiInterval = setInterval(updateTimerUI, 1000);
                updateTimerUI(); 
            }
        } else {
            document.getElementById('lastChanceTimer').classList.add('hidden');
        }
    }
}

function updateTimerUI() {
    if (!deadlineTimestamp) return;
    const now = Date.now();
    const diff = deadlineTimestamp - now;

    if (diff <= 0) {
        clearInterval(timerUiInterval);
        document.getElementById('timerCountdown').textContent = "00:00";
        showGameOverModal();
    } else {
        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        document.getElementById('timerCountdown').textContent = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }
}

function showVictoryModal() {
    const modal = document.getElementById('endGameModal');
    modal.classList.remove('hidden');
    document.getElementById('endTitle').textContent = "ВЫ ПОБЕДИЛИ! 🏆";
    document.getElementById('endMessage').innerHTML = "Поздравляем! Вы заняли призовое место.<br>Бегите на финальную локацию.";
    document.querySelector('.modal-content').className = "modal-content pulse-gold";
    document.getElementById('winnersListBlock').classList.add('hidden');
    document.getElementById('lastChanceTimer').classList.add('hidden');
    document.getElementById('btnCloseModal').classList.remove('hidden');
    if (timerUiInterval) clearInterval(timerUiInterval);
    hasShownVictory = true;
}

function showGameOverModal() {
    if (hasShownGameOver) return;
    const modal = document.getElementById('endGameModal');
    modal.classList.remove('hidden');
    document.getElementById('endTitle').textContent = "☠️ ВРЕМЯ ВЫШЛО";
    document.getElementById('endTitle').style.color = "var(--accent-red)";
    document.getElementById('endMessage').innerHTML = "К сожалению, вы не успели войти в число победителей.";
    document.querySelector('.modal-content').className = "modal-content pulse-red";
    document.getElementById('btnCloseModal').classList.add('hidden');
    hasShownGameOver = true;
}

// ===== RENDER =====
async function refreshTeamData() {
    const { data: team, error } = await supabase.from('teams').select('*').eq('id', me.team_id).single();
    if (error || !team) return;
    currentTeam = team; 
    renderGameInterface();
}

function renderGameInterface() {
    if(!currentTeam) return;
    const staticInfo = TEAMS_STATIC_DATA.find(t => t.id === currentTeam.id);
    const name = currentTeam.name_by_leader || currentTeam.name;
    
    document.getElementById('myTeamName').innerHTML = `${name} ${staticInfo.symbol}`;
    if(currentTeam.selfie_url) document.getElementById('myTeamAvatar').style.backgroundImage = `url('${currentTeam.selfie_url}')`;

    // Инвентарь
    const list = document.getElementById('inventoryList'); list.innerHTML = '';
    const inv = currentTeam.inventory || {};
    let hasItems = false;
    Object.keys(inv).forEach(id => {
        if(inv[id] > 0) {
            hasItems = true;
            const item = GLOBAL_ITEMS[id] || {name:'???', emoji:'📦', type:'item'};
            let style = item.type === 'story' ? 'border-left: 3px solid var(--accent-gold)' : '';
            
            // Кнопка Использовать (Гаджеты)
            let actionBtn = '';
            if (item.type === 'gadget' && me.role === 'leader') {
                const btnColor = item.id == 11 ? '#8be9fd' : '#ff5555'; 
                actionBtn = `<button class="btn-use" style="background:${btnColor}" onclick="handleItemUse(${id})">USE</button>`;
            }

            list.innerHTML += `
            <li style="${style}">
                <div style="display:flex;align-items:center;gap:10px; flex-grow: 1;">
                    <span style="font-size:1.5rem">${item.emoji}</span> 
                    <div style="display:flex; flex-direction:column; line-height:1.2;">
                        <span style="font-weight:bold; font-size:0.9rem;">${item.name}</span>
                        <span class="muted" style="font-size:0.7rem">${item.description || ''}</span>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap: 10px;">
                    ${actionBtn}
                    <span class="inv-count">x${inv[id]}</span>
                </div>
            </li>`;
        }
    });
    if(!hasItems) list.innerHTML = '<li class="muted" style="justify-content:center">Пусто...</li>';

    // Задачи
    const tbody = document.getElementById('tasksTableBody');
    const progressEl = document.getElementById('taskProgress');
    tbody.innerHTML = '';
    const tasks = currentTeam.tasks || [];
    let completedCount = 0;

    if (tasks.length === 0) { tbody.innerHTML = '<tr><td colspan="3" class="muted" style="text-align:center; padding:20px;">Нет активных задач</td></tr>'; return; }

    tasks.forEach(task => {
        if(task.completed) completedCount++;
        const tr = document.createElement('tr'); 
        tr.className = `task-row ${task.completed ? 'completed' : ''}`;
        
        let canCheck = (me.role === 'leader');
        
        if(task.type === 'requirement' && !task.completed) {
            const hasItem = (inv[task.required_item_id] || 0) > 0;
            if(hasItem) tr.classList.add('ready'); else { tr.classList.add('locked'); canCheck = false; }
        }

        const isChecked = task.completed ? 'checked disabled' : '';
        const isDisabled = !canCheck ? 'disabled' : '';
        const checkbox = `<input type="checkbox" class="task-check-input" ${isChecked} ${isDisabled} onclick="toggleTask(${task.id}, this)">`;
        const reward = task.type === 'reward' && task.reward_item_id ? (GLOBAL_ITEMS[task.reward_item_id]?.emoji || '🎁') : '';

        tr.innerHTML = `<td style="text-align:center">${checkbox}</td><td>${task.text}</td><td style="text-align:center;font-size:1.2rem">${reward}</td>`;
        tbody.appendChild(tr);
    });
    progressEl.textContent = Math.round((completedCount/tasks.length)*100) + '%';

    renderMembers();
    checkFreezeState(); 
}

// ===== ACTIONS =====
window.toggleTask = async (taskId, checkboxEl) => {
    if(hasShownGameOver) { alert('Игра окончена!'); checkboxEl.checked = false; return; }
    if(me.role !== 'leader') { checkboxEl.checked = !checkboxEl.checked; alert('Только Лидер сдает задачи!'); return; }

    const task = currentTeam.tasks.find(t => t.id === taskId);
    const inv = { ...currentTeam.inventory };
    const isChecked = checkboxEl.checked;

    if(task.type === 'requirement' && isChecked) {
        if((inv[task.required_item_id] || 0) < 1) { alert('Нет предмета!'); checkboxEl.checked = false; return; }
        inv[task.required_item_id]--;
    }
    if(task.type === 'reward' && isChecked) {
        const rId = task.reward_item_id; inv[rId] = (inv[rId] || 0) + 1;
        alert(`Получено: ${GLOBAL_ITEMS[rId]?.name}!`);
    }

    const newTasks = currentTeam.tasks.map(t => t.id === taskId ? {...t, completed: isChecked} : t);
    
    currentTeam.tasks = newTasks; 
    currentTeam.inventory = inv;
    renderGameInterface(); 

    const { error } = await supabase.from('teams').update({ tasks: newTasks, inventory: inv }).eq('id', me.team_id);
    if(error) alert('Ошибка сохранения!');
};

// === ФУНКЦИИ УПРАВЛЕНИЯ КОМАНДОЙ ===
async function renderMembers() {
    const list = document.getElementById('currentTeamMembersList');
    const { data: members } = await supabase.from('players').select('*').eq('team_id', me.team_id);
    
    list.innerHTML = ''; 
    document.getElementById('myTeamMembersCount').textContent = members ? members.length : 0;
    
    if (!members) return;

    members.forEach(m => {
        const isMe = m.id === me.id;
        const kickBtn = (me.role === 'leader' && !isMe) 
            ? `<button class="icon-btn" style="color:var(--accent-red); margin-left:auto;" onclick="kickPlayer('${m.id}', this)">✖</button>` 
            : '';
            
        list.innerHTML += `
        <li style="display:flex; align-items:center; justify-content:space-between; width:100%;">
            <span>${m.name} ${m.role==='leader'?'👑':''}</span> 
            ${kickBtn}
        </li>`;
    });
}

window.kickPlayer = async (id, btnElement) => {
    if (!id || id === 'undefined') return alert("Ошибка ID");
    if(!confirm('Исключить этого игрока?')) return;
    
    if (btnElement) {
        const li = btnElement.closest('li');
        if (li) li.style.opacity = '0.3';
    }

    const { error } = await supabase.from('players').delete().eq('id', id);
    
    if (error) {
        alert(`Ошибка: ${error.message}`);
        if (btnElement) btnElement.closest('li').style.opacity = '1'; 
        refreshTeamData();
    } else {
        refreshTeamData(); 
    }
};

// ===== TRADE & GUIDE =====
window.openItemsGuide = () => {
    document.getElementById('itemsGuideModal').classList.remove('hidden');
    const container = document.querySelector('#itemsGuideModal .tasks-container .tasks-table tbody');
    let html = '';
    const sortedItems = Object.values(GLOBAL_ITEMS).sort((a,b) => a.id - b.id);
    sortedItems.forEach(i => {
        html += `
        <tr class="guide-item-row">
            <td class="guide-icon">${i.emoji}</td>
            <td class="guide-info">
                <h4>${i.name}</h4>
                <p>${i.description || ''}</p>
            </td>
        </tr>`;
    });
    container.innerHTML = html;
};
window.closeItemsGuide = () => document.getElementById('itemsGuideModal').classList.add('hidden');

// --- Trade Logic ---
window.openIncomingTrades = async () => {
    if(me.role !== 'leader') return;
    document.getElementById('incomingTradesModal').classList.remove('hidden');
    const btn = document.getElementById('btnShowTrades'); 
    btn.textContent = "Обмен 🤝"; 
    btn.classList.remove('pulse-gold');

    const list = document.getElementById('incomingTradesList');
    list.innerHTML = `<button class="btn-create-big" onclick="openCreateTrade()"><span>+</span> СОЗДАТЬ</button><div id="tLoader" class="muted" style="text-align:center">Загрузка...</div>`;
    
    const { data: trades } = await supabase.from('trades').select('*, teams!from_team_id(name, name_by_leader)').eq('to_team_id', me.team_id).eq('status', 'pending');
    document.getElementById('tLoader')?.remove();

    if(!trades?.length) list.innerHTML += '<div class="muted" style="text-align:center;margin-top:20px">Нет входящих предложений</div>';
    
    trades.forEach(tr => {
        const off = GLOBAL_ITEMS[tr.offer_item_id];
        const req = GLOBAL_ITEMS[tr.request_item_id];
        list.innerHTML += `
        <div class="trade-card">
            <div style="color:var(--accent-gold);margin-bottom:5px;">От: ${tr.teams.name_by_leader||tr.teams.name}</div>
            <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:5px;align-items:center;background:rgba(0,0,0,0.3);padding:10px;border-radius:10px;">
                <div style="text-align:center"><div style="font-size:1.5rem">${off?.emoji}</div><span style="color:#6eff9f;font-size:0.7rem">ДАЮТ</span></div>
                <div style="opacity:0.5">➔</div>
                <div style="text-align:center"><div style="font-size:1.5rem">${req?.emoji}</div><span style="color:#ff5555;font-size:0.7rem">ПРОСЯТ</span></div>
            </div>
            <div class="trade-actions">
                <button class="secondary" onclick="rejectTrade(${tr.id})">ОТКАЗ</button>
                <button class="start-button" style="margin:0;font-size:0.9rem" onclick="acceptTrade(${tr.id})">ПРИНЯТЬ</button>
            </div>
        </div>`;
    });
};
window.closeIncomingTrades = () => document.getElementById('incomingTradesModal').classList.add('hidden');

window.openCreateTrade = async () => {
    document.getElementById('incomingTradesModal').classList.add('hidden');
    document.getElementById('tradeModal').classList.remove('hidden');
    
    const tSelect = document.getElementById('tradeTargetTeam'); tSelect.innerHTML = '<option>Загрузка...</option>';
    const oSelect = document.getElementById('tradeOfferSelect'); oSelect.innerHTML = '';
    const rSelect = document.getElementById('tradeRequestSelect'); rSelect.innerHTML = '';

    const { data: teams } = await supabase.from('teams').select('id,name,name_by_leader').neq('id', me.team_id);
    tSelect.innerHTML = ''; teams.forEach(t => tSelect.innerHTML += `<option value="${t.id}">${t.name_by_leader||t.name}</option>`);

    let has=false; Object.keys(currentTeam.inventory||{}).forEach(id => {
        if(currentTeam.inventory[id]>0) { has=true; oSelect.innerHTML += `<option value="${id}">${GLOBAL_ITEMS[id]?.emoji} ${GLOBAL_ITEMS[id]?.name}</option>`; }
    });
    if(!has) oSelect.innerHTML = '<option disabled>Рюкзак пуст</option>';

    Object.values(GLOBAL_ITEMS).forEach(i => rSelect.innerHTML += `<option value="${i.id}">${i.emoji} ${i.name}</option>`);
};
window.closeTradeModal = () => document.getElementById('tradeModal').classList.add('hidden');

window.sendTradeRequest = async () => {
    const to = document.getElementById('tradeTargetTeam').value;
    const off = document.getElementById('tradeOfferSelect').value;
    const req = document.getElementById('tradeRequestSelect').value;
    if(!off || !req) return alert('Выберите предметы');
    
    await supabase.from('trades').insert({from_team_id:me.team_id, to_team_id:to, offer_item_id:off, request_item_id:req});
    alert('Отправлено!'); closeTradeModal();
};

window.acceptTrade = async (id) => {
    const { error } = await supabase.rpc('accept_trade', { trade_id_input: id });
    if(error) alert("Ошибка! Возможно предмета уже нет или сделка отменена."); else { alert('Успешно!'); openIncomingTrades(); }
};
window.rejectTrade = async (id) => { await supabase.from('trades').update({status:'rejected'}).eq('id',id); openIncomingTrades(); };

function createSnowEffect() {
    const cvs = document.getElementById('snowCanvas'); if(!cvs) return;
    const ctx = cvs.getContext('2d');
    let W = window.innerWidth, H = window.innerHeight;
    const resize = () => { W=window.innerWidth; H=window.innerHeight; cvs.width=W; cvs.height=H; };
    window.addEventListener('resize', resize); resize();
    const f=Array.from({length:40},()=>({x:Math.random()*W,y:Math.random()*H,s:Math.random()+1}));
    setInterval(()=>{
        ctx.clearRect(0,0,W,H); ctx.fillStyle="rgba(255,255,255,0.7)"; ctx.beginPath();
        f.forEach(p=>{ctx.moveTo(p.x,p.y);ctx.arc(p.x,p.y,p.s,0,Math.PI*2);p.y+=p.s/2;if(p.y>H)p.y=-5;});ctx.fill();
    },40);
}

// ===== ЛОГИКА ГАДЖЕТОВ (VFX EDITION + VALIDATION) =====
let wasFrozen = false; 

function checkFreezeState() {
    if (!currentTeam) return;
    
    const iceOverlay = document.getElementById('iceOverlay');
    const fireOverlay = document.getElementById('fireOverlay');
    const body = document.body;
    
    const isFrozen = currentTeam.frozen_until && new Date(currentTeam.frozen_until) > new Date();

    // НАС ТОЛЬКО ЧТО ЗАМОРОЗИЛИ
    if (isFrozen && !wasFrozen) {
        body.classList.add('frozen-mode');
        iceOverlay.classList.remove('hidden');
        iceOverlay.classList.add('smash');
        body.classList.add('body-shake');
        
        setTimeout(() => {
            iceOverlay.classList.remove('smash');
            body.classList.remove('body-shake');
        }, 500);
        
        wasFrozen = true;
    }

    // МЫ ЗАМОРОЖЕНЫ
    if (isFrozen) {
        if (!body.classList.contains('frozen-mode')) {
             body.classList.add('frozen-mode');
             iceOverlay.classList.remove('hidden');
             wasFrozen = true;
        }

        const left = new Date(currentTeam.frozen_until) - new Date();
        const secs = Math.ceil(left / 1000);
        document.getElementById('myTeamName').innerHTML = `<span style="color:var(--accent-ice); text-shadow: 0 0 15px var(--accent-ice);">❄️ ${secs}с</span>`;
        
        setTimeout(checkFreezeState, 1000);
    } 
    // РАЗМОРОЗКА
    else {
        if (wasFrozen) {
            fireOverlay.classList.remove('hidden');
            fireOverlay.classList.add('boom');
            
            body.classList.remove('frozen-mode');
            iceOverlay.classList.add('hidden');
            
            const staticInfo = TEAMS_STATIC_DATA.find(t => t.id === currentTeam.id);
            const baseName = currentTeam.name_by_leader || currentTeam.name;
            document.getElementById('myTeamName').innerHTML = `${baseName} ${staticInfo.symbol}`;
            
            setTimeout(() => {
                fireOverlay.classList.remove('boom');
                fireOverlay.classList.add('hidden');
            }, 1200);
            
            wasFrozen = false;
        }
        
        if (body.classList.contains('frozen-mode')) {
            body.classList.remove('frozen-mode');
            iceOverlay.classList.add('hidden');
            const staticInfo = TEAMS_STATIC_DATA.find(t => t.id === currentTeam.id);
            document.getElementById('myTeamName').innerHTML = `${currentTeam.name_by_leader||currentTeam.name} ${staticInfo.symbol}`;
        }
    }
}

window.handleItemUse = async (itemId) => {
    if (itemId == 11) {
        openTargetModal(itemId);
    } 
    else if (itemId == 12) {
        if (!currentTeam.frozen_until || new Date(currentTeam.frozen_until) < new Date()) {
            if(!confirm('Вы сейчас НЕ заморожены. Все равно использовать руну? (Она сгорит)')) return;
        }
        await executeGadget(itemId, null); 
    }
};

async function openTargetModal(itemId) {
    document.getElementById('targetModal').classList.remove('hidden');
    const select = document.getElementById('targetSelect');
    select.innerHTML = '<option>Поиск команд...</option>';
    
    const { data: teams } = await supabase.from('teams').select('id, name, name_by_leader')
        .neq('id', me.team_id); 
        
    select.innerHTML = '';
    teams.forEach(t => {
        select.innerHTML += `<option value="${t.id}">${t.name_by_leader || t.name}</option>`;
    });
    
    document.getElementById('btnConfirmFreeze').onclick = () => {
        executeGadget(itemId, select.value);
        closeTargetModal();
    };
}
window.closeTargetModal = () => document.getElementById('targetModal').classList.add('hidden');

async function executeGadget(itemId, targetId) {
    const cleanItemId = parseInt(itemId);
    const cleanMyId = parseInt(me.team_id);
    let cleanTargetId = targetId ? parseInt(targetId) : cleanMyId;

    if (isNaN(cleanItemId) || isNaN(cleanMyId) || isNaN(cleanTargetId)) {
        alert("Ошибка: Некорректные данные (ID). Обновите страницу.");
        return;
    }
    
    if (cleanItemId === 11 && (!cleanTargetId || cleanTargetId === cleanMyId)) {
        alert("⚠️ Выберите команду из списка!");
        return;
    }
    
    const { data, error } = await supabase.rpc('use_gadget', {
        attacker_team_id: cleanMyId,
        target_team_id: cleanTargetId,
        item_id: cleanItemId
    });

    if (error) {
        console.error('Supabase Error:', error);
        alert('Ошибка: ' + error.message);
    } else {
        if (data.success) {
            const { data: updated } = await supabase.from('teams').select('*').eq('id', me.team_id).single();
            currentTeam = updated;
            checkFreezeState(); 
            renderGameInterface();
        } else {
            alert('Не сработало: ' + data.message);
        }
    }
}

// ===== ЛОГИКА КРАФТА (WORKBENCH) =====

window.openCraftModal = () => {
    document.getElementById('craftModal').classList.remove('hidden');
    renderCraftRecipes();
};

window.renderCraftRecipes = () => {
    const container = document.getElementById('craftRecipesList');
    container.innerHTML = '';

    if (!currentTeam || !currentTeam.inventory) {
        container.innerHTML = '<div class="muted">Ошибка данных инвентаря</div>';
        return;
    }

    CRAFT_RECIPES.forEach(recipe => {
        const resultItem = GLOBAL_ITEMS[recipe.resultId];
        if (!resultItem) return; // Если предмет не найден в базе, пропускаем

        // 1. Проверяем ингредиенты
        let canCraft = true;
        let ingredientsHtml = '';

        recipe.ingredients.forEach((ing, index) => {
            const itemData = GLOBAL_ITEMS[ing.id] || { name: '???', emoji: '❓' };
            const playerHas = currentTeam.inventory[ing.id] || 0;
            const isEnough = playerHas >= ing.count;

            if (!isEnough) canCraft = false;

            if (index > 0) ingredientsHtml += `<div class="plus-sign">+</div>`;

            ingredientsHtml += `
                <div class="ingredient ${isEnough ? 'has-it' : 'missing'}">
                    <div style="font-size:1.5rem">${itemData.emoji}</div>
                    <div>${playerHas}/${ing.count}</div>
                </div>
            `;
        });

        // 2. Рисуем карточку рецепта
        const rarityClass = resultItem.rarity ? `rarity-${resultItem.rarity}` : '';

        container.innerHTML += `
            <div class="craft-recipe ${rarityClass}">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <strong style="color:var(--accent-gold)">${recipe.name}</strong>
                    <span class="muted" style="font-size:0.8rem">${recipe.description}</span>
                </div>

                <div class="recipe-row">
                    ${ingredientsHtml}
                    <div class="arrow-sign">➔</div>
                    <div class="craft-result">
                        <div style="font-size:1.8rem">${resultItem.emoji}</div>
                    </div>
                </div>

                <button class="start-button" 
                        style="margin-top:10px; padding:10px; font-size:0.9rem; ${canCraft ? '' : 'opacity:0.5; cursor:not-allowed; background:#333;'}"
                        onclick="${canCraft ? `craftItem(${recipe.id})` : ''}">
                    ${canCraft ? 'СОЗДАТЬ ⚒️' : 'НЕДОСТАТОЧНО РЕСУРСОВ'}
                </button>
            </div>
        `;
    });
}

window.craftItem = async (recipeId) => {
    if (me.role !== 'leader' && me.role !== 'Guardian') { 
        alert("⚒️ Только Лидер или Хранитель могут использовать верстак!");
        return;
    }

    const recipe = CRAFT_RECIPES.find(r => r.id === recipeId);
    if (!recipe) return;

    const newInventory = { ...currentTeam.inventory };

    // Проверка ресурсов
    for (let ing of recipe.ingredients) {
        if ((newInventory[ing.id] || 0) < ing.count) {
            alert("Ошибка: Кто-то уже потратил ресурсы!");
            renderCraftRecipes(); 
            return;
        }
    }

    // Списание ресурсов
    recipe.ingredients.forEach(ing => {
        newInventory[ing.id] -= ing.count;
        if (newInventory[ing.id] < 0) newInventory[ing.id] = 0; 
    });

    // Выдача результата
    newInventory[recipe.resultId] = (newInventory[recipe.resultId] || 0) + 1;

    // Оптимистичное обновление
    currentTeam.inventory = newInventory;
    renderGameInterface();
    renderCraftRecipes(); 
    
    if (navigator.vibrate) navigator.vibrate(50);

    // Сохранение в базу
    const { error } = await supabase
        .from('teams')
        .update({ inventory: newInventory })
        .eq('id', me.team_id);

    if (error) {
        console.error("Craft error", error);
        alert("Ошибка соединения с хранилищем!");
        refreshTeamData(); // Откат при ошибке
    } else {
        const resultItem = GLOBAL_ITEMS[recipe.resultId];
        alert(`УСПЕХ! Создан предмет: ${resultItem.name}`);
    }
};

// Запуск игры
initGame();