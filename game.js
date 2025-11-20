// game.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// CONFIG
const SUPABASE_URL = 'https://akvvvudcnjnevkzxnfoi.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrdnZ2dWRjbmpuZXZrenhuZm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1NDMyNDQsImV4cCI6MjA3OTExOTI0NH0.pOA1Ebemf3IYY4ckaDQ31uDr8jMBljAzcnai_MWr2pY'; 
const BUCKET_NAME = 'team_selfies'; 

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DATA
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

// Флаги финала
let hasShownVictory = false; 
let hasShownGameOver = false; 
let timerInterval = null;

// ===== INIT =====
async function initGame() {
    const storedName = localStorage.getItem('playerName');
    if (!storedName) return window.location.href = 'index.html'; 

    const { data: items } = await supabase.from('items').select('*');
    if (items) items.forEach(i => GLOBAL_ITEMS[i.id] = i);

    const { data: player } = await supabase.from('players').select('*').ilike('name', storedName).single();
    if (!player) return window.location.href = 'index.html';
    me = player;

    document.getElementById('myNameHeader').textContent = me.name;
    document.getElementById('myPlayerRole').textContent = ROLES_DATA[me.role] || me.role;
    document.getElementById('btnLogout').addEventListener('click', () => { localStorage.removeItem('playerName'); window.location.href='index.html'; });

    const tradeBtn = document.getElementById('btnShowTrades');
    if (me.role === 'leader') tradeBtn.classList.remove('hidden');

    await refreshTeamData();
    setupSubscriptions();
    checkGlobalGameState();
    createSnowEffect();
}

// ===== SUBSCRIPTIONS =====
function setupSubscriptions() {
    supabase.channel('my_team')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `id=eq.${me.team_id}`}, payload => { 
            currentTeam = {...currentTeam, ...payload.new}; 
            renderGameInterface(); 
            checkGlobalGameState();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `team_id=eq.${me.team_id}`}, () => refreshTeamData())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades', filter: `to_team_id=eq.${me.team_id}`}, () => {
            if (me.role === 'leader') {
                const btn = document.getElementById('btnShowTrades'); 
                btn.textContent = "Обмен 🤝 (!)"; btn.style.borderColor = "#6eff9f";
            }
        })
        .subscribe();

    supabase.channel('global_state')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
            checkGlobalGameState();
        })
        .subscribe();
}

// ===== FINAL LOGIC =====
async function checkGlobalGameState() {
    const { data: teams } = await supabase.from('teams').select('*').order('updated_at', { ascending: true });
    if (!teams) return;

    const winners = teams.filter(t => t.tasks && t.tasks.length > 0 && t.tasks.every(task => task.completed));
    
    const modal = document.getElementById('endGameModal');
    const title = document.getElementById('endTitle');
    const msg = document.getElementById('endMessage');
    const winListBlock = document.getElementById('winnersListBlock');
    const winListText = document.getElementById('winnersNames');
    const content = modal.querySelector('.modal-content');
    const btnClose = document.getElementById('btnCloseModal');
    const timerDiv = document.getElementById('lastChanceTimer');
    const timerText = document.getElementById('timerCountdown');

    const myIndexInWinners = winners.findIndex(w => w.id === me.team_id);
    const amIWinner = myIndexInWinners !== -1;

    if (amIWinner && !hasShownVictory) {
        modal.classList.remove('hidden');
        winListBlock.classList.add('hidden');
        timerDiv.classList.add('hidden');
        if(timerInterval) clearInterval(timerInterval);
        btnClose.classList.remove('hidden');

        if (myIndexInWinners < 2) {
            content.className = "modal-content pulse-gold";
            title.textContent = `👑 ВЫ ТОП-${myIndexInWinners + 1}!`;
            title.style.color = "var(--accent-gold)";
            msg.innerHTML = `Поздравляем! Вы заняли призовое место.<br>Пройдите на финальную локацию.`;
        } else {
            content.className = "modal-content pulse-green";
            title.textContent = `🚀 УСПЕЛИ!`;
            title.style.color = "var(--accent-cyan)";
            msg.innerHTML = `Вы успели в последний момент!<br>Бегите на финал!`;
        }
        hasShownVictory = true;
        return;
    }

    if (!amIWinner) {
        if (winners.length < 2) {
            timerDiv.classList.add('hidden');
            return;
        }

        const secondWinnerTime = new Date(winners[1].updated_at).getTime();
        const DEADLINE_MS = 5 * 60 * 1000;
        const deadlineTime = secondWinnerTime + DEADLINE_MS;
        const now = Date.now();

        if (now < deadlineTime) {
            timerDiv.classList.remove('hidden');
            const diff = deadlineTime - now;
            const m = Math.floor(diff / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            timerText.textContent = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;

            if (!timerInterval) timerInterval = setInterval(() => checkGlobalGameState(), 1000);
        } else {
            if(timerInterval) clearInterval(timerInterval);
            timerDiv.classList.add('hidden');

            if (!hasShownGameOver) {
                modal.classList.remove('hidden');
                content.className = "modal-content pulse-red";
                btnClose.classList.add('hidden');
                title.textContent = "☠️ ИГРА ОКОНЧЕНА";
                title.style.color = "var(--accent-red)";
                msg.innerHTML = `Время вышло.`;
                
                const top2Names = winners.slice(0, 2).map(w => w.name_by_leader || w.name).join(' и ');
                winListText.textContent = top2Names;
                winListBlock.classList.remove('hidden');
                hasShownGameOver = true;
            }
        }
    }
}

// ===== RENDER =====
async function refreshTeamData() {
    const { data: team } = await supabase.from('teams').select('*').eq('id', me.team_id).single();
    if (team) { currentTeam = team; renderGameInterface(); }
}

function renderGameInterface() {
    if(!currentTeam) return;
    const staticInfo = TEAMS_STATIC_DATA.find(t => t.id === currentTeam.id);
    const name = currentTeam.name_by_leader || currentTeam.name;
    
    document.getElementById('myTeamName').innerHTML = `${name} ${staticInfo.symbol}`;
    if(currentTeam.selfie_url) {
        document.getElementById('myTeamAvatar').style.backgroundImage = `url('${currentTeam.selfie_url}')`;
    }

    // Инвентарь
    const list = document.getElementById('inventoryList'); list.innerHTML = '';
    const inv = currentTeam.inventory || {};
    let hasItems = false;
    Object.keys(inv).forEach(id => {
        if(inv[id] > 0) {
            hasItems = true;
            const item = GLOBAL_ITEMS[id] || {name:'???', emoji:'📦'};
            list.innerHTML += `<li><div style="display:flex;align-items:center;gap:10px;"><span style="font-size:1.4rem">${item.emoji}</span> <span>${item.name}</span></div><span class="inv-count">x${inv[id]}</span></li>`;
        }
    });
    if(!hasItems) list.innerHTML = '<li class="muted">Пусто...</li>';

    // Задачи
    const tbody = document.getElementById('tasksTableBody');
    const progressEl = document.getElementById('taskProgress');
    tbody.innerHTML = '';
    const tasks = currentTeam.tasks || [];
    let completedCount = 0;

    if (tasks.length === 0) { tbody.innerHTML = '<tr><td colspan="3" class="muted">Нет задач</td></tr>'; return; }

    tasks.forEach(task => {
        if(task.completed) completedCount++;
        const tr = document.createElement('tr'); 
        tr.className = `task-row ${task.completed ? 'completed' : ''}`;
        
        let canCheck = (me.role === 'leader');
        let statusInfo = '';

        if(task.type === 'requirement' && !task.completed) {
            const hasItem = (inv[task.required_item_id] || 0) > 0;
            if(hasItem) { 
                tr.classList.add('ready'); 
            } else { 
                tr.classList.add('locked'); 
                canCheck = false; 
            }
        }

        const isChecked = task.completed ? 'checked disabled' : '';
        const isDisabled = !canCheck ? 'disabled' : '';
        // ВАЖНО: Мы передаем 'this' (элемент чекбокса) чтобы управлять им
        const checkbox = `<input type="checkbox" class="task-check-input" ${isChecked} ${isDisabled} onclick="toggleTask(${task.id}, this)">`;
        const reward = task.type === 'reward' && task.reward_item_id ? (GLOBAL_ITEMS[task.reward_item_id]?.emoji || '🎁') : '';

        tr.innerHTML = `<td style="text-align:center">${checkbox}</td><td>${task.text}</td><td style="text-align:center">${reward}</td>`;
        tbody.appendChild(tr);
    });
    progressEl.textContent = Math.round((completedCount/tasks.length)*100) + '%';

    renderMembers();
}

// === ЛОГИКА СДАЧИ (БЕЗ CONFIRM) ===
window.toggleTask = async (taskId, checkboxEl) => {
    // Если игра окончена
    if(hasShownGameOver) { 
        alert('Игра окончена!'); 
        checkboxEl.checked = false; 
        return; 
    }
    
    if(me.role !== 'leader') { 
        checkboxEl.checked = !checkboxEl.checked; 
        return; 
    }

    const task = currentTeam.tasks.find(t => t.id === taskId);
    const inv = { ...currentTeam.inventory };
    const isChecked = checkboxEl.checked;

    // Проверка предмета
    if(task.type === 'requirement' && isChecked) {
        if((inv[task.required_item_id] || 0) < 1) { 
            alert('У вас нет нужного предмета!'); 
            checkboxEl.checked = false; 
            renderGameInterface(); 
            return; 
        }
        // Списываем предмет сразу, без подтверждения (чтобы не зависало)
        inv[task.required_item_id]--;
    }

    if(task.type === 'reward' && isChecked) {
        const rId = task.reward_item_id;
        inv[rId] = (inv[rId] || 0) + 1;
        alert(`Получено: ${GLOBAL_ITEMS[rId]?.name}!`);
    }

    const newTasks = currentTeam.tasks.map(t => t.id === taskId ? {...t, completed: isChecked} : t);
    currentTeam.tasks = newTasks; 
    currentTeam.inventory = inv;
    
    renderGameInterface(); // Обновляем UI сразу

    // Сохраняем в БД
    await supabase.from('teams').update({ tasks: newTasks, inventory: inv }).eq('id', me.team_id);
};

async function renderMembers() {
    const list = document.getElementById('currentTeamMembersList');
    const { data: members } = await supabase.from('players').select('*').eq('team_id', me.team_id);
    list.innerHTML = '';
    document.getElementById('myTeamMembersCount').textContent = members.length;
    members.forEach(m => {
        const isMe = m.id === me.id;
        const kickBtn = (me.role === 'leader' && !isMe) ? `<button class="icon-btn" style="font-size:1rem;color:#ff5555" onclick="kickPlayer(${m.id})">×</button>` : '';
        list.innerHTML += `<li><span>${m.name} ${m.role==='leader'?'👑':''}</span> ${kickBtn}</li>`;
    });
}
window.kickPlayer = async (id) => { if(confirm('Удалить?')) { await supabase.from('players').delete().eq('id', id); refreshTeamData(); }};

// ===== ОБМЕН И СПРАВОЧНИК =====
window.openItemsGuide = () => {
    document.getElementById('itemsGuideModal').classList.remove('hidden');
    const container = document.querySelector('#itemsGuideModal .tasks-container .tasks-table tbody');
    let html = '';
    Object.values(GLOBAL_ITEMS).forEach(i => {
        html += `
        <tr class="guide-item-row">
            <td class="guide-icon">${i.emoji}</td>
            <td class="guide-info">
                <h4>${i.name}</h4>
                <p>${i.description}</p>
            </td>
        </tr>`;
    });
    container.innerHTML = html;
};
window.closeItemsGuide = () => document.getElementById('itemsGuideModal').classList.add('hidden');

window.openIncomingTrades = async () => {
    if(me.role !== 'leader') return;
    document.getElementById('incomingTradesModal').classList.remove('hidden');
    const list = document.getElementById('incomingTradesList');
    
    list.innerHTML = `
        <button class="btn-create-big" onclick="openCreateTrade()">
            <span>+</span> СОЗДАТЬ
        </button>
        <div id="tradesLoader" class="muted" style="text-align:center">Загрузка...</div>
    `;
    
    const { data: trades } = await supabase.from('trades').select('*, teams!from_team_id(name, name_by_leader)').eq('to_team_id', me.team_id).eq('status', 'pending');
    const loader = document.getElementById('tradesLoader'); if(loader) loader.remove();

    if(!trades.length) list.innerHTML += '<div class="muted" style="text-align:center; margin-top:20px;">Нет предложений</div>';
    
    trades.forEach(tr => {
        const offer = GLOBAL_ITEMS[tr.offer_item_id];
        const req = GLOBAL_ITEMS[tr.request_item_id];
        list.innerHTML += `
        <div class="trade-card">
            <div style="color:var(--accent-gold); font-weight:bold; margin-bottom:8px;">От: ${tr.teams.name_by_leader||tr.teams.name}</div>
            <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(0,0,0,0.3); padding:10px; border-radius:8px;">
                <div style="text-align:center"><div style="font-size:1.5rem">${offer?.emoji}</div><span style="color:#6eff9f; font-size:0.8rem">Дают</span></div>
                <div style="font-size:1.2rem; opacity:0.5">➔</div>
                <div style="text-align:center"><div style="font-size:1.5rem">${req?.emoji}</div><span style="color:#ff5555; font-size:0.8rem">Хотят</span></div>
            </div>
            <div class="trade-actions">
                <button class="secondary" onclick="rejectTrade(${tr.id})">Отклонить</button>
                <button class="start-button" style="width:auto; padding:8px 20px; font-size:0.9rem; margin:0;" onclick="acceptTrade(${tr.id})">Принять</button>
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
    tSelect.innerHTML = '';
    teams.forEach(t => tSelect.innerHTML += `<option value="${t.id}">${t.name_by_leader||t.name}</option>`);

    let has = false;
    Object.keys(currentTeam.inventory||{}).forEach(id => {
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
    
    await supabase.from('trades').insert({from_team_id:me.team_id, to_team_id:to, offer_item_id:off, request_item_id:req, status:'pending'});
    alert('Предложение отправлено!'); 
    closeTradeModal();
};

window.acceptTrade = async (id) => {
    const { error } = await supabase.rpc('accept_trade', { trade_id_input: id });
    if(error) alert("Ошибка обмена (возможно, предметы уже ушли)."); else { alert('Обмен совершен!'); openIncomingTrades(); }
};
window.rejectTrade = async (id) => {
    await supabase.from('trades').update({status:'rejected'}).eq('id',id); openIncomingTrades();
};

function createSnowEffect() {
    const cvs = document.getElementById('snowCanvas');
    if(!cvs) return;
    const ctx = cvs.getContext('2d');
    let W = window.innerWidth, H = window.innerHeight;
    cvs.width = W; cvs.height = H;
    const f = Array.from({length: 40}, ()=>({x:Math.random()*W,y:Math.random()*H,s:Math.random()+0.5}));
    setInterval(()=>{
        ctx.clearRect(0,0,W,H); ctx.fillStyle="rgba(255,255,255,0.5)"; ctx.beginPath();
        f.forEach(p=>{ ctx.moveTo(p.x,p.y); ctx.arc(p.x,p.y,p.s,0,Math.PI*2); p.y+=p.s/2; if(p.y>H) p.y=-5; });
        ctx.fill();
    },40);
}

initGame();