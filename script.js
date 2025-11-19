// script.js (module)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ===== CONFIG (ВАШИ КЛЮЧИ) =====
const SUPABASE_URL = 'https://akvvvudcnjnevkzxnfoi.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrdnZ2dWRjbmpuZXZrenhuZm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1NDMyNDQsImV4cCI6MjA3OTExOTI0NH0.pOA1Ebemf3IYY4ckaDQ31uDr8jMBljAzcnai_MWr2pY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== КОНСТАНТЫ КОМАНД И РОЛЕЙ =====
const TEAMS_DATA = [
    { id: 101, name: 'Снежинки', color: '#8be9fd', symbol: '❄️' },
    { id: 102, name: 'Елочные Шары', color: '#ff5555', symbol: '🔴' },
    { id: 103, name: 'Гирлянды', color: '#f1fa8c', symbol: '💡' },
    { id: 104, name: 'Деды Морозы', color: '#bd93f9', symbol: '🎅' },
];

const ROLES_DATA = {
    Explorer: 'Исследователь',
    Guardian: 'Хранитель',
    Saboteur: 'Диверсант',
    Negotiator: 'Переговорщик',
    leader: 'Лидер' 
};

let me = null; 
let selectedTeamId = null;
let selectedRole = null;
let currentTeam = null; 
let tempSelfieUrl = null; 

// ===== Helpers и Snow Effect (Оставлены без изменений) =====
function getStatusElement(){
    return document.getElementById('status') || document.getElementById('status-selection');
}
function setStatus(text, ok = true){
  const statusEl = getStatusElement();
  if(!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = ok ? '#dfe' : '#fda';
}
function showAuthMsg(text, err=false){
  const authMsg = document.getElementById('authMsg');
  if(!authMsg) return;
  authMsg.textContent = text;
  authMsg.style.color = err ? '#ffb3b3' : '#cfe8ff';
  authMsg.style.backgroundColor = err ? 'rgba(255,0,0,0.15)' : 'rgba(0,180,255,0.1)';
  setTimeout(()=> { if(authMsg.textContent === text) authMsg.textContent = ''; }, 3500);
}
function escapeHtml(s){ return s ? s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) : ''; }

async function checkLoginState(name) {
    if (!name) return null;
    const { data, error } = await supabase.from('players').select('*').ilike('name', name).limit(1);
    if (error || !data || data.length === 0) return null;
    me = data[0];
    return me;
}

function createSnowEffect() {
    const canvas = document.getElementById('snowCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;
    const maxFlakes = 100;
    const flakes = [];
    function SnowFlake() {
        this.x = Math.random() * W;
        this.y = Math.random() * H;
        this.r = Math.random() * 2 + 1; 
        this.d = Math.random() * maxFlakes;
        this.speed = Math.random() * 1 + 0.5; 
    }
    for (let i = 0; i < maxFlakes; i++) {
        flakes.push(new SnowFlake());
    }
    function draw() {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.beginPath();
        for (let i = 0; i < maxFlakes; i++) {
            const f = flakes[i];
            ctx.moveTo(f.x, f.y);
            ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2, true);
        }
        ctx.fill();
        move();
    }
    function move() {
        const angle = 0.02; 
        for (let i = 0; i < maxFlakes; i++) {
            const f = flakes[i];
            f.y += f.speed;
            f.x += Math.sin(f.d) * 0.1 + Math.cos(angle) * 0.5;
            f.d += 0.01;
            if (f.y > H) {
                flakes[i] = new SnowFlake();
                flakes[i].y = -10;
            }
            if (f.x > W) {
                f.x = 0;
            } else if (f.x < 0) {
                f.x = W;
            }
        }
    }
    window.addEventListener('resize', () => {
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = W;
        canvas.height = H;
    });

    setInterval(draw, 30);
}


// ===== ЛОГИКА ЭКРАНА ВЫБОРА (index.html) =====

function initSelectionScreen() {
    const btnStart = document.getElementById('btnStartAdventure');
    const nameInput = document.getElementById('nameInput');
    const teamGrid = document.getElementById('teamSelection');
    const roleGrid = document.getElementById('roleSelection');
    
    // Новые ссылки для модального окна
    const btnFinish = document.getElementById('modalBtnFinish');
    const selfieUpload = document.getElementById('modalSelfieUpload');

    if (!btnStart) return; 

    setStatus('Загружаю данные...');
    renderTeamCards(teamGrid);
    
    const storedName = localStorage.getItem('playerName');
    if (storedName) {
        nameInput.value = storedName;
        checkLoginState(storedName).then(player => {
            if (player && player.team_id) {
                // Если игрок уже в команде, пропускаем выбор и сразу переходим в игру
                window.location.href = 'main-screen.html'; 
                return;
            }
            // Предварительный выбор
            if (player && player.team_id && player.role) {
                selectedTeamId = player.team_id;
                selectedRole = player.role !== 'leader' ? player.role : 'Explorer'; 
                document.querySelector(`.team-card-btn[data-teamid="${selectedTeamId}"]`)?.classList.add('selected');
                document.querySelector(`.role-card[data-role="${selectedRole}"]`)?.classList.add('selected');
                showAuthMsg(`Привет, ${player.name}! Выберите команду/роль или нажмите "Начать приключение".`);
            }
            updateStartButton();
        });
    }

    // Handlers
    teamGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.team-card-btn');
        if (btn) {
            document.querySelectorAll('.team-card-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedTeamId = parseInt(btn.dataset.teamid);
            updateStartButton();
        }
    });

    roleGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.role-card');
        if (btn) {
            document.querySelectorAll('.role-card').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedRole = btn.dataset.role;
            updateStartButton();
        }
    });

    nameInput.addEventListener('input', updateStartButton);
    
    // ГЛАВНОЕ ИЗМЕНЕНИЕ: Запуск регистрации и открытие модального окна
    btnStart.addEventListener('click', startAdventureAndOpenModal); 
    
    // Обработчики модального окна
    btnFinish?.addEventListener('click', finalizeTeamSetup);
    selfieUpload?.addEventListener('change', handleSelfieUploadModal);
    window.closeModal = closeModal;
    
    setStatus('Готово к выбору команды и роли.');
}

function renderTeamCards(container) {
    container.innerHTML = TEAMS_DATA.map(t => `
        <button class="team-card-btn" data-teamid="${t.id}" style="border-left-color: ${t.color};">
            ${t.symbol} ${t.name}
        </button>
    `).join('');
}

function updateStartButton() {
    const name = document.getElementById('nameInput')?.value.trim();
    const btnStart = document.getElementById('btnStartAdventure');
    
    const isReady = name && (selectedTeamId !== null) && (selectedRole !== null);
    if(btnStart) {
      btnStart.disabled = !isReady;
      btnStart.textContent = isReady ? 'НАЧАТЬ ПРИКЛЮЧЕНИЕ' : 'СДЕЛАЙТЕ ВЫБОР';
    }
}

// *** НОВАЯ ЛОГИКА: Регистрация + Открытие модального окна ***
async function startAdventureAndOpenModal() {
    const name = document.getElementById('nameInput')?.value.trim();
    if (!name || !selectedTeamId || !selectedRole) {
        showAuthMsg('Пожалуйста, выберите команду, роль и введите имя.', true);
        return;
    }
    
    setStatus('Проверяю регистрацию и вступаю в команду...');
    const existingPlayer = await checkLoginState(name);
    let playerId = existingPlayer?.id;
    let newRole = selectedRole;
    
    // 1. Проверка на лидерство и существующие настройки команды
    const { count: memberCount } = await supabase.from('players').select('id', { count: 'exact', head: true }).eq('team_id', selectedTeamId);
    let isNewLeader = (memberCount === 0);

    if (isNewLeader) {
        newRole = 'leader';
    } else if (existingPlayer && existingPlayer.role === 'leader' && existingPlayer.team_id === selectedTeamId) {
         newRole = 'leader'; 
    }
    
    // 2. Выполняем регистрацию/вход в команду
    let dbAction = null;
    if (playerId) {
        dbAction = supabase.from('players').update({ team_id: selectedTeamId, role: newRole }).eq('id', playerId).select();
    } else {
        dbAction = supabase.from('players').insert({ name, team_id: selectedTeamId, role: newRole }).select();
    }
    const { data, error } = await dbAction;
    
    if (error || !data || data.length === 0) {
        showAuthMsg(`Ошибка входа: ` + (error?.message || 'Неизвестная ошибка'), true);
        setStatus('Ошибка приключения.', false);
        return;
    }

    me = data[0];
    localStorage.setItem('playerName', me.name);
    
    // 3. Получаем данные команды, чтобы проверить персонализацию
    const { data: teamData } = await supabase.from('teams').select('name, name_by_leader, selfie_url').eq('id', selectedTeamId).single();
    if(teamData) currentTeam = teamData;
    
    const isCustomized = currentTeam.name_by_leader || currentTeam.selfie_url;

    // 4. ГЛАВНАЯ ЛОГИКА ПРОПУСКА МОДАЛЬНОГО ОКНА
    if (!me || me.role !== 'leader' || isCustomized) {
        // Если: не лидер ИЛИ команда уже настроена -> пропускаем модальное окно и сразу в игру
        setStatus('Команда уже настроена или вы не лидер. Переход в игру...', true);
        window.location.href = 'main-screen.html';
    } else {
        // Если: вы ЛИДЕР И команда НЕ настроена -> открываем модальное окно
        setStatus('Игрок зарегистрирован. Открытие настройки команды...', true);
        openModalSetup();
    }
}

async function handleSelfieUploadModal(event) {
    if (!me) {
        alert('Ошибка: Сначала войдите в систему.');
        return;
    }
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        alert('Файл слишком большой. Максимальный размер 5MB.');
        return;
    }
    
    const teamId = me.team_id;
    const filePath = `${teamId}/selfie_${Date.now()}.png`;

    setStatus('Загружаю селфи в хранилище...');

    const { error: uploadError } = await supabase.storage.from('team_selfies').upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
    });

    if (uploadError) {
        setStatus('Ошибка загрузки селфи: ' + uploadError.message, false);
        return;
    }
    
    const { data: publicURLData } = supabase.storage.from('team_selfies').getPublicUrl(filePath);
    tempSelfieUrl = publicURLData.publicUrl;

    const selfieDisplay = document.getElementById('modalSelfieDisplay');
    if (selfieDisplay) {
        selfieDisplay.innerHTML = `
            <p style="color: #6eff9f;">✅ Селфи загружено! (Нажмите "Сохранить", чтобы увидеть его в игре)</p>
            <img src="${tempSelfieUrl}" alt="Селфи команды" style="width: 100px; height: 100px; object-fit: cover; border-radius: 50%; border: 2px solid var(--accent);">
        `;
    }
    setStatus('Селфи готово к сохранению.', true);
}


async function finalizeTeamSetup() {
    const newName = document.getElementById('modalNewTeamNameInput')?.value.trim();
    
    if (!newName) {
        alert('Пожалуйста, введите название команды.');
        return;
    }

    setStatus('Сохраняю окончательные данные команды...');
    
    const updateData = { name_by_leader: newName };
    if (tempSelfieUrl) {
        updateData.selfie_url = tempSelfieUrl;
    }
    
    if (me.role !== 'leader') {
        alert('У вас нет прав лидера, чтобы устанавливать название и селфи.');
        return;
    }

    const { error } = await supabase.from('teams').update(updateData).eq('id', me.team_id);
    
    if (error) {
        setStatus('Ошибка сохранения данных команды: ' + error.message, false);
        return;
    }
    
    setStatus('Данные команды сохранены! Начинаем игру...');
    closeModal();
    window.location.href = 'main-screen.html';
}

// === МОДАЛЬНЫЕ ФУНКЦИИ ===

function openModalSetup() {
    const teamInfo = TEAMS_DATA.find(t => t.id === me.team_id);
    const modalTitle = document.getElementById('modalTitle');
    const selfieDisplay = document.getElementById('modalSelfieDisplay');
    
    if(modalTitle) modalTitle.textContent = `Добро пожаловать в команду ${teamInfo?.name || '—'}!`;
    
    if (selfieDisplay) {
        selfieDisplay.innerHTML = '<p class="muted" style="font-size: 13px;">Сделайте селфи, чтобы персонализировать команду.</p>';
    }
    tempSelfieUrl = null; 
    document.getElementById('modalNewTeamNameInput').value = '';
    
    document.getElementById('teamModal')?.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('teamModal')?.classList.add('hidden');
    // Если лидер закрыл модальное окно без сохранения, он должен вернуться в игру
    // Но название и селфи останутся стандартными.
    window.location.href = 'main-screen.html'; 
}


// ===== ЛОГИКА ИГРОВОГО ЭКРАНА (main-screen.html) - Без изменений, кроме RLS) =====

function initGameScreen() {
    const storedName = localStorage.getItem('playerName');
    const myNameHeader = document.getElementById('myNameHeader');

    if (!myNameHeader) return; 
    if (!storedName) {
        window.location.href = 'index.html'; 
        return;
    }
    setStatus('Загружаю данные игрового окна...');
    
    checkLoginState(storedName).then(player => {
        if (!player || !player.team_id) {
            window.location.href = 'index.html'; 
            return;
        }
        
        myNameHeader.textContent = `Привет, ${player.name}`;
        
        refreshMyTeamDetails(player);
        
        // Подписка на изменения в Supabase в реальном времени
        supabase
            .channel(`team:${player.team_id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `team_id=eq.${player.team_id}` }, () => {
                refreshMyTeamDetails(player);
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams', filter: `id=eq.${player.team_id}` }, (payload) => {
                currentTeam = { ...currentTeam, ...payload.new };
                refreshMyTeamDetails(player); 
            })
            .subscribe();

        document.getElementById('btnLogout')?.addEventListener('click', logoutHandler);
        
        // Обработчики для модального окна (Если вдруг модальное окно нужно будет открыть на этом экране)
        document.getElementById('btnOpenModal')?.addEventListener('click', openModal);
        document.getElementById('modalBtnSaveTeamName')?.addEventListener('click', saveTeamName);
        document.getElementById('modalSelfieUpload')?.addEventListener('change', handleSelfieUpload);
        window.closeModal = closeModal;
        
        setStatus('Игровое окно загружено.');
    });
}

async function refreshMyTeamDetails(player) {
    if (!player || !player.team_id) return;

    const myTeamNameEl = document.getElementById('myTeamName');
    const myPlayerRoleEl = document.getElementById('myPlayerRole');
    const currentTeamMembersListEl = document.getElementById('currentTeamMembersList');
    const myTeamMembersCountEl = document.getElementById('myTeamMembersCount');
    const myTeamMaxCapacityEl = document.getElementById('myTeamMaxCapacity');
    const teamActionsButtonContainer = document.getElementById('teamActionsButtonContainer'); 

    // 1. Получаем актуальные данные команды из БД
    const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('name, max_capacity, name_by_leader, selfie_url') 
        .eq('id', player.team_id)
        .single();
    
    if (teamError || !teamData) {
        console.error('Ошибка загрузки данных команды:', teamError);
        return;
    }
    currentTeam = teamData; 
    
    // 2. Обновление заголовка
    const teamInfo = TEAMS_DATA.find(t => t.id === player.team_id);
    const displayName = teamData.name_by_leader || teamData.name;
    if(myTeamNameEl) myTeamNameEl.textContent = `${displayName} ${teamInfo?.symbol || ''}`;
    if(myPlayerRoleEl) myPlayerRoleEl.textContent = `Роль: ${ROLES_DATA[player.role] || player.role}`;
    if(myTeamMaxCapacityEl) myTeamMaxCapacityEl.textContent = teamData.max_capacity;

    // 3. Получение и отображение состава
    const { data: members, error: membersError } = await supabase.from('players')
        .select('name, role')
        .eq('team_id', player.team_id)
        .order('role', { ascending: false, nullsFirst: false }); 
        
    if (membersError || !members) {
        if(myTeamMembersCountEl) myTeamMembersCountEl.textContent = 'Ошибка';
        if(currentTeamMembersListEl) currentTeamMembersListEl.innerHTML = '<li>Ошибка загрузки состава.</li>';
        return;
    }

    if(myTeamMembersCountEl) myTeamMembersCountEl.textContent = members.length;
    if(currentTeamMembersListEl) currentTeamMembersListEl.innerHTML = '';
    members.forEach(member => {
        const li = document.createElement('li');
        li.textContent = escapeHtml(member.name);
        if(member.role === 'leader') li.classList.add('leader');
        if(member.name === player.name) li.classList.add('me');
        if(currentTeamMembersListEl) currentTeamMembersListEl.appendChild(li);
    });

    // 4. Логика отображения кнопки модального окна (Если лидер и команда полна)
    const isTeamFull = members.length === teamData.max_capacity;
    const isLeader = player.role === 'leader';
    
    if (teamActionsButtonContainer) {
      if (isTeamFull && isLeader) { 
          teamActionsButtonContainer.classList.remove('hidden');
      } else {
          teamActionsButtonContainer.classList.add('hidden');
      }
    }
}

function logoutHandler(){
  localStorage.removeItem('playerName');
  me = null;
  window.location.href = 'index.html';
}

// ===== INIT (Запускаем снег и логику) =====

(function init(){
    createSnowEffect(); 

    const currentPath = window.location.pathname;
    
    if (currentPath.includes('main-screen.html')) {
        initGameScreen();
    } else {
        initSelectionScreen();
    }
})();