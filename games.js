import * as Core from './core.js';

// ==========================================
// ===== ГЛОБАЛЬНОЕ СОСТОЯНИЕ (PvP) =====
// ==========================================
let gameState = {
    activeGameId: null,      // ID игры в БД
    activeGameType: null,    // 'tictactoe' или 'bingo'
    myRole: null,            // 'X' (создатель) или 'O' (соперник)
    isMyTurn: false,         // Чей сейчас ход (для ТТТ)
    isHost: false,           // Являемся ли мы создателем игры
    
    // Данные игры
    board: [],               // Массив доски (ТТТ) или Объект состояния (Бинго)
    opponentId: null,
    
    // Для Бинго (локальный таймер хоста)
    bingoHostTimer: null
};

// ==========================================
// ===== ДАННЫЕ ДЛЯ БИНГО =====
// ==========================================
const BINGO_QUESTIONS = [
    { a: "🎅", q: "Кто приносит подарки послушным детям?" },
    { a: "🎄", q: "Зеленая красавица, которую наряжают раз в году?" },
    { a: "☃️", q: "Кого лепят из снега, вставляя морковку вместо носа?" },
    { a: "❄️", q: "Уникальный ледяной кристаллик, падающий с неба?" },
    { a: "🎁", q: "Что принято класть под елку?" },
    { a: "🎆", q: "Громкие и яркие огни в небе в новогоднюю ночь?" },
    { a: "🍊", q: "Главный новогодний цитрус (фрукт)?" },
    { a: "🥂", q: "Напиток, который открывают под бой курантов?" },
    { a: "🕰️", q: "Что бьет 12 раз, возвещая начало Нового года?" },
    { a: "🕯️", q: "Что зажигают для уюта и тепла на праздник?" },
    { a: "🛷", q: "Транспорт Деда Мороза?" },
    { a: "🌨️", q: "Сильный снегопад с ветром?" },
    { a: "🧤", q: "Что надевают на руки, чтобы играть в снежки?" },
    { a: "⛸️", q: "На чем катаются по льду?" },
    { a: "🔔", q: "Звук рождественских колокольчиков?" }
];

const BINGO_FILLERS = ["🤡", "🎃", "👻", "👽", "🤖", "🌵", "🍕", "🚗", "✈️", "🚀"];

// ==========================================
// ===== 1. ВЫЗОВ И UI =====
// ==========================================

export const openGameChallengeModal = (gameType) => {
    gameState.activeGameType = gameType;
    const modal = document.getElementById('gameChallengeModal');
    const title = gameType === 'tictactoe' ? '⚔️ КРЕСТИКИ-НОЛИКИ' : '🎄 НОВОГОДНЕЕ БИНГО';
    
    // Сброс UI для выбора соперника
    document.getElementById('gameChallengeStep1').classList.remove('hidden');
    document.getElementById('gameBoardArea').classList.add('hidden');
    document.getElementById('gameBoardContainer').innerHTML = '';
    
    // Скрываем статус
    const statusText = document.getElementById('gameStatusText');
    if(statusText) statusText.style.display = 'none';
    
    // Заполняем список жертв
    const select = document.getElementById('gameTargetTeam');
    select.innerHTML = '<option value="">-- Выберите соперника --</option>';
    
    Core.state.otherTeams.forEach(t => {
        const isFrozen = t.frozen_until && new Date(t.frozen_until) > new Date();
        if (!isFrozen) { 
             select.innerHTML += `<option value="${t.id}">${t.name_by_leader || t.name}</option>`;
        }
    });

    document.getElementById('gameChallengeTitle').textContent = title;
    
    // Возвращаем кнопку закрытия (на этапе выбора она нужна)
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) closeBtn.style.display = 'block';

    modal.classList.remove('hidden');
};

// --- Кнопка "БРОСИТЬ ВЫЗОВ" ---
export const startChallenge = async () => {
    const targetId = document.getElementById('gameTargetTeam').value;
    if (!targetId) return alert("Выберите команду для атаки!");
    
    const btn = document.getElementById('btnSendChallenge');
    const originalText = btn.textContent;
    btn.textContent = "📡 ОТПРАВКА...";
    btn.disabled = true;

    // Инициализация начального состояния доски
    let initialBoardState = null;
    
    if (gameState.activeGameType === 'tictactoe') {
        initialBoardState = Array(9).fill(null);
    } else {
        // Для Бинго генерируем поле сразу
        initialBoardState = generateInitialBingoState();
    }

    // Создаем игру в БД
    const res = await Core.createPvPGame(targetId, gameState.activeGameType);

    if (res.success) {
        btn.textContent = "✅ ВЫЗОВ ОТПРАВЛЕН!";
        // Если это Бинго, нужно сразу залить правильное поле в БД
        if (gameState.activeGameType === 'bingo') {
            await Core.makeGameMove(res.game.id, initialBoardState, Core.state.me.team_id);
        }
    } else {
        alert("Ошибка: " + res.msg);
        btn.textContent = originalText;
        btn.disabled = false;
    }
};

// ==========================================
// ===== 2. СИНХРОНИЗАЦИЯ (REALTIME) =====
// ==========================================

// Эта функция вызывается из game.js при обновлении таблицы active_games
export const syncGameFromDB = (game) => {
    const myTeamId = Core.state.me.team_id;
    
    gameState.activeGameId = game.id;
    gameState.activeGameType = game.game_type;
    gameState.isHost = (game.team_a_id === myTeamId);
    gameState.opponentId = gameState.isHost ? game.team_b_id : game.team_a_id;
    
    // Роли
    if (gameState.isHost) gameState.myRole = '❌'; // Создатель (или Хост Бинго)
    else gameState.myRole = '⭕';

    // Чей ход (для ТТТ)
    gameState.isMyTurn = (game.current_turn_team_id === myTeamId);
    
    // Сохраняем состояние доски
    gameState.board = game.board_state;

    // === UI ===
    const modal = document.getElementById('gameChallengeModal');
    modal.classList.remove('hidden');
    document.getElementById('gameChallengeStep1').classList.add('hidden');
    document.getElementById('gameBoardArea').classList.remove('hidden');
    document.getElementById('gameChallengeTitle').textContent = 
        game.game_type === 'tictactoe' ? '⚔️ БИТВА: КРЕСТИКИ-НОЛИКИ' : '🎄 БИТВА: БИНГО';

    // СКРЫВАЕМ кнопку закрытия, пока игра идет
    const closeBtn = modal.querySelector('.modal-close');
    if (game.status === 'active') {
        if (closeBtn) closeBtn.style.display = 'none';
    } else {
        if (closeBtn) closeBtn.style.display = 'block';
    }

    // === СТАТУС ИГРЫ ===
    const statusText = document.getElementById('gameStatusText');
    statusText.style.display = 'block';

    if (game.status === 'finished') {
        if (game.winner_team_id === myTeamId) {
            statusText.innerHTML = "<span style='color:#00ff00; font-size:1.5rem'>🏆 ПОБЕДА!</span>";
            handleVictory();
        } else if (game.winner_team_id) {
            statusText.innerHTML = "<span style='color:red; font-size:1.5rem'>💀 ПОРАЖЕНИЕ</span>";
            handleDefeat();
        } else {
            statusText.innerHTML = "🤝 НИЧЬЯ";
            handleDraw();
        }
        stopBingoHost(); 
    } else {
        // Игра идет
        if (game.game_type === 'tictactoe') {
            statusText.textContent = gameState.isMyTurn ? `ВАШ ХОД! (${gameState.myRole})` : `ХОД СОПЕРНИКА...`;
            statusText.style.color = gameState.isMyTurn ? '#00ff00' : '#ffff00';
            renderTicTacToeBoard(game.board_state);
        } else {
            // Бинго
            statusText.style.display = 'none'; // У Бинго свой хедер
            handleBingoSync(game.board_state);
        }
    }
};

// ==========================================
// ===== 3. КРЕСТИКИ-НОЛИКИ (PVP) =====
// ==========================================

function renderTicTacToeBoard(boardData) {
    if (!Array.isArray(boardData)) return; 
    const container = document.getElementById('gameBoardContainer');
    container.className = 'ttt-grid'; 
    container.innerHTML = boardData.map((cell, i) => `
        <div class="ttt-cell ${cell ? 'taken' : ''}" 
             onclick="window.handleGameMove(${i})"
             style="background: ${cell ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.2)'}; border-color: ${cell === gameState.myRole ? '#00ff00' : '#fff'};">
            ${cell || ''}
        </div>
    `).join('');
}

export const handleGameMove = async (index) => {
    // Проверки
    if (gameState.activeGameType !== 'tictactoe') return;
    if (!gameState.isMyTurn || gameState.board[index] !== null) return;
    
    // Оптимистичное обновление
    const newBoard = [...gameState.board];
    newBoard[index] = gameState.myRole;
    gameState.isMyTurn = false; 
    document.getElementById('gameStatusText').textContent = "Отправка...";
    
    // Проверка победы (локально)
    const winner = checkWinnerTTT(newBoard, gameState.myRole);
    
    if (winner) {
        // Мы выиграли
        await Core.makeGameMove(gameState.activeGameId, newBoard, null);
        await Core.finishGame(gameState.activeGameId, Core.state.me.team_id);
    } else if (!newBoard.includes(null)) {
        // Ничья
        await Core.makeGameMove(gameState.activeGameId, newBoard, null);
        await Core.finishGame(gameState.activeGameId, null);
    } else {
        // Передача хода
        await Core.makeGameMove(gameState.activeGameId, newBoard, gameState.opponentId);
    }
};

function checkWinnerTTT(board, symbol) {
    const wins = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]];
    return wins.some(combo => combo.every(i => board[i] === symbol));
}

// ==========================================
// ===== 4. БИНГО (PVP SHARED STATE) =====
// ==========================================

function generateInitialBingoState() {
    const fillers = BINGO_FILLERS.map(emoji => ({ answer: emoji, marked: false }));
    const correct = BINGO_QUESTIONS.map(item => ({ answer: item.a, marked: false }));
    const fullGrid = [...correct, ...fillers].sort(() => Math.random() - 0.5);
    
    const deck = [...BINGO_QUESTIONS].sort(() => Math.random() - 0.5);
    const firstQ = deck.pop();

    return {
        grid: fullGrid,
        deck: deck,
        currentQ: firstQ,
        timeLeft: 5, // FIX: Time reduced to 5 seconds
        lastUpdate: Date.now()
    };
}

function handleBingoSync(stateData) {
    if (!stateData || !stateData.grid) return; 

    if (gameState.isHost && !gameState.bingoHostTimer) {
        startBingoHostLoop();
    }

    renderBingoBoard(stateData);
}

function startBingoHostLoop() {
    if (gameState.bingoHostTimer) clearInterval(gameState.bingoHostTimer);
    
    gameState.bingoHostTimer = setInterval(async () => {
        const currentState = gameState.board;
        if (!currentState || !currentState.currentQ) return;

        let newTime = currentState.timeLeft - 1;
        let newDeck = currentState.deck;
        let newQ = currentState.currentQ;

        if (newTime <= 0) {
            // Смена вопроса
            if (newDeck.length === 0) {
                newDeck = [...BINGO_QUESTIONS].sort(() => Math.random() - 0.5);
            }
            newQ = newDeck.pop();
            newTime = 10; // FIX: Reset to 10 seconds
        }

        const newState = {
            ...currentState,
            timeLeft: newTime,
            deck: newDeck,
            currentQ: newQ,
            lastUpdate: Date.now()
        };

        await Core.makeGameMove(gameState.activeGameId, newState, Core.state.me.team_id);

    }, 1000);
}

function stopBingoHost() {
    if (gameState.bingoHostTimer) {
        clearInterval(gameState.bingoHostTimer);
        gameState.bingoHostTimer = null;
    }
}

function renderBingoBoard(stateData) {
    const container = document.getElementById('gameBoardContainer');
    const area = document.getElementById('gameBoardArea');
    
    let qDiv = document.getElementById('bingoQuestionHeader');
    if (!qDiv) {
        qDiv = document.createElement('div');
        qDiv.id = 'bingoQuestionHeader';
        area.insertBefore(qDiv, container);
    }
    
    // FIX: Progress bar calculation based on 10s
    qDiv.innerHTML = `
        <div style="background: rgba(0,0,0,0.6); border: 2px solid #FFD700; padding: 10px; border-radius: 12px; margin-bottom: 10px; text-align: center;">
            <p style="font-size: 1rem; color: #fff; margin:0 0 5px 0;">${stateData.currentQ.q}</p>
            <div style="height: 6px; background: #333; border-radius: 3px;">
                <div style="width: ${(stateData.timeLeft / 10) * 100}%; height: 100%; background: #FFD700; transition: width 0.5s linear;"></div>
            </div>
        </div>
    `;

    container.className = 'bingo-grid';
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(5, 1fr)';
    container.style.gap = '5px';
    
    container.innerHTML = stateData.grid.map((cell, i) => {
        const bg = cell.marked ? 'rgba(46, 204, 113, 0.5)' : 'rgba(255,255,255,0.05)';
        return `
            <div onclick="window.handleBingoClick(${i})" 
                 style="font-size:1.8rem; aspect-ratio:1; display:flex; align-items:center; justify-content:center; 
                        background:${bg}; border:1px solid #555; border-radius:6px; cursor:pointer;">
                ${cell.answer}
            </div>
        `;
    }).join('');
}

export const handleBingoClick = async (index) => {
    if (gameState.activeGameType !== 'bingo') return;
    
    const currentState = gameState.board;
    const cell = currentState.grid[index];
    
    if (cell.marked) return; 
    
    if (cell.answer === currentState.currentQ.a) {
        const newGrid = [...currentState.grid];
        newGrid[index] = { ...cell, marked: true };
        
        const newState = { ...currentState, grid: newGrid };
        
        await Core.makeGameMove(gameState.activeGameId, newState, Core.state.me.team_id);
        
        if (checkBingoWin(newGrid)) {
            stopBingoHost();
            await Core.finishGame(gameState.activeGameId, Core.state.me.team_id);
        }
    } else {
        const el = document.querySelectorAll('.bingo-grid > div')[index];
        if (el) el.style.background = 'red';
        setTimeout(() => { if(el) el.style.background = 'rgba(255,255,255,0.05)'; }, 300);
    }
};

function checkBingoWin(grid) {
    const size = 5;
    const check = (idxs) => idxs.every(i => grid[i].marked);
    
    for(let i=0; i<size; i++) {
        if (check([...Array(size)].map((_,j) => i*size+j))) return true;
        if (check([...Array(size)].map((_,j) => j*size+i))) return true;
    }
    if (check([...Array(size)].map((_,i) => i*size+i))) return true;
    if (check([...Array(size)].map((_,i) => i*size+(size-1-i)))) return true;
    
    return false;
}

// ==========================================
// ===== 5. ЗАВЕРШЕНИЕ =====
// ==========================================

async function handleVictory() {
    const teamId = Core.state.me.team_id;
    const finalTaskId = (teamId === 101 || teamId === 103) ? 6 : 15;
    const tasks = Core.state.currentTeam.tasks;
    const task = tasks.find(t => t.id === finalTaskId);
    
    if (task && !task.completed) {
        const newTasks = tasks.map(t => t.id === finalTaskId ? {...t, completed:true} : t);
        await Core.updateTaskAndInventory(teamId, newTasks, Core.state.currentTeam.inventory);
        alert("⚔️ ПОБЕДА В БИТВЕ! ФИНАЛ ПРОЙДЕН!");
        if (window.showVictoryModal) window.showVictoryModal();
    } else {
        alert("⚔️ ПОБЕДА! Но задание уже было выполнено.");
    }
}

async function handleDefeat() {
    alert("💀 ВЫ ПРОИГРАЛИ БИТВУ! ЗАМОРОЗКА НА 2 МИНУТЫ.");
    await Core.updateTeamFreezeStatus(Core.state.me.team_id, 2 * 60 * 1000);
}

function handleDraw() {
    alert("НИЧЬЯ! Попробуйте еще раз.");
    window.closeModal('gameChallengeModal');
}

Object.assign(window, {
    handleGameMove,
    handleBingoClick,
    syncGameFromDB
});