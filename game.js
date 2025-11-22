// game.js — FINAL LOGIC: Roles, Cooldowns, Cocoa Cure
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ===== CONFIG =====
const SUPABASE_URL = 'https://akvvvudcnjnevkzxnfoi.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrdnZ2dWRjbmpuZXZrenhuZm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1NDMyNDQsImV4cCI6MjA3OTExOTI0NH0.pOA1Ebemf3IYY4ckaDQ31uDr8jMBljAzcnai_MWr2pY'; 

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== CONSTANTS =====
const GADGET_COOLDOWN_MS = 2 * 60 * 1000; // 2 минуты кулдаун

const TEAMS_STATIC_DATA = [
    { id: 101, defaultName: 'Снежинки', color: '#8be9fd', symbol: '❄️' },
    { id: 102, defaultName: 'Елочные Шары', color: '#ff5555', symbol: '🔴' },
    { id: 103, defaultName: 'Гирлянды', color: '#f1fa8c', symbol: '💡' },
    { id: 104, defaultName: 'Деды Морозы', color: '#bd93f9', symbol: '🎅' },
];

// Перевод ролей
const ROLES_DATA = { 
    Explorer: 'Исследователь', 
    Guardian: 'Хранитель', 
    Saboteur: 'Диверсант', 
    Negotiator: 'Переговорщик', 
    leader: 'Лидер' 
};

// ===== РЕЦЕПТЫ =====
const CRAFT_RECIPES = [
    // ID 11: Лед (Атака)
    { id: 1, name: "Ледяная Бомба", resultId: 11, description: "Замораживает врагов", ingredients: [{ id: 1, count: 3 }, { id: 2, count: 1 }] },
    
    // ID 12: Какао (Лечение + Грязь)
    { id: 2, name: "Какао-Бомба", resultId: 12, description: "Снимает лед и пачкает", ingredients: [{ id: 3, count: 2 }, { id: 4, count: 1 }] },
    
    // ID 13: Огненная руна (Резерв или Защита)
    { id: 3, name: "Огненная Руна", resultId: 13, description: "Магическая защита", ingredients: [{ id: 5, count: 1 }, { id: 2, count: 1 }] }
];

// Глобальные переменные
let me = null; 
let currentTeam = null; 
let GLOBAL_ITEMS = {}; 
let lastGadgetUsageTime = 0; // Для локального кулдауна

// Финал
let hasShownVictory = false; 
let hasShownGameOver = false; 
let deadlineTimestamp = null;
let timerUiInterval = null;

// ===== INIT =====
async function initGame() {
    const storedName = localStorage.getItem('playerName');
    if (!storedName) return window.location.href = 'index.html'; 

    // 1. Загрузка Items
    const { data: items } = await supabase.from('items').select('*');
    if (items) items.forEach(i => GLOBAL_ITEMS[i.id] = i);

    // 2. Загрузка Player
    const { data: player } = await supabase.from('players').select('*').ilike('name', storedName).single();
    if (!player) {
        localStorage.removeItem('playerName');
        return window.location.href = 'index.html';
    }
    me = player;

    // 3. UI Header
    document.getElementById('myNameHeader').textContent = me.name;
    document.getElementById('myPlayerRole').textContent = ROLES_DATA[me.role] || me.role;
    document.getElementById('btnLogout').addEventListener('click', () => { 
        localStorage.removeItem('playerName'); 
        window.location.href='index.html'; 
    });

    // 4. Кнопка Обмена (Только Лидер или Переговорщик)
    if (me.role === 'leader' || me.role === 'Negotiator') {
        document.getElementById('btnShowTrades').classList.remove('hidden');
    }

    initMapLogic();
    await refreshTeamData();
    setupSubscriptions();
    checkGlobalGameState();
    createSnowEffect();
}

function initMapLogic() {
    const mapBlock = document.querySelector('.map-placeholder');
    if(mapBlock) {
        mapBlock.innerHTML = `<img src="https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=800&q=80" style="width:100%; height:100%; object-fit:cover; border-radius:12px; opacity:0.8;" alt="Карта">`;
    }
}

// ===== REALTIME =====
function setupSubscriptions() {
    supabase.channel('my_team')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `id=eq.${me.team_id}`}, payload => { 
            currentTeam = {...currentTeam, ...payload.new}; 
            renderGameInterface(); 
            checkGlobalGameState();
            checkFreezeState();
            if (!document.getElementById('craftModal').classList.contains('hidden')) renderCraftRecipes();
        })
        .subscribe();

    supabase.channel('team_members')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `team_id=eq.${me.team_id}`}, () => refreshTeamData())
        .subscribe();

    if (me.role === 'leader' || me.role === 'Negotiator') {
        supabase.channel('incoming_trades')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades', filter: `to_team_id=eq.${me.team_id}`}, () => {
                const btn = document.getElementById('btnShowTrades'); 
                btn.textContent = "Обмен 🤝 (!)"; 
                btn.classList.add('pulse-gold');
            })
            .subscribe();
    }
    
    supabase.channel('global_state')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => checkGlobalGameState())
        .subscribe();

    supabase.channel('my_player_kick')
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'players', filter: `id=eq.${me.id}` }, () => {
            alert('🚫 Вы были исключены.');
            localStorage.removeItem('playerName');
            window.location.href = 'index.html';
        })
        .subscribe();
}

// ===== UI & RENDER =====
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

    const list = document.getElementById('inventoryList'); list.innerHTML = '';
    const inv = currentTeam.inventory || {};
    let hasItems = false;

    Object.keys(inv).forEach(id => {
        if(inv[id] > 0) {
            hasItems = true;
            const item = GLOBAL_ITEMS[id] || {name:'???', emoji:'📦', type:'item'};
            let style = item.type === 'story' ? 'border-left: 3px solid var(--accent-gold)' : '';
            
            // Кнопка USE (Только Диверсант может использовать гаджеты)
            let actionBtn = '';
            if (item.type === 'gadget') {
                if (me.role === 'Saboteur') {
                    // Цвета кнопок
                    let btnColor = '#ff5555'; 
                    if (item.id == 11) btnColor = '#8be9fd'; // Лед
                    if (item.id == 12) btnColor = '#5D4037'; // Какао
                    actionBtn = `<button class="btn-use" style="background:${btnColor}" onclick="handleItemUse(${id})">USE</button>`;
                } else {
                    // Для других ролей просто показываем, что это гаджет, но без кнопки
                    actionBtn = `<span style="font-size:0.7rem; opacity:0.5;">(Гаджет)</span>`;
                }
            }

            list.innerHTML += `
            <li style="${style}">
                <div style="display:flex;align-items:center;gap:10px; flex-grow: 1;">
                    <span style="font-size:1.5rem">${item.emoji}</span> 
                    <div style="display:flex; flex-direction:column;">
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

    // Tasks
    const tbody = document.getElementById('tasksTableBody');
    const progressEl = document.getElementById('taskProgress');
    tbody.innerHTML = '';
    const tasks = currentTeam.tasks || [];
    let completedCount = 0;
    if (tasks.length === 0) tbody.innerHTML = '<tr><td colspan="3" class="muted" style="text-align:center; padding:20px;">Нет задач</td></tr>'; 
    else {
        tasks.forEach(task => {
            if(task.completed) completedCount++;
            const tr = document.createElement('tr'); tr.className = `task-row ${task.completed ? 'completed' : ''}`;
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
    }
    renderMembers();
    checkFreezeState(); 
}

// =============================================
// ===== VFX: ЭФФЕКТЫ ===============
// =============================================

// 1. СНЕГ
function createSnowEffect() {
    const cvs = document.getElementById('snowCanvas'); if(!cvs) return;
    const ctx = cvs.getContext('2d');
    let W = window.innerWidth, H = window.innerHeight;
    window.addEventListener('resize', () => { W=window.innerWidth; H=window.innerHeight; cvs.width=W; cvs.height=H; });
    cvs.width=W; cvs.height=H;
    const f=Array.from({length:40},()=>({x:Math.random()*W,y:Math.random()*H,s:Math.random()+1}));
    setInterval(()=>{
        ctx.clearRect(0,0,W,H); ctx.fillStyle="rgba(255,255,255,0.7)"; ctx.beginPath();
        f.forEach(p=>{ctx.moveTo(p.x,p.y);ctx.arc(p.x,p.y,p.s,0,Math.PI*2);p.y+=p.s/2;if(p.y>H)p.y=-5;});ctx.fill();
    },40);
}

// 2. ЛЕД
let iceAnimFrameId = null;
const iceParticles = [];
const iceSprite = new Image();
iceSprite.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%2300FFFF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='12' y1='2' x2='12' y2='22'/%3E%3Cline x1='12' y1='2' x2='8' y2='6'/%3E%3Cline x1='12' y1='2' x2='16' y2='6'/%3E%3Cline x1='2' y1='12' x2='22' y2='12'/%3E%3Cline x1='2' y1='12' x2='6' y2='8'/%3E%3Cline x1='2' y1='12' x2='6' y2='16'/%3E%3Cline x1='12' y1='22' x2='8' y2='18'/%3E%3Cline x1='12' y1='22' x2='16' y2='18'/%3E%3Cline x1='22' y1='12' x2='18' y2='8'/%3E%3Cline x1='22' y1='12' x2='18' y2='16'/%3E%3C/svg%3E";

function startIceFallAnimation() {
    const canvas = document.getElementById('iceFallCanvas'); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.classList.remove('hidden');
    let W = window.innerWidth, H = window.innerHeight;
    canvas.width = W; canvas.height = H;
    if (iceParticles.length === 0) {
        const count = Math.floor(Math.random() * 15) + 20;
        for (let i = 0; i < count; i++) {
            iceParticles.push({ x: Math.random() * W, y: Math.random() * H - H, speed: Math.random() * 4 + 2, size: Math.random() * 20 + 15, rot: Math.random() * Math.PI * 2, rotSpeed: (Math.random() - 0.5) * 0.05 });
        }
    }
    function draw() {
        ctx.clearRect(0, 0, W, H); ctx.shadowBlur = 10; ctx.shadowColor = "rgba(0, 255, 255, 0.8)";
        for (let i = 0; i < iceParticles.length; i++) {
            let p = iceParticles[i]; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.drawImage(iceSprite, -p.size / 2, -p.size / 2, p.size, p.size); ctx.restore();
            p.y += p.speed; p.x += Math.sin(p.y / 50) * 0.5; p.rot += p.rotSpeed;
            if (p.y > H + 50) { p.y = -50; p.x = Math.random() * W; }
        }
        iceAnimFrameId = requestAnimationFrame(draw);
    }
    if (!iceAnimFrameId) draw();
}
function stopIceFallAnimation() {
    const canvas = document.getElementById('iceFallCanvas');
    if (iceAnimFrameId) { cancelAnimationFrame(iceAnimFrameId); iceAnimFrameId = null; }
    if (canvas) { const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.classList.add('hidden'); }
    iceParticles.length = 0; 
}

// 3. КАКАО
window.triggerCocoaEffect = () => {
    const overlay = document.getElementById('cocoaOverlay');
    const audio = document.getElementById('lavaAudio');
    if (!overlay) return;
    overlay.classList.remove('hidden'); overlay.innerHTML = ''; 
    if(audio) { audio.currentTime = 0; audio.playbackRate = 0.9 + Math.random() * 0.2; audio.play().catch(() => {}); }
    const count = Math.floor(Math.random() * 6) + 14; 
    for (let i = 0; i < count; i++) {
        const wrapper = document.createElement('div'); wrapper.classList.add('cocoa-wrapper');
        const shape = document.createElement('div'); shape.classList.add('cocoa-shape');
        const size = Math.floor(Math.random() * 140) + 60; 
        wrapper.style.width = `${size}px`; wrapper.style.height = `${size}px`; wrapper.style.left = `${Math.random() * 90}%`; wrapper.style.top = `${Math.random() * 50}%`; 
        const r = () => Math.floor(Math.random() * 50) + 25; 
        shape.style.borderRadius = `${r()}% ${r()}% ${r()}% ${r()}% / ${r()}% ${r()}% ${r()}% ${r()}%`;
        shape.style.rotate = `${Math.random() * 360}deg`; 
        wrapper.style.animationDuration = `${3 + Math.random() * 3}s`; 
        const delay = Math.random() * 0.5; wrapper.style.animationDelay = `${delay}s`; shape.style.animationDelay = `${delay}s`; 
        wrapper.appendChild(shape); overlay.appendChild(wrapper);
    }
    setTimeout(() => { overlay.innerHTML = ''; overlay.classList.add('hidden'); }, 7000);
};

// 4. ЛОГИКА ЗАМОРОЗКИ
let wasFrozen = false; 
function checkFreezeState() {
    if (!currentTeam) return;
    const isFrozen = currentTeam.frozen_until && new Date(currentTeam.frozen_until) > new Date();
    const body = document.body;
    const iceOverlay = document.getElementById('iceOverlay');

    if (isFrozen) {
        if (!wasFrozen) {
            body.classList.add('frozen-mode', 'body-shake');
            iceOverlay.classList.remove('hidden'); iceOverlay.classList.add('smash');
            startIceFallAnimation(); 
            setTimeout(() => { iceOverlay.classList.remove('smash'); body.classList.remove('body-shake'); }, 500);
            wasFrozen = true;
            if (navigator.vibrate) navigator.vibrate([200, 50, 200]);
        }
        const left = Math.ceil((new Date(currentTeam.frozen_until) - new Date()) / 1000);
        document.getElementById('myTeamName').innerHTML = `<span style="color:var(--accent-ice);">❄️ ${left}с</span>`;
        setTimeout(checkFreezeState, 1000);
    } else if (wasFrozen) {
        // Разморозка
        document.getElementById('fireOverlay').classList.remove('hidden');
        document.getElementById('fireOverlay').classList.add('boom');
        body.classList.remove('frozen-mode');
        iceOverlay.classList.add('hidden');
        stopIceFallAnimation(); 
        setTimeout(() => document.getElementById('fireOverlay').classList.add('hidden'), 1200);
        wasFrozen = false;
        const staticInfo = TEAMS_STATIC_DATA.find(t => t.id === currentTeam.id);
        document.getElementById('myTeamName').innerHTML = `${currentTeam.name_by_leader || currentTeam.name} ${staticInfo.symbol}`;
        if (navigator.vibrate) navigator.vibrate(100);
    }
}

// ===== ОБРАБОТКА ИСПОЛЬЗОВАНИЯ (LOGIC) =====
window.handleItemUse = async (itemId) => {
    // 1. Проверка Роли: Только ДИВЕРСАНТ
    if (me.role !== 'Saboteur') {
        alert("🚫 Только Диверсант может использовать гаджеты!");
        return;
    }

    // 2. Проверка Кулдауна (2 минуты)
    const now = Date.now();
    if (now - lastGadgetUsageTime < GADGET_COOLDOWN_MS) {
        const remaining = Math.ceil((GADGET_COOLDOWN_MS - (now - lastGadgetUsageTime)) / 1000);
        alert(`⏳ Перезарядка гаджетов: ${remaining} сек.`);
        return;
    }

    // 3. Использование
    if (itemId == 11) {
        // ЛЕД: Выбор цели
        openTargetModal(itemId);
    } 
    else if (itemId == 12) {
        // КАКАО: Лечит (снимает лед) и дает эффект
        // Если мы заморожены — используем на себя (лечение)
        const isFrozen = currentTeam.frozen_until && new Date(currentTeam.frozen_until) > new Date();
        
        triggerCocoaEffect(); // Визуал всегда

        if (isFrozen) {
            // Снимаем заморозку с себя
            await executeGadget(itemId, me.team_id); 
        } else {
            // Если не заморожены, можно просто потратить (или кинуть в кого-то, если нужно)
            // В текущей логике: тратим на себя как "напиток"
            await executeGadget(itemId, me.team_id);
        }
    }
    else if (itemId == 13) {
        // ОГОНЬ: Тоже снимает лед (резерв)
        await executeGadget(itemId, me.team_id); 
    }
};

window.openTargetModal = async (itemId) => {
    document.getElementById('targetModal').classList.remove('hidden');
    const select = document.getElementById('targetSelect');
    select.innerHTML = '<option>Поиск...</option>';
    const { data: teams } = await supabase.from('teams').select('id, name, frozen_until').neq('id', me.team_id);
    
    // Фильтруем: Нельзя заморозить того, кто уже заморожен!
    select.innerHTML = '';
    teams.forEach(t => {
        const isFrozen = t.frozen_until && new Date(t.frozen_until) > new Date();
        if (!isFrozen) {
            select.innerHTML += `<option value="${t.id}">${t.name}</option>`;
        }
    });

    if (select.innerHTML === '') {
        select.innerHTML = '<option disabled>Все команды уже заморожены!</option>';
    }
    
    document.getElementById('btnConfirmFreeze').onclick = () => {
        if (!select.value) return;
        executeGadget(itemId, select.value);
        document.getElementById('targetModal').classList.add('hidden');
    };
};
window.closeTargetModal = () => document.getElementById('targetModal').classList.add('hidden');

async function executeGadget(itemId, targetId) {
    const { data, error } = await supabase.rpc('use_gadget', {
        attacker_team_id: me.team_id,
        target_team_id: targetId || me.team_id,
        item_id: parseInt(itemId)
    });

    if (error || !data.success) {
        alert('Ошибка: ' + (error?.message || data?.message));
    } else {
        // Успех! Записываем время для кулдауна
        lastGadgetUsageTime = Date.now();
        
        const { data: updated } = await supabase.from('teams').select('*').eq('id', me.team_id).single();
        currentTeam = updated;
        checkFreezeState(); 
        renderGameInterface();  
    }
}

// ===== КРАФТ (Только ИССЛЕДОВАТЕЛЬ) =====
window.openCraftModal = () => { 
    if (me.role !== 'Explorer') return alert("🚫 Только Исследователь может крафтить!");
    document.getElementById('craftModal').classList.remove('hidden'); 
    renderCraftRecipes(); 
};

window.renderCraftRecipes = () => {
    const container = document.getElementById('craftRecipesList'); container.innerHTML = '';
    const inv = currentTeam?.inventory || {};
    CRAFT_RECIPES.forEach(recipe => {
        const resultItem = GLOBAL_ITEMS[recipe.resultId]; if (!resultItem) return;
        let canCraft = true;
        let ingredientsHtml = recipe.ingredients.map((ing, i) => {
            const itemData = GLOBAL_ITEMS[ing.id] || { emoji: '❓' }; const has = inv[ing.id] || 0;
            if (has < ing.count) canCraft = false;
            return `${i > 0 ? '<div class="plus-sign">+</div>' : ''}<div class="ingredient ${has >= ing.count ? 'has-it' : 'missing'}"><div style="font-size:1.5rem">${itemData.emoji}</div><div>${has}/${ing.count}</div></div>`;
        }).join('');
        container.innerHTML += `<div class="craft-recipe ${resultItem.rarity ? 'rarity-'+resultItem.rarity : ''}"><div style="display:flex; justify-content:space-between; margin-bottom:10px;"><strong style="color:var(--accent-gold)">${recipe.name}</strong><span class="muted" style="font-size:0.8rem">${recipe.description}</span></div><div class="recipe-row">${ingredientsHtml}<div class="arrow-sign">➔</div><div class="craft-result"><div style="font-size:1.8rem">${resultItem.emoji}</div></div></div><button class="start-button" style="margin-top:10px; padding:10px; font-size:0.9rem; ${canCraft ? '' : 'opacity:0.5; background:#333;'}" onclick="${canCraft ? `craftItem(${recipe.id})` : ''}">${canCraft ? 'СОЗДАТЬ ⚒️' : 'НЕТ РЕСУРСОВ'}</button></div>`;
    });
};

window.craftItem = async (recipeId) => {
    const recipe = CRAFT_RECIPES.find(r => r.id === recipeId);
    const newInventory = { ...currentTeam.inventory };
    for (let ing of recipe.ingredients) { if ((newInventory[ing.id] || 0) < ing.count) return alert("Мало ресурсов!"); newInventory[ing.id] -= ing.count; }
    newInventory[recipe.resultId] = (newInventory[recipe.resultId] || 0) + 1;
    currentTeam.inventory = newInventory; renderGameInterface(); renderCraftRecipes(); 
    if (navigator.vibrate) navigator.vibrate(50); alert(`Создан: ${GLOBAL_ITEMS[recipe.resultId].name}`);
    await supabase.from('teams').update({ inventory: newInventory }).eq('id', me.team_id);
};

// ===== ОБМЕН (Только ПЕРЕГОВОРЩИК или ЛИДЕР) =====
window.openIncomingTrades = async () => {
    if (me.role !== 'Negotiator' && me.role !== 'leader') return alert("🚫 Только Переговорщик!");
    
    document.getElementById('incomingTradesModal').classList.remove('hidden'); document.getElementById('btnShowTrades').classList.remove('pulse-gold');
    const list = document.getElementById('incomingTradesList'); list.innerHTML = `<button class="btn-create-big" onclick="openCreateTrade()"><span>+</span> СОЗДАТЬ</button>`;
    const { data: trades } = await supabase.from('trades').select('*, teams!from_team_id(name)').eq('to_team_id', me.team_id).eq('status', 'pending');
    if(!trades?.length) list.innerHTML += '<div class="muted" style="text-align:center;margin-top:20px">Нет предложений</div>';
    trades.forEach(tr => { const off = GLOBAL_ITEMS[tr.offer_item_id]; const req = GLOBAL_ITEMS[tr.request_item_id]; list.innerHTML += `<div class="trade-card"><div style="color:var(--accent-gold);">От: ${tr.teams.name}</div><div style="display:grid;grid-template-columns:1fr auto 1fr;gap:5px;align-items:center;background:rgba(0,0,0,0.3);padding:10px;border-radius:10px;"><div style="text-align:center"><div style="font-size:1.5rem">${off?.emoji}</div><span style="color:#6eff9f;font-size:0.7rem">ДАЮТ</span></div><div style="opacity:0.5">➔</div><div style="text-align:center"><div style="font-size:1.5rem">${req?.emoji}</div><span style="color:#ff5555;font-size:0.7rem">ПРОСЯТ</span></div></div><div class="trade-actions"><button class="secondary" onclick="rejectTrade(${tr.id})">ОТКАЗ</button><button class="start-button" style="margin:0;font-size:0.9rem" onclick="acceptTrade(${tr.id})">ПРИНЯТЬ</button></div></div>`; });
};
window.closeIncomingTrades = () => document.getElementById('incomingTradesModal').classList.add('hidden');
window.openCreateTrade = async () => { 
    if (me.role !== 'Negotiator' && me.role !== 'leader') return;
    document.getElementById('incomingTradesModal').classList.add('hidden'); document.getElementById('tradeModal').classList.remove('hidden'); const tSelect = document.getElementById('tradeTargetTeam'); const { data: teams } = await supabase.from('teams').select('id,name').neq('id', me.team_id); tSelect.innerHTML = teams.map(t => `<option value="${t.id}">${t.name}</option>`).join(''); const oSelect = document.getElementById('tradeOfferSelect'); oSelect.innerHTML = ''; Object.keys(currentTeam.inventory||{}).forEach(id => { if(currentTeam.inventory[id]>0) oSelect.innerHTML += `<option value="${id}">${GLOBAL_ITEMS[id]?.emoji} ${GLOBAL_ITEMS[id]?.name}</option>`; }); document.getElementById('tradeRequestSelect').innerHTML = Object.values(GLOBAL_ITEMS).map(i => `<option value="${i.id}">${i.emoji} ${i.name}</option>`).join(''); 
};
window.closeTradeModal = () => document.getElementById('tradeModal').classList.add('hidden');
window.sendTradeRequest = async () => { const to = document.getElementById('tradeTargetTeam').value; const off = document.getElementById('tradeOfferSelect').value; const req = document.getElementById('tradeRequestSelect').value; if(!off || !req) return alert('Выберите предметы'); await supabase.from('trades').insert({from_team_id:me.team_id, to_team_id:to, offer_item_id:off, request_item_id:req}); alert('Отправлено!'); closeTradeModal(); };
window.acceptTrade = async (id) => { const { error } = await supabase.rpc('accept_trade', { trade_id_input: id }); if(error) alert("Ошибка."); else { alert('Успешно!'); openIncomingTrades(); } };
window.rejectTrade = async (id) => { await supabase.from('trades').update({status:'rejected'}).eq('id',id); openIncomingTrades(); };

// ===== ПРОЧЕЕ =====
window.toggleTask = async (taskId, checkboxEl) => {
    if(hasShownGameOver) { alert('Конец игры'); checkboxEl.checked = false; return; }
    if(me.role !== 'leader') { checkboxEl.checked = !checkboxEl.checked; alert('Только Лидер'); return; }
    const task = currentTeam.tasks.find(t => t.id === taskId);
    const inv = { ...currentTeam.inventory };
    const isChecked = checkboxEl.checked;
    if(task.type === 'requirement' && isChecked) {
        if((inv[task.required_item_id] || 0) < 1) { alert('Нет предмета'); checkboxEl.checked = false; return; }
        inv[task.required_item_id]--;
    }
    if(task.type === 'reward' && isChecked) { const rId = task.reward_item_id; inv[rId] = (inv[rId] || 0) + 1; alert(`Получено: ${GLOBAL_ITEMS[rId]?.name}`); }
    const newTasks = currentTeam.tasks.map(t => t.id === taskId ? {...t, completed: isChecked} : t);
    currentTeam.tasks = newTasks; currentTeam.inventory = inv; renderGameInterface(); 
    await supabase.from('teams').update({ tasks: newTasks, inventory: inv }).eq('id', me.team_id);
};
async function renderMembers() {
    const list = document.getElementById('currentTeamMembersList');
    const { data: members } = await supabase.from('players').select('*').eq('team_id', me.team_id);
    list.innerHTML = ''; document.getElementById('myTeamMembersCount').textContent = members ? members.length : 0;
    if (members) members.forEach(m => { const kickBtn = (me.role === 'leader' && m.id !== me.id) ? `<button class="icon-btn" style="color:var(--accent-red); margin-left:auto;" onclick="kickPlayer('${m.id}', this)">✖</button>` : ''; list.innerHTML += `<li style="display:flex; align-items:center; width:100%;"><span>${m.name} ${m.role==='leader'?'👑':''}</span>${kickBtn}</li>`; });
}
window.kickPlayer = async (id, btn) => { if(!confirm('Исключить?')) return; if (btn) btn.closest('li').style.opacity = '0.3'; await supabase.from('players').delete().eq('id', id); refreshTeamData(); };
window.openItemsGuide = () => { document.getElementById('itemsGuideModal').classList.remove('hidden'); document.querySelector('#itemsGuideModal tbody').innerHTML = Object.values(GLOBAL_ITEMS).map(i => `<tr class="guide-item-row"><td class="guide-icon">${i.emoji}</td><td class="guide-info"><h4>${i.name}</h4><p>${i.description||''}</p></td></tr>`).join(''); };
window.closeItemsGuide = () => document.getElementById('itemsGuideModal').classList.add('hidden');

async function checkGlobalGameState() {
    const { data: teams } = await supabase.from('teams').select('*').order('updated_at', { ascending: true });
    if (!teams) return;
    const winners = teams.filter(t => t.tasks && t.tasks.length > 0 && t.tasks.every(task => task.completed));
    const amIWinner = winners.some(w => w.id === me.team_id);
    if (amIWinner && !hasShownVictory) { showVictoryModal(); return; }
    if (!amIWinner && !hasShownGameOver) {
        if (winners.length >= 2) {
            const secondWinnerTime = new Date(winners[1].updated_at).getTime();
            deadlineTimestamp = secondWinnerTime + (5 * 60 * 1000);
            document.getElementById('lastChanceTimer').classList.remove('hidden');
            if (!timerUiInterval) { timerUiInterval = setInterval(updateTimerUI, 1000); updateTimerUI(); }
        } else document.getElementById('lastChanceTimer').classList.add('hidden');
    }
}

initGame();