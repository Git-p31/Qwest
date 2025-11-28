document.addEventListener('DOMContentLoaded', () => {
    const storyContainer = document.getElementById('story-text-container');
    const imageElement = document.getElementById('story-image');
    const skipButton = document.getElementById('skip-button');
    const startButton = document.getElementById('start-button');
    const audio = document.getElementById('story-audio');
    
    // --- НАСТРОЙКИ ---
    const AUDIO_DURATION_MS = 40000; 
    // Укажите имя папки. Если оставили "imegas", напишите "imegas/"
    const imageFolder = "images/";   

    // Текст
    const storyBlocks = [
        "Каждый год рождественская ярмарка в Людвигсбурге радовала гостей огнями, вкусной едой и праздничной атмосферой.", 
        "Но в этом году случилось непредвиденное. Тишина накрыла площадь.", 
        "Часть важнейших символов и украшений праздника оказалась перепутана или вовсе потеряна.", 
        "Подготовка к Рождеству, которую ждали целую зиму, замерла в ожидании краха. Судьба праздника под угрозой.", 
        "И лишь немногие, те, кто зовет себя Stuttgart Talks, осмелились взять на себя этот груз.", 
        "Их миссия — найти истину, восстановить утраченное и противостоять наступающей тьме.", 
        "Теперь они ищут тех, кто готов вступить в команду.", 
        "Потому что этот квест — последняя надежда Людвигсбурга. Иначе праздник погаснет навсегда." 
    ];

    // Картинки (файлы 1.jpg ... 6.jpg должны лежать в папке images)
const storyImages = [
        "1.png", // 1
        "2.png", // 2
        "4.png", // 3
        "3.png", // 4
        "5.png", // 5
        "6.png", // 6
        "6.png", // 7
        "6.png"  // 8
    ];
    
    // Тайминги (сумма = 40 сек)
    const blockDurations = [5000, 4000, 5000, 6000, 5000, 5000, 4000, 6000];

    let currentBlockIndex = 0;
    let interactionStarted = false;
    let autoFinishTimeout = null;
    let stepTimeout = null;

    // --- Предзагрузка картинок (чтобы открывались мгновенно) ---
    function preloadImages() {
        const uniqueImages = [...new Set(storyImages)];
        uniqueImages.forEach(imgName => {
            const img = new Image();
            img.src = imageFolder + imgName;
        });
    }

    // --- Основная логика ---

    const showNextBlock = () => {
        if (currentBlockIndex >= storyBlocks.length) return;
        
        // 1. Текст
        const p = document.createElement('p');
        p.textContent = storyBlocks[currentBlockIndex];
        storyContainer.appendChild(p);
        
        requestAnimationFrame(() => {
            storyContainer.scrollTo({ top: storyContainer.scrollHeight, behavior: 'smooth' });
        });

        // 2. Картинка (Мгновенное переключение)
        const imgName = storyImages[currentBlockIndex];
        const prevImgName = currentBlockIndex > 0 ? storyImages[currentBlockIndex - 1] : null;

        // Обновляем картинку, если она новая ИЛИ если это самый первый слайд
        if (imgName && (imgName !== prevImgName || currentBlockIndex === 0)) {
            const fullPath = imageFolder + imgName;
            
            // Если это первая картинка - показываем сразу без анимации скрытия
            if (currentBlockIndex === 0) {
                imageElement.src = fullPath;
                imageElement.classList.remove('hidden');
                imageElement.style.opacity = '1';
            } else {
                // Для остальных - плавная смена
                imageElement.style.opacity = '0.4'; // Слегка приглушаем
                setTimeout(() => {
                    imageElement.src = fullPath;
                    imageElement.onload = () => { imageElement.style.opacity = '1'; };
                }, 200);
            }
        }
        
        // Планируем следующий шаг
        const delay = blockDurations[currentBlockIndex]; 
        currentBlockIndex++;

        if (currentBlockIndex < storyBlocks.length) {
            stepTimeout = setTimeout(showNextBlock, delay);
        }
    };

    const finishStory = () => {
        if (autoFinishTimeout) clearTimeout(autoFinishTimeout);
        if (stepTimeout) clearTimeout(stepTimeout);
        
        skipButton.classList.add('hidden');
        startButton.classList.remove('hidden');
        
        // Финал
        imageElement.src = imageFolder + "6.jpg"; 
        imageElement.classList.remove('hidden');
        imageElement.style.opacity = '1';

        // Дописываем текст
        if (currentBlockIndex < storyBlocks.length) {
            storyContainer.innerHTML = ''; 
            storyBlocks.forEach(txt => {
                const p = document.createElement('p');
                p.textContent = txt;
                storyContainer.appendChild(p);
            });
             storyContainer.scrollTop = storyContainer.scrollHeight;
        }
    };

    const startStory = () => {
        if (interactionStarted) return;
        interactionStarted = true;
        
        // Предзагружаем остальные фото, пока играет первое
        preloadImages();
        
        skipButton.textContent = 'Пропустить историю';
        skipButton.classList.remove('secondary');
        
        // Аудио
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.log("Audio play error", e));
        }

        // МОМЕНТАЛЬНЫЙ старт первого блока
        showNextBlock();

        autoFinishTimeout = setTimeout(finishStory, AUDIO_DURATION_MS + 1000); 
    };
    
    // --- Слушатели ---

    const handleFirstInteraction = () => {
        document.body.removeEventListener('click', handleFirstInteraction);
        document.body.removeEventListener('touchstart', handleFirstInteraction);
        startStory();
    };
    
    document.body.addEventListener('click', handleFirstInteraction);
    document.body.addEventListener('touchstart', handleFirstInteraction);

    skipButton.addEventListener('click', (e) => {
        e.stopPropagation(); 
        finishStory();
    });

    startButton.addEventListener('click', () => {
        window.location.href = 'history.html'; 
    });
});