import * as Core from './core.js'; 
import { SECRET_WORDS } from './core.js'; 
import * as Games from './games.js'; 

// Глобальное состояние квиза
let quizState = {
    currentTaskId: null, quizInProgress: false, quizData: [], 
    currentQuestionIndex: 0, correctCount: 0, successThreshold: 0,
};

const QUIZ_TITLES = {
    1: '📜 ЗАДАНИЕ 1: История города', 
    2: '💰 ЗАДАНИЕ 2: Самый дешевый товар', 
    3: '🌟 ЗАДАНИЕ 3: Форма звезды', 
    4: '📜 ЗАДАНИЕ 4: Викторина', 
    5: '🎶 ЗАДАНИЕ 5: Рождественская песня', 
    6: '⚔️ ИГРА 6: Финал (Крестики-нолики)',
};

const getRewardInfo = (taskId, teamId) => {
    const rewardId = Core.MISSION_REWARDS[teamId]?.[taskId - 1]; 
    const rewardName = Core.state.globalItems[rewardId]?.name || 'Предмет'; 
    return { rewardId, rewardName };
};

// =======================================================
// ===== I. QUIZ LOGIC FUNCTIONS (SEQUENTIAL BUTTONS) =====
// =======================================================

export const openQuizModal = async (taskId) => {
    const modal = document.getElementById('quizModal');
    const quizContent = document.getElementById('quizQuestionsContainer');
    const titleEl = document.getElementById('quizModalTitle');
    const teamId = Core.state.me.team_id;

    // Проверка на завершенность
    const currentTask = Core.state.currentTeam?.tasks?.find(t => t.id === taskId);
    if (currentTask && currentTask.completed) {
        modal.classList.remove('hidden');
        titleEl.textContent = QUIZ_TITLES[taskId] || `ЗАДАНИЕ ${taskId}`;
        quizContent.innerHTML = '<p class="muted" style="text-align: center;">✅ Это задание уже выполнено!</p>';
        document.getElementById('quizSubmitBtn')?.classList.add('hidden');
        document.getElementById('quizScoreDisplay').innerHTML = '';
        return;
    }

    // Сброс интерфейса
    quizContent.innerHTML = '<div style="text-align: center; padding: 20px;"><div class="loader-spinner"></div><p>Загрузка вопросов...</p></div>';
    document.getElementById('quizFinalMessage').innerHTML = '';
    document.getElementById('quizScoreDisplay').innerHTML = '';
    document.getElementById('quizSubmitBtn')?.classList.add('hidden'); // Кнопка "Проверить" не нужна в этом режиме
    
    modal.classList.remove('hidden');

    // Загрузка данных
    const quizData = await Core.fetchQuizData(taskId, teamId); 
    
    if (!quizData || quizData.length === 0) {
        quizContent.innerHTML = '<p class="muted" style="text-align: center;">❌ Вопросы не найдены.</p>';
        return;
    }
    
    // Инициализация состояния
    quizState.currentTaskId = taskId;
    quizState.quizData = quizData;
    quizState.currentQuestionIndex = 0;
    quizState.correctCount = 0;
    quizState.quizInProgress = true;
    quizState.successThreshold = Math.ceil(quizData.length / 2); // Порог прохождения (50%+)
    
    titleEl.textContent = QUIZ_TITLES[taskId] || `ЗАДАНИЕ ${taskId}`;
    
    // Запускаем первый вопрос
    window.renderSequentialQuestion();
};

export const renderSequentialQuestion = () => {
    const container = document.getElementById('quizQuestionsContainer');
    const scoreDisplay = document.getElementById('quizScoreDisplay');
    
    // Если вопросы кончились — финал
    if (!quizState.quizInProgress || quizState.currentQuestionIndex >= quizState.quizData.length) {
        window.finalizeQuizResult(quizState.currentTaskId, quizState.quizData.length, quizState.correctCount, quizState.successThreshold);
        return;
    }

    const currentItem = quizState.quizData[quizState.currentQuestionIndex];
    let optionsArray = [];
    
    // Парсинг вариантов ответа (JSON или строка)
    try {
        let opts = currentItem.options;
        if (typeof opts === 'string') {
            // Если строка в формате JSON или просто текст
            if (opts.startsWith('[') || opts.startsWith('{')) {
                opts = JSON.parse(opts);
            } else {
                // Если вдруг варианты пришли не JSON-ом, делаем массив из одной строки (или дефолт)
                opts = [opts, "Нет"]; 
            }
        }
        if (Array.isArray(opts)) optionsArray = opts;
        else optionsArray = ["Да", "Нет"];
    } catch (e) { 
        console.error("Error parsing options:", e);
        optionsArray = ["Да", "Нет"]; 
    }

    // Обновляем счетчик
    scoreDisplay.innerHTML = `Вопрос ${quizState.currentQuestionIndex + 1} из ${quizState.quizData.length}`;

    // Генерируем кнопки
    let buttonsHtml = optionsArray.map((option) => {
        // Экранируем кавычки для onclick
        const safeOption = option.replace(/'/g, "\\'"); 
        return `<button class="quiz-answer-btn" onclick="window.handleSequentialAnswer(this, '${safeOption}')">${option}</button>`;
    }).join('');

    const imageHtml = currentItem.image_url 
        ? `<img src="${currentItem.image_url}" style="max-width: 100%; height: auto; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">`
        : '';

    container.innerHTML = `
        <div class="quiz-question-box fade-in">
            ${imageHtml}
            <p style="font-weight: 900; font-size: 1.3rem; margin-bottom: 20px; line-height: 1.4;">${currentItem.q}</p>
            <div class="quiz-options-grid">
                ${buttonsHtml}
            </div>
        </div>
    `;
};

export const handleSequentialAnswer = (button, selectedAnswer) => {
    if (!quizState.quizInProgress) return;
    
    const currentItem = quizState.quizData[quizState.currentQuestionIndex];
    const correctAnswer = (currentItem.a || '').trim();
    
    // Блокируем все кнопки, чтобы нельзя было нажать дважды
    const allBtns = button.parentElement.querySelectorAll('button');
    allBtns.forEach(b => b.disabled = true);
    
    // Проверка ответа (регистронезависимая)
    const isCorrect = (selectedAnswer.toLowerCase() === correctAnswer.toLowerCase());
    
    if (isCorrect) {
        quizState.correctCount++;
        button.style.background = 'var(--accent-green)';
        button.style.borderColor = '#fff';
        button.style.color = '#000';
        button.style.boxShadow = '0 0 15px var(--accent-green)';
    } else {
        button.style.background = 'var(--accent-red)';
        button.style.borderColor = '#fff';
        
        // Подсветим правильный ответ, если он есть среди кнопок
        allBtns.forEach(btn => {
            if (btn.textContent.toLowerCase() === correctAnswer.toLowerCase()) {
                btn.style.background = 'rgba(0, 255, 0, 0.3)';
                btn.style.borderColor = 'var(--accent-green)';
            }
        });
    }

    // Переход к следующему вопросу через 1.5 секунды
    quizState.currentQuestionIndex++;
    setTimeout(window.renderSequentialQuestion, 1500);
};

export const finalizeQuizResult = async (taskId, totalQuestions, correctCount, successThreshold) => {
    const resultMsg = document.getElementById('quizFinalMessage');
    const container = document.getElementById('quizQuestionsContainer');
    const scoreDisplay = document.getElementById('quizScoreDisplay');
    
    quizState.quizInProgress = false; 
    scoreDisplay.innerHTML = '';
    container.innerHTML = ''; // Очищаем поле с вопросом
    
    const passed = correctCount >= successThreshold;
    
    if (passed) {
        resultMsg.innerHTML = `<div style="text-align:center; padding: 20px;">
            <div style="font-size: 4rem;">🎉</div>
            <h2 style="color: var(--accent-green); margin: 10px 0;">ОТЛИЧНО!</h2>
            <p>Вы ответили верно на ${correctCount} из ${totalQuestions} вопросов.</p>
        </div>`;
        
        const task = Core.state.currentTeam.tasks.find(t => t.id === taskId);
        if (task && !task.completed) {
            const { rewardId, rewardName } = getRewardInfo(taskId, Core.state.me.team_id);
            let newInventory = { ...Core.state.currentTeam.inventory };
            
            if (rewardId) { 
                newInventory[rewardId] = (newInventory[rewardId] || 0) + 1;
                alert(`🎉 Вы получили предмет: ${rewardName}!`);
            }
            
            const newTasks = Core.state.currentTeam.tasks.map(t => t.id === taskId ? {...t, completed: true} : t);
            await Core.updateTaskAndInventory(Core.state.me.team_id, newTasks, newInventory);
        }
    } else {
        resultMsg.innerHTML = `<div style="text-align:center; padding: 20px;">
            <div style="font-size: 4rem;">❄️</div>
            <h2 style="color: var(--accent-red); margin: 10px 0;">ПРОВАЛ</h2>
            <p>Нужно ${successThreshold} верных ответов, а у вас ${correctCount}.</p>
            <p style="color: var(--accent-ice); font-weight: bold; margin-top: 10px;">ВЫ ЗАМОРОЖЕНЫ НА 2 МИНУТЫ!</p>
        </div>`;
        
        await Core.updateTeamFreezeStatus(Core.state.me.team_id, 2 * 60 * 1000);
        window.handleQuizFailure(Core.state.me.team_id);
    }
    
    await Core.refreshTeamData(); 
    if (window.renderGameInterface) window.renderGameInterface(); 
    
    // Кнопка закрытия
    resultMsg.innerHTML += `<div style="text-align: center; margin-top: 20px;">
        <button class="start-button" onclick="window.closeModal('quizModal'); window.renderMarkers();">ЗАКРЫТЬ</button>
    </div>`;
};

// -------------------------------------------------------
// ===== II. SECRET WORD LOGIC =====
// -------------------------------------------------------

export const openSecretWordModal = (taskId) => {
    const modal = document.getElementById('secretWordModal');
    const task = Core.state.currentTeam.tasks.find(t => t.id === taskId);

    document.getElementById('swModalTitle').textContent = QUIZ_TITLES[taskId] || "ЗАДАНИЕ";
    document.getElementById('swModalIcon').innerHTML = '📸';
    
    let desc = task?.text || 'Выполните задание и введите секретное слово.';
    if (taskId === 2) desc = 'Найдите самый дешевый товар и введите его название.';
    if (taskId === 3) desc = 'Найдите предмет в форме звезды.';
    if (taskId === 5) desc = 'Спойте песню "Jingle Bells" и введите название песни одним словом.';

    document.getElementById('swModalDesc').innerHTML = `<p>${desc}</p>`;
    document.getElementById('swModalTelegramLink').href = window.TELEGRAM_GROUP_LINK;
    
    const input = document.getElementById('secretWordInput');
    input.value = '';
    input.disabled = false;
    
    const btn = document.getElementById('swModalSubmitBtn');
    btn.disabled = false;
    btn.onclick = () => window.handleSecretWordSubmit(taskId);
    document.getElementById('swModalStatus').textContent = '';
    
    modal.classList.remove('hidden');
};

export const handleSecretWordSubmit = async (taskId) => {
    const input = document.getElementById('secretWordInput');
    const statusEl = document.getElementById('swModalStatus');
    const submittedWord = input.value.trim().toUpperCase().replace(/\s/g, '');

    let correctWord = (Core.SECRET_WORDS[taskId] || '').toUpperCase().replace(/\s/g, '');
    
    if (submittedWord === correctWord) {
        statusEl.textContent = '✅ Правильно!';
        statusEl.style.color = 'var(--accent-green)';
        input.disabled = true;
        document.getElementById('swModalSubmitBtn').disabled = true;
        
        const task = Core.state.currentTeam.tasks.find(t => t.id === taskId);
        if (task && !task.completed) {
            const { rewardId, rewardName } = getRewardInfo(taskId, Core.state.me.team_id);
            let newInventory = { ...Core.state.currentTeam.inventory };
            
            if (rewardId) { 
                newInventory[rewardId] = (newInventory[rewardId] || 0) + 1;
                alert(`🎉 Награда: ${rewardName}!`);
            }
            
            const newTasks = Core.state.currentTeam.tasks.map(t => t.id === taskId ? {...t, completed: true} : t);
            await Core.updateTaskAndInventory(Core.state.me.team_id, newTasks, newInventory);
            await Core.refreshTeamData();
            if (window.renderGameInterface) window.renderGameInterface();
        }
    } else {
        statusEl.textContent = '❌ Неверно.';
        statusEl.style.color = 'var(--accent-red)';
    }
};

// -------------------------------------------------------
// ===== III. ROUTER =====
// -------------------------------------------------------

export const routeTaskToModal = (taskId) => {
    const isQuiz = (taskId === 1 || taskId === 4);
    const isFinalGame = (taskId === 6);
    
    if (isQuiz) { 
        openQuizModal(taskId); // Теперь всегда открывает Sequential Quiz
    } 
    else if (isFinalGame) {
        Games.openGameChallengeModal('tictactoe');
    } 
    else {
        openSecretWordModal(taskId);
    }
};

// Экспорт в window
window.renderSequentialQuestion = renderSequentialQuestion;
window.handleSequentialAnswer = handleSequentialAnswer;
window.finalizeQuizResult = finalizeQuizResult;
window.handleSecretWordSubmit = handleSecretWordSubmit;