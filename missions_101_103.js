import * as Core from './core.js'; 

// Глобальное состояние квиза (как в старом main.js, но теперь локализовано)
let quizState = {
    currentTaskId: null, quizInProgress: false, quizData: [], 
    currentQuestionIndex: 0, correctCount: 0, successThreshold: 0,
};

const QUIZ_TITLES = {
    1: '🎬 ЗАДАНИЕ 1: Угадай Сюжет/Персонажа',
    4: '📜 КВИЗ: Немецкие традиции',
};

// -------------------------------------------------------
// ===== I. QUIZ LOGIC FUNCTIONS (Task 1 & 4) =====
// -------------------------------------------------------

export const openQuizModal = async (taskId) => {
    const modal = document.getElementById('quizModal');
    const quizContent = document.getElementById('quizQuestionsContainer');
    const titleEl = document.getElementById('quizModalTitle');
    const teamId = Core.state.me.team_id;

    quizContent.innerHTML = '<div style="text-align: center; padding: 20px;">Загрузка вопросов...</div>';
    document.getElementById('quizFinalMessage').innerHTML = '';
    document.getElementById('quizScoreDisplay').innerHTML = '';
    document.getElementById('quizSubmitBtn')?.classList.add('hidden');
    
    modal.classList.remove('hidden');

    const quizData = await Core.fetchQuizData(taskId, teamId); 
    
    if (!quizData || quizData.length === 0) {
        quizContent.innerHTML = '<p class="muted" style="text-align: center;">❌ Вопросы для вашей команды не найдены. Свяжитесь с организатором.</p>';
        return;
    }
    
    // Инициализация локального quizState
    quizState.currentTaskId = taskId;
    quizState.quizData = quizData;
    quizState.currentQuestionIndex = 0;
    quizState.correctCount = 0;
    quizState.quizInProgress = true;
    quizState.successThreshold = Math.ceil(quizData.length / 2) + 1;
    
    // Task 1 и 4 - это logicId 1 и 4, которые в этой группе соответствуют фактическим ID.
    const isSequential = (taskId === 1 || taskId === 4); 
    
    // ИСПРАВЛЕНИЕ: Используем QUIZ_TITLES для точного заголовка
    titleEl.textContent = QUIZ_TITLES[taskId] || `ЗАДАНИЕ ${taskId} (КВИЗ)`;
    
    if (isSequential) {
        if (!quizData[0] || !quizData[0].options) {
             quizContent.innerHTML = `<p class="muted" style="text-align: center; color: var(--accent-red);">❌ Критическая ошибка: Для задания №${taskId} не найдены варианты ответа (опции) в базе данных.</p>`;
             return;
        }
        window.renderSequentialQuestion();
    } else {
        window.renderBulkQuiz(quizData, taskId);
    }
};

export const renderSequentialQuestion = () => {
    const container = document.getElementById('quizQuestionsContainer');
    const scoreDisplay = document.getElementById('quizScoreDisplay');
    
    if (!quizState.quizInProgress || quizState.currentQuestionIndex >= quizState.quizData.length) {
        window.finalizeQuizResult(quizState.currentTaskId, quizState.quizData.length, quizState.correctCount, quizState.successThreshold);
        return;
    }

    const currentItem = quizState.quizData[quizState.currentQuestionIndex];
    let optionsArray = [];
    
    let optionsString = currentItem.options;
    // ... (Парсинг optionsString, как в старом main.js) ...
    const match = String(optionsString).trim().match(/^\((\d+)\)\s*(.*)/);
    if (match) { optionsString = match[2]; }
    
    if (typeof optionsString === 'string' && optionsString.trim().length > 0) {
        try {
            if (optionsString.startsWith('"') && optionsString.endsWith('"')) {
                 optionsString = optionsString.substring(1, optionsString.length - 1);
            }
            optionsArray = JSON.parse(optionsString);
        } catch (e) {
            console.error("Failed to parse options JSON:", optionsString, e);
            container.innerHTML = `<p class="muted" style="text-align: center; color: var(--accent-red);">❌ Критическая ошибка: Неверный формат вариантов ответа. (Невалидный JSONB)</p>`;
            document.getElementById('quizSubmitBtn')?.classList.add('hidden');
            return; 
        }
    } else if (Array.isArray(optionsString)) {
        optionsArray = optionsString;
    } else {
          container.innerHTML = `<p class="muted" style="text-align: center; color: var(--accent-red);">❌ Критическая ошибка: Варианты ответа пусты или отсутствуют.</p>`;
          document.getElementById('quizSubmitBtn')?.classList.add('hidden');
          return;
    }
    
    if (!optionsArray || optionsArray.length === 0) {
          container.innerHTML = `<p class="muted" style="text-align: center; color: var(--accent-red);">❌ Критическая ошибка: Варианты ответа пусты или отсутствуют.</p>`;
          document.getElementById('quizSubmitBtn')?.classList.add('hidden');
          return;
    }
    
    scoreDisplay.innerHTML = `Вопрос ${quizState.currentQuestionIndex + 1} из ${quizState.quizData.length} (Верно: <span style="color: var(--accent-gold);">${quizState.correctCount}</span>)`;

    let buttonsHtml = optionsArray.map((option, optIndex) => {
        const escapedOption = option.replace(/'/g, "\\'"); 
        
        return `<button class="quiz-answer-btn" data-answer="${option}" 
                    onclick="window.handleSequentialAnswer(this, ${currentItem.id}, '${escapedOption}')">
                    ${String.fromCharCode(65 + optIndex)}. ${option}
                </button>`;
    }).join('');

    const imageHtml = currentItem.image_url 
        ? `<img src="${currentItem.image_url}" style="max-width: 100%; height: auto; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">`
        : '';
        
    container.innerHTML = `
        <div class="quiz-question-box">
            ${imageHtml}
            <p style="font-weight: 900; font-size: 1.3rem; margin-bottom: 20px;">${currentItem.q}</p>
            <div class="quiz-options-grid" id="q_options_${currentItem.id}">
                ${buttonsHtml}
            </div>
        </div>
    `;
    
    document.getElementById('quizSubmitBtn')?.classList.add('hidden');
};


export const handleSequentialAnswer = (button, questionId, selectedAnswer) => {
    if (!quizState.quizInProgress) return;
    
    const currentItem = quizState.quizData[quizState.currentQuestionIndex];
    const isCorrect = (selectedAnswer === currentItem.a);
    
    const parentGrid = button.closest('.quiz-options-grid');
    parentGrid.querySelectorAll('.quiz-answer-btn').forEach(btn => btn.disabled = true);
    
    if (isCorrect) {
        quizState.correctCount++;
        button.classList.add('correct-flash');
    } else {
        button.classList.add('incorrect');
        parentGrid.querySelectorAll('.quiz-answer-btn').forEach(btn => {
            if (btn.dataset.answer === currentItem.a) {
                btn.classList.add('correct-flash');
            }
        });
    }

    quizState.currentQuestionIndex++;
    
    setTimeout(window.renderSequentialQuestion, 2000);
};

export const renderBulkQuiz = (quizData, taskId) => {
    const container = document.getElementById('quizQuestionsContainer');
    const scoreDisplay = document.getElementById('quizScoreDisplay');
    
    let questionsHtml = quizData.map((item, index) => {
        const imageHtml = item.image_url 
            ? `<img src="${item.image_url}" style="max-width: 100%; height: auto; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">`
            : '';
            
        return `
        <div class="quiz-question-box" style="margin-bottom: 20px;" data-question-id="${item.id}" data-type="text">
            ${imageHtml}
            <p style="font-weight: 700; font-size: 1.1rem; margin-bottom: 10px;">${index + 1}. ${item.q}</p>
            <input type="text" id="q_input_${item.id}" class="modal-input quiz-text-input" placeholder="Введите ответ (одно слово)">
        </div>`;
    }).join('');
    
    container.innerHTML = questionsHtml;
    
    const totalQuestions = quizData.length;
    const successThreshold = Math.ceil(totalQuestions / 2) + 1;

    const submitBtn = document.getElementById('quizSubmitBtn');
    submitBtn.classList.remove('hidden');
    submitBtn.onclick = () => window.handleBulkSubmit(taskId, quizData);

    scoreDisplay.innerHTML = `Всего вопросов: ${totalQuestions}. Требуется ${successThreshold} для успеха.`;
};


export const handleBulkSubmit = async (taskId, quizData) => {
    let correctCount = 0;
    const totalQuestions = quizData.length;
    const successThreshold = Math.ceil(totalQuestions / 2) + 1;
    
    quizData.forEach((item) => {
        const inputEl = document.getElementById(`q_input_${item.id}`);
        if (!inputEl) return;
        
        const submittedAnswer = inputEl.value.trim();
        inputEl.disabled = true;
        
        const correctAnswer = (item.a || '').toUpperCase(); 
        
        if (submittedAnswer.toUpperCase() === correctAnswer && correctAnswer.length > 0) {
            correctCount++;
            inputEl.style.backgroundColor = 'rgba(0, 214, 143, 0.2)';
            inputEl.style.borderColor = 'var(--accent-green)';
        } else {
            inputEl.style.backgroundColor = 'rgba(217, 0, 38, 0.2)';
            inputEl.style.borderColor = 'var(--accent-red)';
            if (correctAnswer.length > 0) {
                 inputEl.value = `${submittedAnswer} (❌ Ответ: ${item.a})`;
            }
        }
    });

    window.finalizeQuizResult(taskId, totalQuestions, correctCount, successThreshold);
};

export const finalizeQuizResult = async (taskId, totalQuestions, correctCount, successThreshold) => {
    const resultMsg = document.getElementById('quizFinalMessage');
    const container = document.getElementById('quizQuestionsContainer');
    const passed = correctCount >= successThreshold;
    
    quizState.quizInProgress = false; 
    document.getElementById('quizSubmitBtn')?.classList.add('hidden'); 
    
    if (passed) {
        resultMsg.innerHTML = `<span style="color: var(--accent-green);">🎉 УСПЕХ! ${correctCount} из ${totalQuestions} верных. Задание №${taskId} выполнено!</span>`;
        
        const task = Core.state.currentTeam.tasks.find(t => t.id === taskId);
        if (task && !task.completed) {
            let newInventory = { ...Core.state.currentTeam.inventory };
            
            if (task.reward_item_id) { 
                const rewardId = task.reward_item_id;
                newInventory[rewardId] = (newInventory[rewardId] || 0) + 1;
                alert(`🎉 Получена награда: ${Core.state.globalItems[rewardId]?.name}!`);
            }
            
            const newTasks = Core.state.currentTeam.tasks.map(t => t.id === taskId ? {...t, completed: true} : t);
            const result = await Core.updateTaskAndInventory(Core.state.me.team_id, newTasks, newInventory);
            if (!result.success) {
                console.error('Task auto-update error:', result.error);
                alert('Ошибка автоматического сохранения задачи!');
            }
        }
        
    } else {
        resultMsg.innerHTML = `<span style="color: var(--accent-red);">❌ ПРОВАЛ! Требуется ${successThreshold}.</span><br>Ваша команда будет ЗАМОРОЖЕНА на 2 минуты!`;
        
        const freezeDurationMs = 2 * 60 * 1000; 
        await Core.updateTeamFreezeStatus(Core.state.me.team_id, freezeDurationMs);
    }
    
    await Core.refreshTeamData(); 
    // Предполагаем, что renderGameInterface вызывается из game.js (window.renderGameInterface)
    window.renderGameInterface(); 
    
    container.innerHTML = `<div style="text-align: center; margin-top: 20px;">
                            <button class="start-button" onclick="window.closeModal('quizModal'); window.renderMarkers();">
                                ЗАКРЫТЬ
                            </button>
                            </div>`;
};

// -------------------------------------------------------
// ===== II. SECRET WORD LOGIC (Task 2, 3, 5) =====
// -------------------------------------------------------

export const openSecretWordModal = (taskId) => {
    const modal = document.getElementById('secretWordModal');
    
    const task = Core.state.currentTeam.tasks.find(t => t.id === taskId);

    let title = "ЗАДАНИЕ СЕКРЕТНОЕ СЛОВО";
    let icon = '📸';
    let description = 'Отправьте фото/видео отчет в Telegram-группу, чтобы получить секретное слово.';
    
    // Логика ID 1-6
    if (taskId === 2) { 
        title = 'САМЫЙ ДЕШЕВЫЙ ПРЕДМЕТ';
        icon = '💰';
        description = 'Найдите самый дешевый съедобный предмет (на ярмарке) и введите его название как секретное слово.';
    } else if (taskId === 3) { 
        title = 'ФОРМА ЗВЕЗДЫ';
        icon = '⭐';
        description = 'Соберитесь командой и снимите видео, где вы делаете форму звезды. Отправьте видео в Telegram и получите слово.';
    } else if (taskId === 5) { 
        title = 'СПЕТЬ ПЕСЕНКУ';
        icon = '🎤';
        description = 'Снимите видео, как ваша команда поет новогоднюю песню. Отправьте видео в Telegram и получите слово.';
    }
                          
    document.getElementById('swModalTitle').textContent = `ЗАДАНИЕ ${taskId}: ${title}`;
    document.getElementById('swModalIcon').innerHTML = icon;
    
    const telegramLinkHTML = `<p style="font-size: 1.1rem; color: var(--text-main); margin-bottom: 15px;">${description}</p>`;
    
    document.getElementById('swModalDesc').innerHTML = telegramLinkHTML;
    document.getElementById('swModalTelegramLink').href = window.TELEGRAM_GROUP_LINK; // Используем глобальную константу
    
    document.getElementById('swModalStatus').textContent = '';
    document.getElementById('secretWordInput').value = '';
    document.getElementById('secretWordInput').disabled = false;
    document.getElementById('swModalSubmitBtn').disabled = false;
    
    document.getElementById('swModalSubmitBtn').setAttribute('onclick', `window.handleSecretWordSubmit(${taskId})`);
    
    modal.classList.remove('hidden');
};

// ===== ДАННЫЕ ДЛЯ ЗАДАНИЙ (СЕКРЕТНОЕ СЛОВО) =====
export const SECRET_WORD_ITEM_ID = 14; 
export const SECRET_WORDS = {
    // Для группы 101/103
    2: "ГЛИНТВЕЙН", // Task 2 
    3: "ЗВЕЗДА",    // Task 3
    5: "JINGLEBELLS", // Task 5 
    
    // Для группы 102/104 (если она использует этот же файл core.js)
    10: "ШАПКА", 
    12: "ЗВЕЗДА", 
    13: "ФОНТАН", 
    14: "JINGLEBELLS" 
};

export const handleSecretWordSubmit = async (taskId) => {
    const input = document.getElementById('secretWordInput');
    const statusEl = document.getElementById('swModalStatus');
    const correctWord = Core.SECRET_WORDS[String(taskId)]; 
    
    if (!correctWord) {
        statusEl.textContent = 'Ошибка: Задание не настроено.';
        statusEl.style.color = 'var(--accent-red)';
        return;
    }

    const submittedWord = input.value.trim().toUpperCase();

    if (submittedWord === correctWord.toUpperCase()) {
        statusEl.textContent = '✅ Правильно! Задание выполнено.';
        statusEl.style.color = 'var(--accent-green)';
        input.disabled = true;
        document.getElementById('swModalSubmitBtn').disabled = true;
        
        const task = Core.state.currentTeam.tasks.find(t => t.id === taskId);
        if (task && !task.completed) {
            let newInventory = { ...Core.state.currentTeam.inventory };
            
            if (task.reward_item_id) { 
                const rewardId = task.reward_item_id;
                newInventory[rewardId] = (newInventory[rewardId] || 0) + 1;
                alert(`🎉 Получена награда: ${Core.state.globalItems[rewardId]?.name}!`);
            }
            
            const newTasks = Core.state.currentTeam.tasks.map(t => t.id === taskId ? {...t, completed: true} : t);
            const result = await Core.updateTaskAndInventory(Core.state.me.team_id, newTasks, newInventory);
            if (!result.success) {
                console.error('Task auto-update error:', result.error);
                alert('Ошибка автоматического сохранения задачи!');
            }
            
            await Core.refreshTeamData();
            window.renderGameInterface();
        }
        
    } else {
        statusEl.textContent = '❌ Неверное слово. Попробуйте еще раз.';
        statusEl.style.color = 'var(--accent-red)';
    }
};

// -------------------------------------------------------
// ===== III. FINAL GAME LOGIC (Task 6) =====
// -------------------------------------------------------

export const openTicTacToeModal = () => {
    const modal = document.getElementById('ticTacToeModal');
    const teamSelect = document.getElementById('tttTargetTeam');
    
    const task = Core.state.currentTeam.tasks.find(t => t.id === 6);
    const modalTitle = task?.text.includes('Бинго') ? '🎲 БИНГО (ФИНАЛ)' : '⚔️ КРЕСТИКИ-НОЛИКИ (ФИНАЛ)';
    
    teamSelect.innerHTML = '<option value="">Выберите команду для вызова</option>';
    Core.state.otherTeams.forEach(t => {
        const isFrozen = t.frozen_until && new Date(t.frozen_until) > new Date();
        const frozenText = isFrozen ? ' (Заморожена!)' : '';
        const isDisabled = isFrozen ? 'disabled' : '';

        const opt = document.createElement('option');
        
        opt.value = t.id;
        opt.textContent = `${t.name_by_leader || t.name} ${window.TEAMS_UI_CONFIG[t.id]?.symbol || ''} ${frozenText}`;
        opt.disabled = isDisabled; 
        
        teamSelect.appendChild(opt);
    });

    document.getElementById('tttSelectOpponent').classList.remove('hidden');
    document.getElementById('tttGameContainer').classList.add('hidden');
    document.querySelector('#ticTacToeModal .modal-title').textContent = modalTitle; 
    document.getElementById('tttStatusMessage').textContent = 'Выберите команду и отправьте вызов:';
    document.getElementById('gameBoardPlaceholder').innerHTML = '';
    
    modal.classList.remove('hidden');
};

export const sendGameChallenge = async () => {
    const targetSelect = document.getElementById('tttTargetTeam');
    const targetId = Number(targetSelect.value);
    const targetName = targetSelect.options[targetSelect.selectedIndex].textContent;
    
    if (!targetId) return alert('Выберите команду!');
    
    document.getElementById('tttStatusMessage').textContent = `⏳ Вызов отправлен команде ${targetName}. Ожидайте результата.`;
    document.getElementById('tttSelectOpponent').classList.add('hidden');
    document.getElementById('tttGameContainer').classList.remove('hidden');
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const teamWon = Math.random() < 0.5; 
    
    window.handleTicTacToeResult(teamWon);
};

export const handleTicTacToeResult = async (attackerWon) => {
    const taskId = 6; 
    
    let resultMessage;

    if (attackerWon) {
        resultMessage = `🎉 ПОБЕДА! Вы выиграли в Крестики-нолики! Задание №${taskId} выполнено!`;
        
        const task = Core.state.currentTeam.tasks.find(t => t.id === taskId);
        if (task && !task.completed) {
            let newInventory = { ...Core.state.currentTeam.inventory };
            
            if (task.reward_item_id) { 
                const rewardId = task.reward_item_id;
                newInventory[rewardId] = (newInventory[rewardId] || 0) + 1;
                alert(`🎉 Получена награда: ${Core.state.globalItems[rewardId]?.name}!`);
            }
            
            const newTasks = Core.state.currentTeam.tasks.map(t => t.id === taskId ? {...t, completed: true} : t);
            const result = await Core.updateTaskAndInventory(Core.state.me.team_id, newTasks, newInventory);
            if (!result.success) {
                 console.error('Task auto-update error:', result.error);
                 alert('Ошибка автоматического сохранения задачи!');
            }
        }
    } else {
        const freezeDurationMs = 2 * 60 * 1000;
        resultMessage = `❌ ПОРАЖЕНИЕ! Ваша команда ЗАМОРОЖЕНА на 2 минуты. Повторная попытка будет доступна после разморозки.`;
        
        await Core.updateTeamFreezeStatus(Core.state.me.team_id, freezeDurationMs);
    }
    
    await Core.refreshTeamData(); 
    window.renderGameInterface();

    document.getElementById('tttStatusMessage').textContent = resultMessage;
    document.getElementById('gameBoardPlaceholder').innerHTML = `<h3 style="color:${attackerWon ? 'var(--accent-green)' : 'var(--accent-red)'}; font-size: 1.5rem;">${attackerWon ? 'УСПЕХ' : 'ПОРАЖЕНИЕ'}!</h3>`;
    
    const container = document.getElementById('tttGameContainer');
    // Проверка, чтобы не добавлять кнопку повторно, если это не первая попытка
    if (!container.querySelector('.final-game-done-button')) {
        container.innerHTML += `<button class="start-button final-game-done-button" style="margin-top: 15px;" onclick="window.closeModal('ticTacToeModal'); window.renderMarkers();">ГОТОВО</button>`;
    }
};


// -------------------------------------------------------
// ===== IV. ROUTER FUNCTION (Exported to game.js) =====
// -------------------------------------------------------

export const routeTaskToModal = (taskId) => {
    // В этой группе logicId === taskId
    const isQuiz = (taskId === 1 || taskId === 4);
    const isSecretWord = (taskId === 2 || taskId === 3 || taskId === 5);
    const isFinalGame = (taskId === 6); 

    if (isQuiz) { 
        openQuizModal(taskId); 
    } 
    else if (isSecretWord) {
        openSecretWordModal(taskId);
    } 
    else if (isFinalGame) {
        openTicTacToeModal();
    }
};

// Привязка экспортируемых функций к window для вызова из HTML атрибутов
window.renderSequentialQuestion = renderSequentialQuestion;
window.handleSequentialAnswer = handleSequentialAnswer;
window.renderBulkQuiz = renderBulkQuiz;
window.handleBulkSubmit = handleBulkSubmit;
window.finalizeQuizResult = finalizeQuizResult;
window.handleSecretWordSubmit = handleSecretWordSubmit;
window.sendGameChallenge = sendGameChallenge;
window.handleTicTacToeResult = handleTicTacToeResult;