import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ===== CONFIG =====
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

let selectedTeamId = null;
let selectedRole = null;
let tempSelfieUrl = null;
let me = null;

// ===== INIT =====
function initSelectionScreen() {
    const btnStart = document.getElementById('btnStartAdventure');
    const nameInput = document.getElementById('nameInput');
    
    if (!btnStart) return;

    renderTeamCards();
    createSnowEffect();
    
    // Проверка сохраненного имени
    const storedName = localStorage.getItem('playerName');
    if (storedName) { nameInput.value = storedName; updateStartButton(); }

    // Слушатели
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

function setStatus(text, ok=true) {
    const el = document.getElementById('status-selection');
    if(el) { el.textContent = text; el.style.color = ok ? '#6eff9f' : '#ff5555'; }
}

// ===== ЛОГИКА ВХОДА =====
async function handleStartAdventure() {
    const name = document.getElementById('nameInput').value.trim();
    if (!name || !selectedTeamId || !selectedRole) return setStatus('Заполните все поля!', false);
    setStatus('Подключение...');

    // 1. Проверяем Лидера
    const { count: leaderCount } = await supabase.from('players')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', selectedTeamId)
        .eq('role', 'leader')
        .neq('name', name);

    let finalRole = selectedRole;
    if (leaderCount === 0) finalRole = 'leader';
    else if (selectedRole === 'leader' && leaderCount > 0) { 
        alert('Лидер в этой команде уже есть! Вы будете Исследователем.'); 
        finalRole = 'Explorer'; 
    }

    // 2. Регистрируем/Обновляем
    let { data: player } = await supabase.from('players').select('*').ilike('name', name).single();
    
    if (!player) {
        const { data: newPlayer, error } = await supabase.from('players')
            .insert({ name, team_id: selectedTeamId, role: finalRole })
            .select().single();
        
        if (error) return setStatus('Ошибка регистрации', false);
        player = newPlayer;
    } else {
        if (player.role === 'leader' && player.team_id === selectedTeamId) finalRole = 'leader';
        await supabase.from('players').update({ team_id: selectedTeamId, role: finalRole }).eq('id', player.id);
        player.team_id = selectedTeamId;
        player.role = finalRole;
    }

    localStorage.setItem('playerName', player.name);
    me = player;
    
    const { data: team } = await supabase.from('teams').select('*').eq('id', selectedTeamId).single();
    
    if (me.role === 'leader' && !team.name_by_leader) {
        openModalSetup();
    } else {
        window.location.href = 'main-screen.html';
    }
}

function openModalSetup() {
    document.getElementById('teamModal').classList.remove('hidden');
    const staticInfo = TEAMS_STATIC_DATA.find(t => t.id === selectedTeamId);
    document.getElementById('modalTitle').textContent = `Настройка: ${staticInfo.defaultName}`;
}

async function uploadSelfie(e) {
    const file = e.target.files[0]; if (!file) return;
    setStatus('Загрузка фото...');
    const path = `${me.team_id}/selfie_${Date.now()}.png`;
    
    const { error } = await supabase.storage.from(BUCKET_NAME).upload(path, file);
    if(error) return setStatus('Ошибка фото', false);
    
    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
    tempSelfieUrl = data.publicUrl;
    document.getElementById('modalSelfieDisplay').innerHTML = `<img src="${tempSelfieUrl}" style="width:80px;height:80px;border-radius:50%;border:2px solid #fff;">`;
    setStatus('Фото загружено', true);
}

async function finalizeTeamSetup() {
    const newName = document.getElementById('modalNewTeamNameInput').value.trim();
    if(!newName) return alert('Введите название команды!');
    
    await supabase.from('teams').update({ 
        name_by_leader: newName, 
        selfie_url: tempSelfieUrl 
    }).eq('id', me.team_id);
    
    window.location.href = 'main-screen.html';
}

function createSnowEffect() {
    const cvs = document.getElementById('snowCanvas');
    if(!cvs) return;
    const ctx = cvs.getContext('2d');
    let W = window.innerWidth, H = window.innerHeight;
    const resize = () => { W=window.innerWidth; H=window.innerHeight; cvs.width=W; cvs.height=H; };
    window.addEventListener('resize', resize); resize();
    const f = Array.from({length: 50}, ()=>({x:Math.random()*W,y:Math.random()*H,s:Math.random()+0.5}));
    setInterval(()=>{
        ctx.clearRect(0,0,W,H); ctx.fillStyle="rgba(255,255,255,0.6)"; ctx.beginPath();
        f.forEach(p=>{ ctx.moveTo(p.x,p.y); ctx.arc(p.x,p.y,2,0,Math.PI*2); p.y+=p.s; if(p.y>H) p.y=-5; });
        ctx.fill();
    },30);
}

// Запуск
initSelectionScreen();