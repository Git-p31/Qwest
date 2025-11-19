// script.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ===== CONFIG (ВАШИ КЛЮЧИ) =====
const SUPABASE_URL = 'https://akvvvudcnjnevkzxnfoi.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrdnZ2dWRjbmpuZXZrenhuZm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1NDMyNDQsImV4cCI6MjA3OTExOTI0NH0.pOA1Ebemf3IYY4ckaDQ31uDr8jMBljAzcnai_MWr2pY'; 
const BUCKET_NAME = 'team_selfies'; 

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== ДАННЫЕ =====
const TEAMS_STATIC_DATA = [
    { id: 101, defaultName: 'Снежинки', color: '#8be9fd', symbol: '❄️' },
    { id: 102, defaultName: 'Елочные Шары', color: '#ff5555', symbol: '🔴' },
    { id: 103, defaultName: 'Гирлянды', color: '#f1fa8c', symbol: '💡' },
    { id: 104, defaultName: 'Деды Морозы', color: '#bd93f9', symbol: '🎅' },
];
const ROLES_DATA = { Explorer: 'Исследователь', Guardian: 'Хранитель', Saboteur: 'Диверсант', Negotiator: 'Переговорщик', leader: 'Лидер' };

let me = null; 
let currentTeam = null; 
let GLOBAL_ITEMS = {}; 
let tempSelfieUrl = null; 
let selectedTeamId = null;
let selectedRole = null;

// ===== HELPERS =====
function setStatus(text, ok = true) {
    const el = document.getElementById('status') || document.getElementById('status-selection');
    if(el) { el.textContent = text; el.style.color = ok ? '#6eff9f' : '#ff5555'; }
}

// ===== 1. INIT & AUTH =====
async function fetchItemsParams() {
    const { data } = await supabase.from('items').select('*');
    if (data) data.forEach(item => GLOBAL_ITEMS[item.id] = item);
}

async function checkLoginState(name) {
    if (!name) return null;
    const { data } = await supabase.from('players').select('*').ilike('name', name).limit(1);
    if (!data || data.length === 0) return null;
    me = data[0];
    return me;
}

// ===== 2. SELECTION SCREEN =====
function initSelectionScreen() {
    const btnStart = document.getElementById('btnStartAdventure');
    const nameInput = document.getElementById('nameInput');
    if (!btnStart) return; 

    setStatus('Готов к подключению.'); 
    renderTeamCards();
    
    const storedName = localStorage.getItem('playerName');
    if (storedName) { nameInput.value = storedName; updateStartButton(); }

    document.getElementById('teamSelection').addEventListener('click', (e) => {
        const btn = e.target.closest('.team-card-btn');
        if (btn) {
            document.querySelectorAll('.team-card-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedTeamId = parseInt(btn.dataset.teamid);
            updateStartButton();
        }
    });

    document.getElementById('roleSelection').addEventListener('click', (e) => {
        const btn = e.target.closest('.role-card');
        if (btn) {
            document.querySelectorAll('.role-card').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedRole = btn.dataset.role;
            updateStartButton();
        }
    });

    nameInput.addEventListener('input', updateStartButton);
    btnStart.addEventListener('click', handleStartAdventure);
    
    document.getElementById('modalBtnFinish')?.addEventListener('click', finalizeTeamSetup);
    document.getElementById('modalSelfieUpload')?.addEventListener('change', uploadSelfie);
}

function renderTeamCards() {
    const container = document.getElementById('teamSelection');
    container.innerHTML = TEAMS_STATIC_DATA.map(t => `
        <button class="team-card-btn" data-teamid="${t.id}" style="border-left-color: ${t.color};">
            ${t.symbol} ${t.defaultName}
        </button>
    `).join('');
}

function updateStartButton() {
    const name = document.getElementById('nameInput').value.trim();
    const btn = document.getElementById('btnStartAdventure');
    const ready = name && selectedTeamId && selectedRole;
    btn.disabled = !ready;
    btn.textContent = ready ? 'НАЧАТЬ ИГРУ' : 'СДЕЛАЙТЕ ВЫБОР';
}

async function handleStartAdventure() {
    const name = document.getElementById('nameInput').value.trim();
    if (!name || !selectedTeamId || !selectedRole) return setStatus('Заполните все поля!', false);
    setStatus('Вход...');

    // Проверка лидера
    const { count: leaderCount } = await supabase.from('players').select('id', { count: 'exact', head: true }).eq('team_id', selectedTeamId).eq('role', 'leader').neq('name', name);
    let finalRole = selectedRole;
    if (leaderCount === 0) finalRole = 'leader';
    else if (selectedRole === 'leader' && leaderCount > 0) { alert('Лидер уже есть! Вы будете Исследователем.'); finalRole = 'Explorer'; }

    // Регистрация/Обновление
    let { data: player } = await supabase.from('players').select('*').ilike('name', name).single();
    if (!player) {
        const { data: newPlayer, error } = await supabase.from('players').insert({ name, team_id: selectedTeamId, role: finalRole }).select().single();
        if (error) return setStatus(error.code === '23505' ? 'Имя занято!' : 'Ошибка', false);
        player = newPlayer;
    } else {
        if (player.role === 'leader' && player.team_id === selectedTeamId) finalRole = 'leader';
        await supabase.from('players').update({ team_id: selectedTeamId, role: finalRole }).eq('id', player.id);
        player.team_id = selectedTeamId; player.role = finalRole;
    }

    localStorage.setItem('playerName', player.name); me = player;
    const { data: team } = await supabase.from('teams').select('*').eq('id', selectedTeamId).single();
    
    if (me.role === 'leader' && !team.name_by_leader) openModalSetup();
    else window.location.href = 'main-screen.html';
}

function openModalSetup() {
    document.getElementById('teamModal').classList.remove('hidden');
    const staticInfo = TEAMS_STATIC_DATA.find(t => t.id === selectedTeamId);
    document.getElementById('modalTitle').textContent = `Настройка: ${staticInfo.defaultName}`;
}

async function uploadSelfie(e) {
    const file = e.target.files[0]; if (!file) return;
    setStatus('Загрузка...');
    const path = `${me.team_id}/selfie_${Date.now()}.png`;
    const { error } = await supabase.storage.from(BUCKET_NAME).upload(path, file);
    if(error) return setStatus('Ошибка фото', false);
    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
    tempSelfieUrl = data.publicUrl;
    document.getElementById('modalSelfieDisplay').innerHTML = `<img src="${tempSelfieUrl}" style="width:80px;height:80px;border-radius:50%;border:2px solid #fff;">`;
    setStatus('Готово!', true);
}

async function finalizeTeamSetup() {
    const newName = document.getElementById('modalNewTeamNameInput').value.trim();
    if(!newName) return alert('Введите название!');
    await supabase.from('teams').update({ name_by_leader: newName, selfie_url: tempSelfieUrl }).eq('id', me.team_id);
    window.location.href = 'main-screen.html';
}

// ===== 3. GAME SCREEN =====
function initGameScreen() {
    const storedName = localStorage.getItem('playerName');
    if (!storedName) return window.location.href = 'index.html';
    setStatus('Загрузка...');
    fetchItemsParams().then(() => {
        checkLoginState(storedName).then(player => {
            if (!player || !player.team_id) return window.location.href = 'index.html';
            document.getElementById('myNameHeader').textContent = player.name;
            document.getElementById('myPlayerRole').textContent = ROLES_DATA[player.role];
            document.getElementById('btnLogout').addEventListener('click', () => { localStorage.removeItem('playerName'); window.location.href='index.html'; });
            refreshTeamData(); setupSubscriptions(); setStatus('В игре.');
        });
    });
}

function setupSubscriptions() {
    supabase.channel('game_room')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `id=eq.${me.team_id}`}, payload => { currentTeam = {...currentTeam, ...payload.new}; renderGameInterface(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `team_id=eq.${me.team_id}`}, () => refreshTeamData())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades', filter: `to_team_id=eq.${me.team_id}`}, () => {
            const btn = document.getElementById('btnShowTrades'); if(btn) { btn.textContent = "Обмен 🤝 (!)"; btn.style.borderColor = "#6eff9f"; }
        })
        .subscribe();
}

async function refreshTeamData() {
    const { data: team } = await supabase.from('teams').select('*').eq('id', me.team_id).single();
    if (team) { currentTeam = team; renderGameInterface(); }
}

function renderGameInterface() {
    if(!currentTeam) return;
    const staticInfo = TEAMS_STATIC_DATA.find(t => t.id === currentTeam.id);
    const displayName = currentTeam.name_by_leader || currentTeam.name;
    let html = `${displayName} ${staticInfo.symbol}`;
    if(currentTeam.selfie_url) html = `<img src="${currentTeam.selfie_url}" style="width:30px;height:30px;border-radius:50%;margin-right:8px;vertical-align:middle;"> ${html}`;
    document.getElementById('myTeamName').innerHTML = html;
    renderInventory(); renderTasks(); renderMembers();
}

function renderInventory() {
    const list = document.getElementById('inventoryList'); list.innerHTML = '';
    const inv = currentTeam.inventory || {};
    const ids = Object.keys(inv);
    if(ids.length === 0) { list.innerHTML = '<li class="muted">Рюкзак пуст...</li>'; return; }
    ids.forEach(id => {
        if(inv[id] > 0) {
            const item = GLOBAL_ITEMS[id] || {name:'???', emoji:'📦', description:''};
            const li = document.createElement('li');
            li.innerHTML = `<span style="font-size:1.2em;margin-right:10px;">${item.emoji}</span><div style="flex-grow:1;"><div style="font-weight:600;">${item.name}</div></div><span class="inv-count">x${inv[id]}</span>`;
            list.appendChild(li);
        }
    });
}

function renderTasks() {
    const tbody = document.getElementById('tasksTableBody');
    const progressEl = document.getElementById('taskProgress');
    tbody.innerHTML = '';
    const tasks = currentTeam.tasks || [];
    const inv = currentTeam.inventory || {};
    const isLeader = me.role === 'leader';
    let completedCount = 0;

    if (tasks.length === 0) { tbody.innerHTML = '<tr><td colspan="3" class="muted" style="padding:10px;">Заданий нет</td></tr>'; return; }

    tasks.forEach(task => {
        if(task.completed) completedCount++;
        const tr = document.createElement('tr'); tr.className = `task-row ${task.completed ? 'completed' : ''}`;
        let checkboxDisabled = !isLeader;
        let statusText = '';

        if(task.type === 'requirement' && !task.completed) {
            const reqId = task.required_item_id;
            const hasItem = (inv[reqId] || 0) > 0;
            if(hasItem) { tr.classList.add('ready'); statusText = '<span style="color:#6eff9f;font-size:0.7em;">(Есть!)</span>'; } 
            else { tr.classList.add('locked'); checkboxDisabled = true; statusText = '<span style="color:#ff5555;font-size:0.7em;">(Нет предмета)</span>'; }
        }

        const checkbox = `<input type="checkbox" class="task-check-input" ${task.completed ? 'checked' : ''} ${checkboxDisabled ? 'disabled' : ''} onchange="toggleTask(${task.id}, this.checked)">`;
        let rewardIcon = '';
        if(task.type === 'reward' && task.reward_item_id) {
            const rItem = GLOBAL_ITEMS[task.reward_item_id];
            rewardIcon = rItem ? rItem.emoji : '🎁';
        } else if(task.type === 'requirement') { rewardIcon = '⭐'; }

        tr.innerHTML = `<td style="text-align:center;">${checkbox}</td><td>${task.text} ${statusText}</td><td style="text-align:center;">${rewardIcon}</td>`;
        tbody.appendChild(tr);
    });
    if(progressEl) progressEl.textContent = Math.round((completedCount/tasks.length)*100) + '%';
}

window.toggleTask = async (taskId, isChecked) => {
    if(me.role !== 'leader') { renderTasks(); return; }
    const task = currentTeam.tasks.find(t => t.id === taskId);
    const inv = { ...currentTeam.inventory };

    if(task.type === 'requirement' && isChecked) {
        const reqId = task.required_item_id;
        if((inv[reqId] || 0) < 1) { alert('Нет предмета!'); renderTasks(); return; }
        if(!confirm(`Сдать предмет?`)) { renderTasks(); return; }
        inv[reqId]--;
    }
    if(task.type === 'reward' && isChecked) {
        const rewId = task.reward_item_id;
        inv[rewId] = (inv[rewId] || 0) + 1;
        alert(`Награда: ${GLOBAL_ITEMS[rewId]?.name}!`);
    }

    const newTasks = currentTeam.tasks.map(t => t.id === taskId ? {...t, completed: isChecked} : t);
    currentTeam.tasks = newTasks; currentTeam.inventory = inv; renderGameInterface();
    await supabase.from('teams').update({ tasks: newTasks, inventory: inv }).eq('id', me.team_id);
};

async function renderMembers() {
    const list = document.getElementById('currentTeamMembersList');
    const { data: members } = await supabase.from('players').select('*').eq('team_id', me.team_id);
    list.innerHTML = '';
    document.getElementById('myTeamMembersCount').textContent = members.length;

    members.forEach(m => {
        const li = document.createElement('li');
        if(m.role === 'leader') li.className = 'leader';
        let html = `<span>${m.name} ${m.role === 'leader' ? '👑' : ''}</span>`;
        if(me.role === 'leader' && m.id !== me.id) html += `<button class="remove-btn" onclick="kickPlayer(${m.id})">×</button>`;
        li.innerHTML = html; list.appendChild(li);
    });
}
window.kickPlayer = async (id) => { if(!confirm('Удалить?')) return; await supabase.from('players').delete().eq('id', id); refreshTeamData(); }

// ==============================================
// 4. ОБМЕН (TRADES)
// ==============================================

window.openItemsGuide = () => {
    document.getElementById('itemsGuideModal').classList.remove('hidden');
    document.getElementById('itemsTableBody').innerHTML = Object.values(GLOBAL_ITEMS).map(i => `<tr><td style="font-size:1.2em;text-align:center;">${i.emoji}</td><td style="color:#FFD700;">${i.name}</td><td class="muted">${i.description}</td></tr>`).join('');
}

// === ОТКРЫТИЕ ОКНА СОЗДАНИЯ ===
window.openCreateTrade = async () => {
    document.getElementById('incomingTradesModal').classList.add('hidden');
    document.getElementById('tradeModal').classList.remove('hidden');

    const tSelect = document.getElementById('tradeTargetTeam');
    const oSelect = document.getElementById('tradeOfferSelect');
    const rSelect = document.getElementById('tradeRequestSelect');

    tSelect.innerHTML = '<option>Загрузка...</option>';
    oSelect.innerHTML = '';
    rSelect.innerHTML = '';

    // 1. КОМУ (Команды)
    const { data: teams } = await supabase.from('teams').select('id,name,name_by_leader').neq('id', me.team_id);
    tSelect.innerHTML = '';
    teams.forEach(t => {
        const sym = TEAMS_STATIC_DATA.find(s=>s.id===t.id)?.symbol || '';
        tSelect.innerHTML += `<option value="${t.id}">${sym} ${t.name_by_leader||t.name}</option>`;
    });

    // 2. ЧТО ОТДАЮ (Инвентарь)
    const inv = currentTeam.inventory || {};
    let has = false;
    Object.keys(inv).forEach(id => {
        if(inv[id]>0) { has=true; oSelect.innerHTML += `<option value="${id}">${GLOBAL_ITEMS[id]?.emoji} ${GLOBAL_ITEMS[id]?.name}</option>`; }
    });
    if(!has) oSelect.innerHTML = '<option disabled>Пусто</option>';

    // 3. ЧТО ХОЧУ (Весь справочник)
    Object.values(GLOBAL_ITEMS).forEach(i => {
        rSelect.innerHTML += `<option value="${i.id}">${i.emoji} ${i.name}</option>`;
    });
}

// === ОТПРАВКА ===
window.sendTradeRequest = async () => {
    const to = document.getElementById('tradeTargetTeam').value;
    const offer = document.getElementById('tradeOfferSelect').value;
    const req = document.getElementById('tradeRequestSelect').value;

    if(!offer || !req) return alert('Выберите предметы!');
    if(offer === req) return alert('Нельзя менять предмет на самого себя!');

    const { error } = await supabase.from('trades').insert({ 
        from_team_id: me.team_id, 
        to_team_id: parseInt(to), 
        offer_item_id: parseInt(offer), 
        request_item_id: parseInt(req), // ВАЖНО: ID желаемого
        status: 'pending' 
    });

    if(error) alert('Ошибка: ' + error.message);
    else { alert('Отправлено!'); window.closeTradeModal(); }
}

// === СПИСОК ВХОДЯЩИХ ===
window.openIncomingTrades = async () => {
    document.getElementById('incomingTradesModal').classList.remove('hidden');
    const cont = document.getElementById('incomingTradesList');
    cont.innerHTML = '<p class="muted">Загрузка...</p>';
    const btn = document.getElementById('btnShowTrades');
    if(btn) { btn.textContent = "Обмен 🤝"; btn.style.borderColor = "var(--glass-border)"; }

    const { data: trades } = await supabase.from('trades')
        .select('id, offer_item_id, request_item_id, teams!from_team_id(name, name_by_leader)')
        .eq('to_team_id', me.team_id).eq('status', 'pending');

    cont.innerHTML = '<button class="start-button" onclick="openCreateTrade()" style="margin-bottom:10px;">➕ Создать Обмен</button>';
    if(!trades || !trades.length) { cont.innerHTML += '<p class="muted" style="text-align:center">Нет предложений</p>'; return; }

    trades.forEach(trade => {
        const offer = GLOBAL_ITEMS[trade.offer_item_id];
        const req = GLOBAL_ITEMS[trade.request_item_id];
        const name = trade.teams.name_by_leader || trade.teams.name;
        
        const div = document.createElement('div');
        div.style.cssText = "background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; margin-bottom:5px; border:1px solid rgba(255,255,255,0.1);";
        
        div.innerHTML = `
            <div style="font-size:0.9em;color:#FFD700;margin-bottom:5px;">От: ${name}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;background:rgba(0,0,0,0.3);padding:5px;border-radius:5px;">
                <div style="text-align:center;font-size:0.8em;color:#6eff9f;">Дают:<br><span style="font-size:1.2em;">${offer?.emoji}</span></div>
                <div style="font-weight:bold;color:#aaa;">⇄</div>
                <div style="text-align:center;font-size:0.8em;color:#ff5555;">Хотят:<br><span style="font-size:1.2em;">${req?.emoji || '❓'}</span></div>
            </div>
            <div style="text-align:right; display:flex; gap:5px; justify-content:flex-end;">
                <button class="secondary" style="color:#ff5555" onclick="rejectTrade(${trade.id})">Отказ</button>
                <button class="start-button" style="width:auto;padding:4px 10px;font-size:0.8em;" onclick="acceptTrade(${trade.id})">Принять</button>
            </div>`;
        cont.appendChild(div);
    });
}

window.acceptTrade = async (id) => {
    const { error } = await supabase.rpc('accept_trade', { trade_id_input: id });
    if(!error) { alert('Обмен успешен!'); window.openIncomingTrades(); } else alert('Ошибка: ' + error.message);
}
window.rejectTrade = async (id) => { await supabase.from('trades').update({status:'rejected'}).eq('id',id); window.openIncomingTrades(); }

window.closeTradeModal = () => document.getElementById('tradeModal').classList.add('hidden');
window.closeIncomingTrades = () => document.getElementById('incomingTradesModal').classList.add('hidden');
window.closeItemsGuide = () => document.getElementById('itemsGuideModal').classList.add('hidden');
window.closeModal = () => document.getElementById('teamModal').classList.add('hidden');

// Снег
function createSnowEffect() {
    const cvs = document.getElementById('snowCanvas');
    const ctx = cvs.getContext('2d');
    let W = window.innerWidth, H = window.innerHeight;
    cvs.width = W; cvs.height = H;
    const f = Array.from({length: 50}, ()=>({x:Math.random()*W,y:Math.random()*H,s:Math.random()+0.5}));
    setInterval(()=>{
        ctx.clearRect(0,0,W,H); ctx.fillStyle="rgba(255,255,255,0.6)"; ctx.beginPath();
        f.forEach(p=>{ ctx.moveTo(p.x,p.y); ctx.arc(p.x,p.y,2,0,Math.PI*2); p.y+=p.s; if(p.y>H) p.y=-5; });
        ctx.fill();
    },30);
}

(function(){ createSnowEffect(); if(window.location.pathname.includes('main')) initGameScreen(); else initSelectionScreen(); })();