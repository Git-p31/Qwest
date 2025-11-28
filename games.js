import * as Core from './core.js';

// Глобальное состояние мини-игр
let gameState = {
    activeGame: null, // 'tictactoe' или 'bingo'
    board: [],
    isPlayerTurn: true,
    gameActive: false,
    opponentId: null,
    bingoNumbers: [], 
    playerBingoCount: 0,
    botBingoCount: 0
};

// ==========================================
// ===== 1. ВЫЗОВ И ПОДГОТОВКА =====
// ==========================================

export const openGameChallengeModal = (gameType) => {
    gameState.activeGame = gameType;
    const modal = document.getElementById('gameChallengeModal');
    const title = gameType === 'tictactoe' ? '⚔️ КРЕСТИКИ-НОЛИКИ' : '🎰 БИНГО';
    
    // Сброс UI
    document.getElementById('gameChallengeStep1').classList.remove('hidden');
    document.getElementById('gameBoardArea').classList.add('hidden');
    document.getElementById('gameBoardContainer').innerHTML = '';
    document.getElementById('gameStatusText').textContent = 'Подготовка...';
    
    // Заполняем список команд (исключаем замороженных и свою команду)
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
    
    // Эмуляция подключения (Визуальный эффект)
    const btn = document.getElementById('btnSendChallenge');
    const originalText = btn.textContent;
    btn.textContent = "📡 ОТПРАВКА ВЫЗОВА...";
    btn.disabled = true;

    await new Promise(r => setTimeout(r, 1500)); // Задержка 1.5 сек

    btn.textContent = "✅ ВЫЗОВ ПРИНЯТ!";
    await new Promise(r => setTimeout(r, 800));

    // Переход к игре
    document.getElementById('gameChallengeStep1').classList.add('hidden');
    document.getElementById('gameBoardArea').classList.remove('hidden');
    btn.textContent = originalText;
    btn.disabled = false;

    // Запуск конкретной игры
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
    container.innerHTML = gameState.board.map((cell, i) => `
        <div class="ttt-cell ${cell ? 'taken' : ''}" id="cell-${i}" onclick="window.handleGameMove(${i})">
            ${cell || ''}
        </div>
    `).join('');
}

export const handleGameMove = (index) => {
    if (!gameState.gameActive || gameState.board[index] || !gameState.isPlayerTurn) return;

    // Ход игрока
    gameState.board[index] = '❌';
    renderTicTacToeBoard();
    
    // Проверка победы игрока
    const winCombo = checkWinner('❌');
    if (winCombo) {
        highlightWin(winCombo);
        return endGame(true);
    }
    
    // Ничья?
    if (!gameState.board.includes(null)) return endGame(false); 

    // Передача хода боту
    gameState.isPlayerTurn = false;
    updateGameStatus("Ход соперника...");
    
    setTimeout(botMakeMoveTTT, 1000);
};

function botMakeMoveTTT() {
    if (!gameState.gameActive) return;

    const emptyIndices = gameState.board.map((v, i) => v === null ? i : null).filter(v => v !== null);
    if (emptyIndices.length > 0) {
        // Бот ходит случайно (можно улучшить до minmax, но для фана хватит рандома)
        const randomIdx = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
        gameState.board[randomIdx] = '⭕';
        renderTicTacToeBoard();
        
        const winCombo = checkWinner('⭕');
        if (winCombo) {
            highlightWin(winCombo);
            return endGame(false); // Игрок проиграл
        }
        
        if (!gameState.board.includes(null)) return endGame(false); // Ничья = проигрыш (жестко)
    }
    
    gameState.isPlayerTurn = true;
    updateGameStatus("Ваш ход!");
}

function checkWinner(symbol) {
    const wins = [
        [0,1,2], [3,4,5], [6,7,8], 
        [0,3,6], [1,4,7], [2,5,8], 
        [0,4,8], [2,4,6]           
    ];
    return wins.find(combo => combo.every(i => gameState.board[i] === symbol));
}

function highlightWin(combo) {
    combo.forEach(i => document.getElementById(`cell-${i}`).style.backgroundColor = 'rgba(0, 255, 0, 0.3)');
}

// ==========================================
// ===== 3. ЛОГИКА БИНГО =====
// ==========================================

function initBingo() {
    // Генерируем числа 1-16 в случайном порядке
    const numbers = Array.from({length: 16}, (_, i) => i + 1).sort(() => Math.random() - 0.5);
    gameState.bingoNumbers = numbers.map(val => ({val, owner: null}));
    
    gameState.gameActive = true;
    gameState.isPlayerTurn = true;
    renderBingoBoard();
    updateGameStatus("Соберите линию (4 в ряд/диагональ) первым!");
}

function renderBingoBoard() {
    const container = document.getElementById('gameBoardContainer');
    container.className = 'bingo-grid';
    container.innerHTML = gameState.bingoNumbers.map((cell, i) => {
        let styleClass = '';
        if (cell.owner === 'player') styleClass = 'bingo-player';
        if (cell.owner === 'bot') styleClass = 'bingo-bot';
        
        return `<div class="bingo-cell ${styleClass}" onclick="window.handleBingoClick(${i})">
            ${cell.val}
        </div>`;
    }).join('');
}

export const handleBingoClick = (index) => {
    if (!gameState.gameActive || !gameState.isPlayerTurn || gameState.bingoNumbers[index].owner) return;

    gameState.bingoNumbers[index].owner = 'player';
    renderBingoBoard();

    if (checkBingoWin('player')) return endGame(true);

    gameState.isPlayerTurn = false;
    updateGameStatus("Соперник думает...");

    setTimeout(botMakeMoveBingo, 1000);
};

function botMakeMoveBingo() {
    if (!gameState.gameActive) return;

    const available = gameState.bingoNumbers.map((c, i) => c.owner === null ? i : null).filter(i => i !== null);
    if (available.length > 0) {
        // Бот пытается выбрать клетку
        const pick = available[Math.floor(Math.random() * available.length)];
        gameState.bingoNumbers[pick].owner = 'bot';
        renderBingoBoard();
        
        if (checkBingoWin('bot')) return endGame(false);
    }
    
    if (available.length === 0) return endGame(false); // Поле кончилось, а игрок не выиграл

    gameState.isPlayerTurn = true;
    updateGameStatus("Ваш ход!");
}

function checkBingoWin(owner) {
    const size = 4;
    const grid = gameState.bingoNumbers;
    // Проверка строк, колонок и диагоналей
    // (Упрощенная логика проверки линий)
    const checkLine = (indices) => indices.every(i => grid[i].owner === owner);

    // Строки
    for(let r=0; r<size; r++) {
        if(checkLine([r*4, r*4+1, r*4+2, r*4+3])) return true;
    }
    // Колонки
    for(let c=0; c<size; c++) {
        if(checkLine([c, c+4, c+8, c+12])) return true;
    }
    // Диагонали
    if(checkLine([0, 5, 10, 15])) return true;
    if(checkLine([3, 6, 9, 12])) return true;

    return false;
}

// ==========================================
// ===== 4. ФИНАЛ И РЕЗУЛЬТАТЫ =====
// ==========================================

function updateGameStatus(msg) {
    const el = document.getElementById('gameStatusText');
    if(el) el.textContent = msg;
}

async function endGame(isVictory) {
    gameState.gameActive = false;
    
    // Задержка перед показом результата
    await new Promise(r => setTimeout(r, 500));
    window.closeModal('gameChallengeModal');

    if (isVictory) {
        // --- ПОБЕДА ---
        const teamId = Core.state.me.team_id;
        
        // 1. Отмечаем финальную задачу как выполненную в БД
        const finalTaskId = (teamId === 101 || teamId === 103) ? 6 : 15;
        const currentTasks = Core.state.currentTeam.tasks;
        const taskIndex = currentTasks.findIndex(t => t.id === finalTaskId);
        
        if (taskIndex !== -1 && !currentTasks[taskIndex].completed) {
            const newTasks = [...currentTasks];
            newTasks[taskIndex].completed = true;
            
            // Сохраняем в Supabase
            const updateRes = await Core.updateTaskAndInventory(teamId, newTasks, Core.state.currentTeam.inventory);
            if (!updateRes.success) {
                alert("Ошибка сохранения прогресса! Сообщите организаторам.");
                return;
            }
            // Обновляем локальное состояние
            Core.state.currentTeam.tasks = newTasks;
        }

        // 2. Проверяем, все ли ПРЕДЫДУЩИЕ задания выполнены
        // Основные ID задач для группы (кроме финала)
        const mainIds = (teamId === 101 || teamId === 103) ? [1, 2, 3, 4, 5] : [10, 11, 12, 13, 14];
        
        const allMainDone = mainIds.every(id => {
            const t = Core.state.currentTeam.tasks.find(x => x.id === id);
            return t && t.completed;
        });

        await Core.refreshTeamData();
        window.renderGameInterface(); // Обновить галочки в UI

        if (allMainDone) {
            // ФИНАЛЬНАЯ ГЛОБАЛЬНАЯ ПОБЕДА
            window.showVictoryModal(
                "🎉 АБСОЛЮТНАЯ ПОБЕДА!", 
                "Вы одолели соперника в игре и выполнили все задания! Вы спасли Рождество!"
            );
        } else {
            // Победа только в мини-игре
            alert("🏆 ВЫ ВЫИГРАЛИ БИТВУ!\n\nЗадание выполнено. Но вы еще не завершили остальные миссии. Проверьте список задач!");
        }

    } else {
        // --- ПОРАЖЕНИЕ ---
        const freezeTime = 2 * 60 * 1000; // 2 минуты
        
        // Ставим заморозку в БД
        await Core.updateTeamFreezeStatus(Core.state.me.team_id, freezeTime);
        
        // Обновляем UI (красный экран и таймер)
        window.handleQuizFailure(Core.state.me.team_id); 
        
        // Сообщение
        setTimeout(() => {
            alert("❄️ ПОРАЖЕНИЕ!\n\nВаша команда заморожена на 2 минуты. Попробуйте снова, когда лед растает.");
        }, 500);
    }
}