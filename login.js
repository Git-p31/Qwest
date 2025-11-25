// history.js - Логика управления историей
document.addEventListener('DOMContentLoaded', () => {
    const storyContainer = document.getElementById('story-text-container');
    const skipButton = document.getElementById('skip-button');
    const startButton = document.getElementById('start-button');
    const audio = document.getElementById('story-audio');
    
    // Разбивка текста на смысловые блоки для последовательного отображения
    const storyBlocks = [
        "Каждый год рождественская ярмарка в Людвигсбурге радовала гостей огнями, вкусной едой и праздничной атмосферой.",
        "Но в этом году случилось непредвиденное. Тишина накрыла площадь.",
        "Часть важнейших символов и украшений праздника оказалась перепутана или вовсе потеряна. Подготовка к Рождеству, которую ждали целую зиму, замерла в ожидании краха.",
        "Судьба праздника оказалась под угрозой.",
        "И лишь немногие, те, кто зовет себя Stuttgart Talks, осмелились взять на себя этот груз.",
        "Их миссия — найти истину, восстановить утраченное и противостоять наступающей тьме.",
        "Теперь они ищут тех, кто готов вступить в команду.",
        "Потому что этот квест — последняя надежда Людвигсбурга. Иначе праздник погаснет навсегда."
    ];
    
    // Общая длительность аудио, чтобы знать, когда показывать кнопку "Начать"
    const AUDIO_DURATION_MS = 38000; // Примерно 38 секунд, скорректируйте по вашей записи
    
    let currentBlockIndex = 0;
    let interactionStarted = false;

    // --- Функции управления ---

    const showNextBlock = () => {
        if (currentBlockIndex >= storyBlocks.length) return;
        
        const text = storyBlocks[currentBlockIndex];
        const p = document.createElement('p');
        p.textContent = text;
        storyContainer.appendChild(p);
        
        // Автоматически прокручиваем контейнер, чтобы видеть новый текст
        storyContainer.scrollTop = storyContainer.scrollHeight;
        
        // Устанавливаем задержку до показа следующего блока
        const delay = Math.max(2500, text.length * 90); // Базируем задержку на длине текста
        
        currentBlockIndex++;

        if (currentBlockIndex < storyBlocks.length) {
            setTimeout(showNextBlock, delay);
        }
    };

    const finishStory = () => {
        if (audio) audio.pause();
        // Удаляем лишние таймеры или анимации, если они были
        
        skipButton.classList.add('hidden');
        startButton.classList.remove('hidden');
        startButton.focus();
    };

    const startStory = () => {
        if (interactionStarted) return;
        interactionStarted = true;
        
        // Обновляем кнопку "Пропустить"
        skipButton.textContent = 'Пропустить историю';
        
        // Запуск аудио
        if (audio) {
            audio.play().catch(e => console.error("Audio playback error:", e));
        }

        // Запуск текста
        showNextBlock();

        // Установка таймера для автоматического завершения, если аудио длиннее или совпадает
        setTimeout(finishStory, AUDIO_DURATION_MS + 2000); // +2 секунды на всякий случай
    };
    
    // --- Инициализация и Слушатели ---

    // 1. Запуск аудио и текста по первому клику пользователя (из-за ограничений браузеров)
    const handleFirstInteraction = () => {
        document.body.removeEventListener('click', handleFirstInteraction);
        document.body.removeEventListener('touchstart', handleFirstInteraction);
        startStory();
    };
    
    document.body.addEventListener('click', handleFirstInteraction);
    document.body.addEventListener('touchstart', handleFirstInteraction);

    // 2. Кнопка "Пропустить"
    skipButton.addEventListener('click', finishStory);

    // 3. Кнопка "Начать" (переход на index.html)
    startButton.addEventListener('click', () => {
        finishStory();
        window.location.href = 'history.html'; 
    });
});