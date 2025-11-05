// === СНЕЖИНКИ ===
function createSnowflakes() {
  const snowflakesContainer = document.getElementById('snowflakes');
  const snowflakesCount = 50;
  const symbols = ['❄', '❅', '❆'];

  for (let i = 0; i < snowflakesCount; i++) {
    const snowflake = document.createElement('div');
    snowflake.classList.add('snowflake');
    snowflake.innerHTML = symbols[Math.floor(Math.random() * symbols.length)];
    snowflake.style.left = Math.random() * 100 + 'vw';
    snowflake.style.opacity = Math.random() * 0.7 + 0.3;
    snowflake.style.fontSize = (Math.random() * 16 + 12) + 'px';
    snowflake.style.animationDuration = (Math.random() * 5 + 5) + 's';
    snowflake.style.animationDelay = Math.random() * 5 + 's';
    snowflakesContainer.appendChild(snowflake);
  }
}
createSnowflakes();

// === ДАННЫЕ ===
const teamNames = {
  1: "Аметист",
  2: "Обсидиан",
  3: "Лазурит"
};

const teamQuests = {
  1: ["Очистите святилище в Парке Славы", "Найдите артефакт Аметиста в Башне Ветров"],
  2: ["Разгадайте шифр Обсидиана в Старой Библиотеке", "Активируйте ловушку в Пещере Теней"],
  3: ["Восстановите кристалл Лазурита в Парке", "Защитите алтарь от теней в Башне"]
};

const roleQuests = {
  leader: ["Собери команду у фонтана", "Активируй ритуальное кольцо"],
  explorer: ["Найди скрытый символ на библиотеке", "Отсканируй QR-код у дуба"],
  keeper: ["Восстанови амулет у алтаря", "Заряди кристалл в башне"],
  saboteur: ["Обойди охрану парка", "Подмени свиток в архиве"],
  negotiator: ["Уговори стража открыть ворота", "Получи карту у торговца"]
};

const GLOBAL_QUEST = "Активируйте Сердце Мира в Башне Ветров";

// === СОСТОЯНИЕ ===
let selectedTeam = null;
let selectedRole = null;
let selectedRoleName = '';

// === DOM ===
const teamCards = document.querySelectorAll('.team-card');
const roleCards = document.querySelectorAll('.role-card');
const startBtn = document.getElementById('startGameBtn');
const setupScreen = document.getElementById('setupScreen');
const gameScreen = document.getElementById('gameScreen');
const playerRoleEl = document.getElementById('playerRole');
const questList = document.getElementById('questList');

const druidModal = document.getElementById('druidModal');
const closeDruid = document.getElementById('closeDruid');
const simulatePhoto = document.getElementById('simulatePhoto');
const druidResponse = document.getElementById('druidResponse');

const globalEventModal = document.getElementById('globalEventModal');
const globalEventMessage = document.getElementById('globalEventMessage');
const ackGlobal = document.getElementById('ackGlobal');

const openInventory = document.getElementById('openInventory');
const inventoryModal = document.getElementById('inventoryModal');
const closeInventory = document.getElementById('closeInventory');

// === ВЫБОР КОМАНДЫ ===
teamCards.forEach(card => {
  card.addEventListener('click', () => {
    teamCards.forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedTeam = card.dataset.team;
    checkStart();
  });
});

// === ВЫБОР РОЛИ ===
roleCards.forEach(card => {
  card.addEventListener('click', () => {
    roleCards.forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedRole = card.dataset.role;
    selectedRoleName = card.querySelector('span').textContent; // ✅ безопасно
    checkStart();
  });
});

function checkStart() {
  startBtn.disabled = !(selectedTeam && selectedRole);
}

// === СТАРТ ИГРЫ ===
startBtn.addEventListener('click', () => {
  if (!selectedTeam || !selectedRole) return;

  playerRoleEl.textContent = `${teamNames[selectedTeam]} • ${selectedRoleName}`;

  setupScreen.classList.remove('active');
  gameScreen.classList.add('active');

  loadQuests();
});

// === ЗАГРУЗКА ЗАДАНИЙ ===
function loadQuests() {
  const personal = roleQuests[selectedRole] || [];
  const team = teamQuests[selectedTeam] || [];
  const all = [...personal, ...team, GLOBAL_QUEST];

  questList.innerHTML = '';
  all.forEach(q => {
    const li = document.createElement('li');
    li.textContent = q;
    li.addEventListener('click', () => openDruidModal(q));
    questList.appendChild(li);
  });
}

// === ДРУИД ===
function openDruidModal(quest) {
  druidModal.classList.remove('hidden');
  druidResponse.classList.remove('show');
  druidResponse.textContent = '';

  simulatePhoto.onclick = () => {
    const words = ['Астрал', 'Веларис', 'Тенебра', 'Люмина', 'Зоран'];
    const word = words[Math.floor(Math.random() * words.length)];
    druidResponse.textContent = `Слово: ${word}`;
    druidResponse.classList.add('show');

    if (quest === GLOBAL_QUEST) {
      setTimeout(() => {
        druidModal.classList.add('hidden');
        globalEventMessage.textContent = `Команда «${teamNames[selectedTeam]}» завершила Мировое задание! Мир изменился…`;
        globalEventModal.classList.remove('hidden');
      }, 1200);
    }
  };
}

closeDruid.addEventListener('click', () => {
  druidModal.classList.add('hidden');
});

ackGlobal.addEventListener('click', () => {
  globalEventModal.classList.add('hidden');
});

openInventory.addEventListener('click', () => {
  inventoryModal.classList.remove('hidden');
});

closeInventory.addEventListener('click', () => {
  inventoryModal.classList.add('hidden');
});