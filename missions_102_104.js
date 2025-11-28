import * as Core from './core.js'; 
import { SECRET_WORDS } from './core.js'; 
import * as Games from './games.js'; 

let quizState = {
    currentTaskId: null, quizInProgress: false, quizData: [], 
    currentQuestionIndex: 0, correctCount: 0, successThreshold: 0,
};

const QUIZ_TITLES = {
    10: '📸 ЗАДАНИЕ 10: Новогодняя шапка', 
    11: '📜 ЗАДАНИЕ 11: Старинные предметы',
    12: '💰 ЗАДАНИЕ 12: Самый дорогой товар', 
    13: '📜 ЗАДАНИЕ 13: Год создания фонтана', 
    14: '🗣️ ЗАДАНИЕ 14: Иностранное Рождество', 
    15: '⚔️ ИГРА 15: Финал (Бинго)',
};

const getRewardInfo = (taskId, teamId) => {
    let index = taskId - 9;
    const rewardId = Core.MISSION_REWARDS[teamId]?.[index - 1]; 
    const rewardName = Core.state.globalItems[rewardId]?.name || 'Предмет'; 
    return { rewardId, rewardName };
};

// =======================================================
// ===== SEQUENTIAL QUIZ LOGIC =====
// =======================================================

export const openQuizModal = async (taskId) => {
    const modal = document.getElementById('quizModal');
    const quizContent = document.getElementById('quizQuestionsContainer');
    const titleEl = document.getElementById('quizModalTitle');
    const teamId = Core.state.me.team_id;

    // Проверка готовности
    const currentTask = Core.state.currentTeam?.tasks?.find(t => t.id === taskId);
    if (currentTask && currentTask.completed) {
        modal.classList.remove('hidden');
        titleEl.textContent = QUIZ_TITLES[taskId];
        quizContent.innerHTML = '<p class="muted" style="text-align:center;">✅ Выполнено!</p>';
        document.getElementById('quizSubmitBtn')?.classList.add('hidden');
        document.getElementById('quizScoreDisplay').innerHTML = '';
        return;
    }

    quizContent.innerHTML = '<div style="text-align:center; padding:20px;"><div class="loader-spinner"></div><p>Загрузка...</p></div>';
    document.getElementById('quizFinalMessage').innerHTML = '';
    document.getElementById('quizSubmitBtn')?.classList.add('hidden');
    modal.classList.remove('hidden');
    
    const quizData = await Core.fetchQuizData(taskId, teamId);
    if (!quizData || quizData.length === 0) {
        quizContent.innerHTML = '<p class="muted">❌ Вопросы не найдены.</p>';
        return;
    }

    quizState.currentTaskId = taskId;
    quizState.quizData = quizData;
    quizState.currentQuestionIndex = 0;
    quizState.correctCount = 0;
    quizState.quizInProgress = true;
    quizState.successThreshold = Math.ceil(quizData.length / 2);

    titleEl.textContent = QUIZ_TITLES[taskId];
    
    // Запуск вопросов
    window.renderSequentialQuestion();
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
    try {
        let opts = currentItem.options;
        if (typeof opts === 'string') {
             if (opts.startsWith('[') || opts.startsWith('{')) {
                opts = JSON.parse(opts);
             } else {
                opts = [opts, "Нет"];
             }
        }
        if (Array.isArray(opts)) optionsArray = opts;
        else optionsArray = ["Да", "Нет"];
    } catch (e) { optionsArray = ["Вариант A", "Вариант B"]; }

    scoreDisplay.innerHTML = `Вопрос ${quizState.currentQuestionIndex + 1} из ${quizState.quizData.length}`;

    let buttonsHtml = optionsArray.map((option) => {
        const safeOption = option.replace(/'/g, "\\'");
        return `<button class="quiz-answer-btn" onclick="window.handleSequentialAnswer(this, '${safeOption}')">${option}</button>`;
    }).join('');

    const imageHtml = currentItem.image_url 
        ? `<img src="${currentItem.image_url}" style="max-width: 100%; height: auto; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">`
        : '';

    container.innerHTML = `
        <div class="quiz-question-box fade-in">
            ${imageHtml}
            <p style="font-weight:900; font-size:1.3rem; margin-bottom:20px; line-height:1.4;">${currentItem.q}</p>
            <div class="quiz-options-grid">${buttonsHtml}</div>
        </div>
    `;
};

export const handleSequentialAnswer = (button, selectedAnswer) => {
    if (!quizState.quizInProgress) return;
    const currentItem = quizState.quizData[quizState.currentQuestionIndex];
    const correctAnswer = (currentItem.a || '').trim();
    
    // Блокируем кнопки
    const allBtns = button.parentElement.querySelectorAll('button');
    allBtns.forEach(b => b.disabled = true);

    const isCorrect = (selectedAnswer.toLowerCase() === correctAnswer.toLowerCase());
    
    if (isCorrect) {
        quizState.correctCount++;
        button.style.background = 'var(--accent-green)';
        button.style.borderColor = '#fff';
        button.style.color = '#000';
    } else {
        button.style.background = 'var(--accent-red)';
        button.style.borderColor = '#fff';
        // Подсветка правильного
        allBtns.forEach(btn => {
            if (btn.textContent.toLowerCase() === correctAnswer.toLowerCase()) {
                btn.style.background = 'rgba(0, 255, 0, 0.3)';
                btn.style.borderColor = 'var(--accent-green)';
            }
        });
    }

    quizState.currentQuestionIndex++;
    setTimeout(window.renderSequentialQuestion, 1500);
};

export const finalizeQuizResult = async (taskId, total, correct, threshold) => {
    const container = document.getElementById('quizQuestionsContainer');
    const msg = document.getElementById('quizFinalMessage');
    const scoreDisplay = document.getElementById('quizScoreDisplay');
    
    quizState.quizInProgress = false;
    scoreDisplay.innerHTML = '';
    container.innerHTML = '';
    
    const passed = correct >= threshold;
    
    if (passed) {
        msg.innerHTML = `<div style="text-align:center; padding:20px;">
            <div style="font-size: 4rem;">🎉</div>
            <h2 style="color:var(--accent-green)">УСПЕХ!</h2>
            <p>Верно: ${correct}/${total}</p>
        </div>`;
        
        const task = Core.state.currentTeam.tasks.find(t => t.id === taskId);
        if (task && !task.completed) {
            const { rewardId, rewardName } = getRewardInfo(taskId, Core.state.me.team_id);
            let newInv = { ...Core.state.currentTeam.inventory };
            if (rewardId) newInv[rewardId] = (newInv[rewardId] || 0) + 1;
            
            const newTasks = Core.state.currentTeam.tasks.map(t => t.id === taskId ? {...t, completed: true} : t);
            await Core.updateTaskAndInventory(Core.state.me.team_id, newTasks, newInv);
            alert(`🎉 Получена награда: ${rewardName}`);
        }
    } else {
        msg.innerHTML = `<div style="text-align:center; padding:20px;">
            <div style="font-size: 4rem;">❄️</div>
            <h2 style="color:var(--accent-red)">ПРОВАЛ</h2>
            <p>Нужно ${threshold} правильных ответов.</p>
            <p style="margin-top:10px; font-weight:bold;">ЗАМОРОЗКА НА 2 МИНУТЫ!</p>
        </div>`;
        await Core.updateTeamFreezeStatus(Core.state.me.team_id, 2 * 60 * 1000);
        window.handleQuizFailure(Core.state.me.team_id);
    }
    
    await Core.refreshTeamData();
    window.renderGameInterface();
    msg.innerHTML += `<div style="text-align:center; margin-top:20px;"><button class="start-button" onclick="window.closeModal('quizModal'); window.renderMarkers();">ЗАКРЫТЬ</button></div>`;
};

// ... (SecretWord Logic - без изменений, но оставляем для целостности файла) ...

export const openSecretWordModal = (taskId) => {
    const modal = document.getElementById('secretWordModal');
    const task = Core.state.currentTeam.tasks.find(t => t.id === taskId);
    
    document.getElementById('swModalTitle').textContent = QUIZ_TITLES[taskId];
    document.getElementById('swModalIcon').innerHTML = '📸';
    document.getElementById('swModalDesc').innerHTML = `<p>${task?.text || 'Введите ответ'}</p>`;
    document.getElementById('swModalTelegramLink').href = window.TELEGRAM_GROUP_LINK;
    
    const input = document.getElementById('secretWordInput');
    input.value = ''; input.disabled = false;
    
    const btn = document.getElementById('swModalSubmitBtn');
    btn.disabled = false;
    btn.onclick = () => window.handleSecretWordSubmit(taskId);
    document.getElementById('swModalStatus').textContent = '';
    
    modal.classList.remove('hidden');
};

export const handleSecretWordSubmit = async (taskId) => {
    const input = document.getElementById('secretWordInput');
    const statusEl = document.getElementById('swModalStatus');
    const val = input.value.trim().toUpperCase();
    
    // Для задания 14 (Иностранцы) - любой ввод = успех
    if (taskId === 14 && val.length > 0) {
        statusEl.textContent = '✅ Принято!';
        const newTasks = Core.state.currentTeam.tasks.map(t => t.id === taskId ? {...t, completed: true} : t);
        const { rewardId, rewardName } = getRewardInfo(taskId, Core.state.me.team_id);
        let newInv = { ...Core.state.currentTeam.inventory };
        if (rewardId) newInv[rewardId] = (newInv[rewardId] || 0) + 1;
        await Core.updateTaskAndInventory(Core.state.me.team_id, newTasks, newInv);
        await Core.refreshTeamData();
        window.renderGameInterface();
        alert(`Награда: ${rewardName}`);
        return;
    }

    const correct = Core.SECRET_WORDS[taskId];
    if (val === correct) {
        statusEl.textContent = '✅ Верно!';
        const newTasks = Core.state.currentTeam.tasks.map(t => t.id === taskId ? {...t, completed: true} : t);
        const { rewardId, rewardName } = getRewardInfo(taskId, Core.state.me.team_id);
        let newInv = { ...Core.state.currentTeam.inventory };
        if (rewardId) newInv[rewardId] = (newInv[rewardId] || 0) + 1;
        await Core.updateTaskAndInventory(Core.state.me.team_id, newTasks, newInv);
        await Core.refreshTeamData();
        window.renderGameInterface();
        alert(`Награда: ${rewardName}`);
    } else {
        statusEl.textContent = '❌ Неверно';
    }
};

// -------------------------------------------------------
// ===== III. ROUTER =====
// -------------------------------------------------------

export const routeTaskToModal = (taskId) => {
    const isQuiz = (taskId === 11);
    const isFinalGame = (taskId === 15);
    
    if (isQuiz) { 
        openQuizModal(taskId); 
    } 
    else if (isFinalGame) {
        Games.openGameChallengeModal('bingo');
    } 
    else {
        openSecretWordModal(taskId);
    }
};

// Exports to window
window.renderSequentialQuestion = renderSequentialQuestion;
window.handleSequentialAnswer = handleSequentialAnswer;
window.finalizeQuizResult = finalizeQuizResult;
window.handleSecretWordSubmit = handleSecretWordSubmit;