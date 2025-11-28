import * as Core from './core.js';

// ==========================================
// ===== ГЛОБАЛЬНОЕ СОСТОЯНИЕ =====
// ==========================================
let gameState = {
    activeGame: null, // 'tictactoe' или 'bingo'
    board: [],
    isPlayerTurn: true,
    gameActive: false,
    opponentId: null,
    
    // Состояние Бинго
    bingoGrid: [], // { answer, marked }
    bingoQuestionsDeck: [], // Очередь вопросов
    currentQuestion: null,
    bingoTimerInterval: null,
    timeLeft: 10
};

// ==========================================
// ===== ДАННЫЕ ДЛЯ БИНГО (15 вопросов) =====
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

// Дополнительные эмодзи-обманки для заполнения поля до 25 клеток
const BINGO_FILLERS = ["🤡", "🎃", "👻", "👽", "🤖", "🌵", "🍕", "🚗", "✈️", "🚀"];

// ==========================================
// ===== 1. ВЫЗОВ И ПОДГОТОВКА =====
// ==========================================

export const openGameChallengeModal = (gameType) => {
    gameState.activeGame = gameType;
    const modal = document.getElementById('gameChallengeModal');
    const title = gameType === 'tictactoe' ? '⚔️ КРЕСТИКИ-НОЛИКИ' : '🎄 НОВОГОДНЕЕ БИНГО';
    
    // Сброс UI
    document.getElementById('gameChallengeStep1').classList.remove('hidden');
    document.getElementById('gameBoardArea').classList.add('hidden');
    document.getElementById('gameBoardContainer').innerHTML = '';
    
    const statusText = document.getElementById('gameStatusText');
    if(statusText) statusText.textContent = 'Подготовка...';
    
    const select = document.getElementById('gameTargetTeam');
    select.innerHTML = '<option value="">-- Выберите соперника --</option>';
    
    Core.state.otherTeams.forEach(t => {
        const isFrozen = t.frozen_until && new Date(t.frozen_until) > new Date();
        if (!isFrozen) { 
             select.innerHTML += `<option value="${t.id}">${t.name_by_leader || t.name}</option>`;
        }
    });

    document.getElementById('gameChallengeTitle').textContent = title;
    modal.classList.remove('hidden');
};

export const startChallenge = async () => {
    const targetId = document.getElementById('gameTargetTeam').value;
    if (!targetId) return alert("Выберите команду для атаки!");
    
    gameState.opponentId = targetId;
    
    const btn = document.getElementById('btnSendChallenge');
    const originalText = btn.textContent;
    btn.textContent = "📡 ПОДКЛЮЧЕНИЕ...";
    btn.disabled = true;

    await new Promise(r => setTimeout(r, 1000));

    btn.textContent = "✅ ГОТОВО!";
    await new Promise(r => setTimeout(r, 500));

    document.getElementById('gameChallengeStep1').classList.add('hidden');
    document.getElementById('gameBoardArea').classList.remove('hidden');
    btn.textContent = originalText;
    btn.disabled = false;

    if (gameState.activeGame === 'tictactoe') initTicTacToe();
    else initBingo();
};

// ==========================================
// ===== 2. ЛОГИКА КРЕСТИКОВ-НОЛИКОВ =====
// ==========================================

function initTicTacToe() {
    gameState.board = Array(9).fill(null);
    gameState.gameActive = true;
    gameState.isPlayerTurn = true; 
    renderTicTacToeBoard();
    updateGameStatus("Ваш ход! (Вы играете за ❌)");
}

function renderTicTacToeBoard() {
    const container = document.getElementById('gameBoardContainer');
    container.className = 'ttt-grid'; 
    // Принудительные стили для сетки
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(3, 1fr)'; 
    container.style.gap = '5px';
    container.style.maxWidth = '300px';
    container.style.margin = '0 auto';
    
    container.innerHTML = gameState.board.map((cell, i) => `
        <div class="ttt-cell ${cell ? 'taken' : ''}" 
             id="cell-${i}" 
             onclick="window.handleGameMove(${i})"
             style="aspect-ratio: 1; background: rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; font-size: 2rem; cursor: pointer; border: 1px solid #444;">
            ${cell || ''}
        </div>
    `).join('');
}

export const handleGameMove = (index) => {
    if (gameState.activeGame !== 'tictactoe' || !gameState.gameActive || gameState.board[index] || !gameState.isPlayerTurn) return;

    gameState.board[index] = '❌';
    renderTicTacToeBoard();
    
    const winCombo = checkWinner('❌');
    if (winCombo) {
        highlightWin(winCombo);
        return endGame(true);
    }
    
    if (!gameState.board.includes(null)) return endGame(false); 

    gameState.isPlayerTurn = false;
    updateGameStatus("Ход соперника...");
    setTimeout(botMakeMoveTTT, 1000);
};

function botMakeMoveTTT() {
    if (!gameState.gameActive) return;

    const emptyIndices = gameState.board.map((v, i) => v === null ? i : null).filter(v => v !== null);
    if (emptyIndices.length > 0) {
        const randomIdx = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
        gameState.board[randomIdx] = '⭕';
        renderTicTacToeBoard();
        
        const winCombo = checkWinner('⭕');
        if (winCombo) {
            highlightWin(winCombo);
            return endGame(false);
        }
        
        if (!gameState.board.includes(null)) return endGame(false);
    }
    gameState.isPlayerTurn = true;
    updateGameStatus("Ваш ход!");
}

function checkWinner(symbol) {
    const wins = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]];
    return wins.find(combo => combo.every(i => gameState.board[i] === symbol));
}

function highlightWin(combo) {
    combo.forEach(i => document.getElementById(`cell-${i}`).style.backgroundColor = 'rgba(0, 255, 0, 0.3)');
}

// ==========================================
// ===== 3. ЛОГИКА БИНГО (5x5 + ЭМОДЗИ) =====
// ==========================================

function initBingo() {
    // 1. Формируем пул: 15 правильных + 10 обманок = 25
    // ВАЖНО: Приводим все объекты к единому ключу 'answer'
    const fillers = BINGO_FILLERS.map(emoji => ({ answer: emoji, marked: false }));
    const correct = BINGO_QUESTIONS.map(item => ({ answer: item.a, marked: false }));
    
    const fullGrid = [...correct, ...fillers].sort(() => Math.random() - 0.5);
    
    gameState.bingoGrid = fullGrid;

    // 2. Колода вопросов
    gameState.bingoQuestionsDeck = [...BINGO_QUESTIONS].sort(() => Math.random() - 0.5);
    gameState.currentQuestion = null;
    gameState.gameActive = true;

    // 3. Рендер поля
    renderBingoBoard();
    
    // 4. Старт цикла вопросов
    startBingoQuestionCycle();
}

function renderBingoBoard() {
    const container = document.getElementById('gameBoardContainer');
    
    // === СТИЛИ СЕТКИ (Fix растягивания) ===
    container.className = 'bingo-grid';
    container.style.display = 'grid';           
    container.style.gridTemplateColumns = 'repeat(5, 1fr)';
    container.style.gap = '8px';                
    container.style.width = '100%';             
    container.style.maxWidth = '400px';         
    container.style.margin = '0 auto';          

    // === ШАПКА ВОПРОСА ===
    const boardArea = document.getElementById('gameBoardArea');
    let qDiv = document.getElementById('bingoQuestionHeader');
    
    if (!qDiv) {
        qDiv = document.createElement('div');
        qDiv.id = 'bingoQuestionHeader';
        boardArea.insertBefore(qDiv, container);
    }

    if (gameState.currentQuestion) {
        qDiv.innerHTML = `
            <div style="background: rgba(0,0,0,0.6); border: 2px solid #FFD700; padding: 15px; border-radius: 12px; margin-bottom: 20px; text-align: center; box-shadow: 0 0 15px rgba(255,215,0,0.3);">
                <p style="font-size: 1.1rem; color: #fff; margin-bottom: 10px; font-weight:bold;">${gameState.currentQuestion.q}</p>
                <div style="height: 8px; background: #333; border-radius: 4px; overflow: hidden;">
                    <div id="bingoTimerBar" style="width: 100%; height: 100%; background: linear-gradient(90deg, #FFD700, #FF4500); transition: width 1s linear;"></div>
                </div>
                <p style="font-size: 0.8rem; color: #aaa; margin-top: 5px;">Смена через: <span id="bingoTimeText">${gameState.timeLeft}</span> сек</p>
            </div>
        `;
    }

    // === РЕНДЕР ЯЧЕЕК (Fix undefined) ===
    const gridHtml = gameState.bingoGrid.map((cell, i) => {
        // Определяем стили в зависимости от того, нажата клетка или нет
        const bgStyle = cell.marked ? 'rgba(46, 204, 113, 0.3)' : 'rgba(255,255,255,0.05)';
        const borderStyle = cell.marked ? '1px solid #2ecc71' : '1px solid rgba(255,255,255,0.15)';
        
        return `<div class="bingo-cell" 
                     style="font-size: 2rem; aspect-ratio: 1; display:flex; align-items:center; justify-content:center; text-align:center; 
                            border: ${borderStyle}; background: ${bgStyle}; border-radius: 8px; cursor: pointer; user-select: none; transition: all 0.2s;" 
                     id="bingo-cell-${i}"
                     onclick="window.handleBingoClick(${i})">
            ${cell.answer}
        </div>`;
    }).join('');

    // Скрываем обычный статус текст, так как есть красивая плашка
    const statusText = document.getElementById('gameStatusText');
    if (statusText) statusText.style.display = 'none'; 
    
    container.innerHTML = gridHtml;
}

function startBingoQuestionCycle() {
    nextQuestion();

    if (gameState.bingoTimerInterval) clearInterval(gameState.bingoTimerInterval);
    
    gameState.bingoTimerInterval = setInterval(() => {
        gameState.timeLeft--;
        
        const bar = document.getElementById('bingoTimerBar');
        const text = document.getElementById('bingoTimeText');
        if (bar) bar.style.width = `${(gameState.timeLeft / 20) * 100}%`;
        if (text) text.textContent = gameState.timeLeft;

        if (gameState.timeLeft <= 0) {
            nextQuestion(); 
        }
    }, 1000);
}

function nextQuestion() {
    if (!gameState.gameActive) return;
    
    if (gameState.bingoQuestionsDeck.length === 0) {
        gameState.bingoQuestionsDeck = [...BINGO_QUESTIONS].sort(() => Math.random() - 0.5);
    }

    gameState.currentQuestion = gameState.bingoQuestionsDeck.pop();
    gameState.timeLeft = 20; 
    
    renderBingoBoard();
}

export const handleBingoClick = (index) => {
    if (gameState.activeGame !== 'bingo' || !gameState.gameActive) return;

    const cell = gameState.bingoGrid[index];
    if (cell.marked) return; 
    
    if (!gameState.currentQuestion) return;

    // Сверка: cell.answer против текущего вопроса .a
    if (cell.answer === gameState.currentQuestion.a) {
        cell.marked = true;
        
        // Визуальное обновление (перерисовка или прямой стиль)
        const div = document.getElementById(`bingo-cell-${index}`);
        if(div) {
            div.style.background = 'rgba(46, 204, 113, 0.3)';
            div.style.border = '1px solid #2ecc71';
        }
        
        if (checkBingoWin5x5()) {
            clearInterval(gameState.bingoTimerInterval);
            return endGame(true);
        }
    } else {
        // Ошибка - красный цвет
        const div = document.getElementById(`bingo-cell-${index}`);
        if(div) {
            div.style.background = 'rgba(217, 0, 38, 0.6)'; 
            setTimeout(() => { 
                if(!cell.marked) div.style.background = 'rgba(255,255,255,0.05)'; 
            }, 400);
        }
    }
};

function checkBingoWin5x5() {
    const size = 5;
    const grid = gameState.bingoGrid;
    const checkLine = (indices) => indices.every(i => grid[i].marked);

    // Строки
    for(let r=0; r<size; r++) {
        let indices = [];
        for(let c=0; c<size; c++) indices.push(r*size + c);
        if(checkLine(indices)) return true;
    }
    // Колонки
    for(let c=0; c<size; c++) {
        let indices = [];
        for(let r=0; r<size; r++) indices.push(r*size + c);
        if(checkLine(indices)) return true;
    }
    // Диагонали
    let d1 = [], d2 = [];
    for(let i=0; i<size; i++) {
        d1.push(i*size + i);
        d2.push(i*size + (size-1-i));
    }
    if(checkLine(d1) || checkLine(d2)) return true;

    return false;
}

// ==========================================
// ===== 4. ФИНАЛ И РЕЗУЛЬТАТЫ =====
// ==========================================

function updateGameStatus(msg) {
    const el = document.getElementById('gameStatusText');
    if(el) {
        el.style.display = 'block';
        el.textContent = msg;
    }
}

async function endGame(isVictory) {
    gameState.gameActive = false;
    if (gameState.bingoTimerInterval) clearInterval(gameState.bingoTimerInterval);
    
    await new Promise(r => setTimeout(r, 500));
    window.closeModal('gameChallengeModal');

    if (isVictory) {
        const teamId = Core.state.me.team_id;
        // Логика завершения финального задания
        const finalTaskId = (teamId === 101 || teamId === 103) ? 6 : 15;
        const currentTasks = Core.state.currentTeam.tasks;
        const taskIndex = currentTasks.findIndex(t => t.id === finalTaskId);
        
        if (taskIndex !== -1 && !currentTasks[taskIndex].completed) {
            const newTasks = [...currentTasks];
            newTasks[taskIndex].completed = true;
            const updateRes = await Core.updateTaskAndInventory(teamId, newTasks, Core.state.currentTeam.inventory);
            if (!updateRes.success) {
                alert("Ошибка сохранения! Сообщите организаторам.");
                return;
            }
            Core.state.currentTeam.tasks = newTasks;
        }

        const mainIds = (teamId === 101 || teamId === 103) ? [1, 2, 3, 4, 5] : [10, 11, 12, 13, 14];
        const allMainDone = mainIds.every(id => {
            const t = Core.state.currentTeam.tasks.find(x => x.id === id);
            return t && t.completed;
        });

        await Core.refreshTeamData();
        if (window.renderGameInterface) window.renderGameInterface();

        if (allMainDone) {
            if(window.showVictoryModal) window.showVictoryModal("🎉 ПОБЕДА!");
            else alert("🎉 ПОБЕДА! Все задания выполнены!");
        } else {
            alert("🏆 БИНГО! Финальное задание выполнено. Завершите остальные миссии!");
        }

    } else {
        const freezeTime = 2 * 60 * 1000;
        await Core.updateTeamFreezeStatus(Core.state.me.team_id, freezeTime);
        if(window.handleQuizFailure) window.handleQuizFailure(Core.state.me.team_id);
        setTimeout(() => alert("❄️ ПОРАЖЕНИЕ! Заморозка на 2 минуты."), 500);
    }
}