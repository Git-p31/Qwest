import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ===== CONFIG =====
const SUPABASE_URL = 'https://akvvvudcnjnevkzxnfoi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrdnZ2dWRjbmpuZXZrenhuZm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1NDMyNDQsImV4cCI6MjA3OTExOTI0NH0.pOA1Ebemf3IYY4ckaDQ31uDr8jMBljAzcnai_MWr2pY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== STATE (Глобальное состояние) =====
export const state = {
    me: null,
    currentTeam: null,
    teamMembers: [],
    otherTeams: [],
    globalItems: {},
    lastGadgetUsage: 0
};

// ===== CONSTANTS =====
export const GADGET_COOLDOWN_MS = 2 * 60 * 1000;
export const SCAVENGER_COOLDOWN_MS = (1 * 60 + 50) * 1000; // 1 минута 50 секунд

export const ROLES_DATA = {
    Explorer: 'Исследователь', Guardian: 'Хранитель', Saboteur: 'Диверсант',
    Negotiator: 'Переговорщик', leader: 'Лидер', Spy: 'Шпион', Scavenger: 'Кладоискатель'
};

export const CRAFT_RECIPES = [
    { id: 1, name: "Ледяная Бомба", resultId: 11, description: "Замораживает врагов", ingredients: [{ id: 1, count: 3 }, { id: 2, count: 1 }] },
    { id: 2, name: "Какао-Бомба", resultId: 12, description: "Снимает лед", ingredients: [{ id: 3, count: 2 }, { id: 4, count: 1 }] },
    { id: 3, name: "Огненная Руна", resultId: 13, description: "Защита", ingredients: [{ id: 5, count: 1 }, { id: 2, count: 1 }] }
];

// ПУЛЫ ПРЕДМЕТОВ ДЛЯ КЛАДОИСКАТЕЛЯ
const GADGET_POOL = [11, 12, 13]; 
const RESOURCE_POOL = [1, 2, 3, 4, 5]; 

// ===== QUIZ DATA (ДАННЫЕ ДЛЯ ЗАДАНИЯ №4) =====
export const QUIZ_DATA = [
    { 
        question: "Откуда появились рождественские ярмарки?",
        answers: ["Из античного Рима", "Из позднесредневековых торговых ярмарок", "Их придумали в 20 веке", "Их создали дети, чтобы получать подарки"],
        correct: "Из позднесредневековых торговых ярмарок"
    },
    { 
        question: "Что означает слово «Адвент»?",
        answers: ["Рождественская выпечка", "Пришествие / приход", "Семейный ужин", "Ярмарка"],
        correct: "Пришествие / приход"
    },
    { 
        question: "Сколько свечей на традиционном Adventskranz?",
        answers: ["3", "4", "5", "24"],
        correct: "4" 
    },
    { 
        question: "Где появились первые стеклянные ёлочные игрушки?",
        answers: ["В Берлине", "В Лондоне", "В Лауше (Тюрингия)", "В Баварии"],
        correct: "В Лауше (Тюрингия)"
    },
    { 
        question: "Что раньше дарили детям как праздничную сладость?",
        answers: ["Пастилу", "Жареный миндаль (Gebrannte Mandeln)", "Жвачку", "Шоколадные яйца"],
        correct: "Жареный миндаль (Gebrannte Mandeln)"
    },
    { 
        question: "Что символизирует форма рождественского штоллена?",
        answers: ["Слёзы ангелов", "Заснеженные горы", "Завёрнутого младенца Иисуса", "Корону королей"],
        correct: "Завёрнутого младенца Иисуса"
    },
    { 
        question: "Для чего используют фигурки Räuchermännchen?",
        answers: ["Как музыкальную игрушку", "Для хранения конфет", "Как держатель для благовоний", "Как подсвечник"],
        correct: "Как держатель для благовоний"
    }
];

// ===== СТРУКТУРА МАРШРУТОВ (ССЫЛАЕТСЯ НА NAME в map_points) =====
export const MISSION_PATH_STRUCTURE = {
    // Команды 101, 103: Маршрут A
    '101_103': [ 
        {taskId: 1, stallName: 'Палатка №154 (Миссия 1)'},
        {taskId: 2, stallName: 'Палатка №40 (Миссия 2)'},
        {taskId: 3, stallName: 'Палатка №1 (Миссия 3)'},
        {taskId: 4, stallName: 'Палатка №135 (Миссия 4)'},
        {taskId: 5, stallName: 'Палатка №171 (Миссия 5)'},
        {taskId: 6, stallName: 'Палатка №409 (ФИНАЛ)'},
    ],
    // Команды 102, 104: Маршрут B
    '102_104': [ 
        {taskId: 1, stallName: 'Палатка №162 (Миссия 1)'},
        {taskId: 2, stallName: 'Палатка №51 (Миссия 2)'},
        {taskId: 3, stallName: 'Палатка №25 (Миссия 3)'},
        {taskId: 4, stallName: 'Палатка №170 (Миссия 4)'},
        {taskId: 5, stallName: 'Палатка №70 (Миссия 5)'},
        {taskId: 6, stallName: 'Палатка №325 (ФИНАЛ)'},
    ],
};


// ===== API FUNCTIONS (CORE) =====

export async function authPlayer() {
    let storedName = localStorage.getItem('playerName');
    if (!storedName) {
        storedName = prompt("Введите имя игрока (как в базе):");
        if (storedName) localStorage.setItem('playerName', storedName);
        else return null;
    }
    
    const { data: items } = await supabase.from('items').select('*');
    if (items) items.forEach(i => state.globalItems[i.id] = i);

    const { data: player } = await supabase.from('players').select('*').ilike('name', storedName).single();
    if (player) state.me = player;
    
    return player;
}

export async function refreshTeamData() {
    if (!state.me) return;
    
    const { data: team } = await supabase.from('teams').select('*').eq('id', state.me.team_id).single();
    if (team) state.currentTeam = team;

    const { data: members } = await supabase.from('players').select('*').eq('team_id', state.me.team_id);
    if (members) state.teamMembers = members;

    return team;
}

export async function fetchAllTeamsData() {
    const { data: teams } = await supabase.from('teams').select('id, name, frozen_until, current_tent_id');
    const { data: players } = await supabase.from('players').select('team_id');

    if (teams && players && state.me) {
        state.otherTeams = teams.filter(t => t.id !== state.me.team_id).map(t => {
            const count = players.filter(p => p.team_id === t.id).length;
            return {
                ...t,
                playerCount: count,
                x: 20 + Math.random() * 60, 
                y: 20 + Math.random() * 60,
                type: 'team'
            };
        });
    }
}

// НОВАЯ ФУНКЦИЯ: Загрузка всех точек карты из БД (включая миссии)
export async function fetchStaticMapPoints() {
    const { data, error } = await supabase.from('map_points').select('*');
    if (error) {
        console.error("Error fetching map points:", error);
        return [];
    }
    return data.map(p => ({
        id: p.id.toString(), 
        type: p.type,
        x: p.lng, // lng -> X
        y: p.lat, // lat -> Y
        title: p.name,
        desc: p.description,
        icon: p.icon 
    }));
}

// ФУНКЦИЯ ДЛЯ ПРОВЕРКИ ГЛОБАЛЬНОГО СТАТУСА (Нужна для таймера)
export async function fetchGlobalGameState() {
    const { data: teams, error } = await supabase.from('teams').select('id, tasks, updated_at').order('updated_at', { ascending: true });
    if (error) {
        console.error("Error fetching global state:", error);
        return [];
    }
    return teams;
}

// ФУНКЦИЯ ОБНОВЛЕНИЯ ЗАДАЧ И ИНВЕНТАРЯ (CORE)
export async function updateTaskAndInventory(teamId, newTasks, newInventory) {
    const { error } = await supabase.from('teams').update({
        tasks: newTasks,
        inventory: newInventory
    }).eq('id', teamId);

    if (error) {
        console.error('DB Task Update Error:', error);
        return { success: false, error: error.message };
    }
    return { success: true };
}

// --- ФУНКЦИЯ ДЛЯ ЗАМОРОЗКИ (ИСПРАВЛЕНАЯ ДЛЯ ЭКСПОРТА) ---
export async function updateTeamFreezeStatus(teamId, durationMs) {
    const freezeUntil = new Date(Date.now() + durationMs).toISOString();
    
    const { error } = await supabase.from('teams')
        .update({ frozen_until: freezeUntil })
        .eq('id', teamId);
        
    if (error) {
        console.error('Freeze Status Update Error:', error);
        return { success: false, message: error.message };
    }
    return { success: true, freezeUntil };
}


// --- TENT & CRAFT LOGIC ---
export async function setTentStatus(tentId) {
    if (!state.currentTeam) return;
    await supabase.from('teams').update({ current_tent_id: tentId }).eq('id', state.me.team_id);
    const { data: others } = await supabase.from('teams').select('*').eq('current_tent_id', tentId).neq('id', state.me.team_id);
    return others && others.length > 0 ? others[0] : null;
}

export async function clearTentStatus() {
    await supabase.from('teams').update({ current_tent_id: null }).eq('id', state.me.team_id);
}

export async function craftItemLogic(recipeId) {
    const recipe = CRAFT_RECIPES.find(r => r.id === recipeId);
    const newInventory = { ...state.currentTeam.inventory };

    for (let ing of recipe.ingredients) {
        if ((newInventory[ing.id] || 0) < ing.count) return { success: false, msg: 'Не хватает ресурсов' };
        newInventory[ing.id] -= ing.count;
    }
    newInventory[recipe.resultId] = (newInventory[recipe.resultId] || 0) + 1;

    await supabase.from('teams').update({ inventory: newInventory }).eq('id', state.me.team_id);
    return { success: true, itemName: state.globalItems[recipe.resultId].name };
}

// Восстановлена логика гаджетов
export async function useGadgetLogic(itemId, targetTeamId) {
    const { data, error } = await supabase.rpc('use_gadget', {
        attacker_team_id: state.me.team_id,
        target_team_id: targetTeamId,
        item_id: parseInt(itemId)
    });
    if (error) return { success: false, msg: error.message };
    if (!data.success) return { success: false, msg: data.message };
    state.lastGadgetUsage = Date.now();
    return { success: true };
}

// ФУНКЦИЯ ДЛЯ КЛАДОИСКАТЕЛЯ
export async function scavengeItemLogic() {
    const roll = Math.random();
    let itemId = null;
    let quantity = 0;
    let message = "🥶 Вы нашли только ледяную крошку. Ничего не найдено."; // 50%

    if (roll < 0.10) { // 10% шанс на Гаджет
        const randomIndex = Math.floor(Math.random() * GADGET_POOL.length);
        itemId = GADGET_POOL[randomIndex];
        quantity = 1; // Гаджет всегда 1
        message = `🎉 Вам повезло! Найден редкий **Гаджет**!`;
    } else if (roll < 0.50) { // 40% шанс на Ресурс (0.10 до 0.50)
        const randomIndex = Math.floor(Math.random() * RESOURCE_POOL.length);
        itemId = RESOURCE_POOL[randomIndex];
        quantity = Math.floor(Math.random() * 5) + 1; // 1-5 единиц ресурса
        message = `✨ Найден полезный **Ресурс**!`;
    }

    if (!itemId) return { success: true, message: message, itemId: null };

    // Добавление предмета в инвентарь
    const newInventory = { ...state.currentTeam.inventory };
    newInventory[itemId] = (newInventory[itemId] || 0) + quantity;
    
    // Атомарное обновление инвентаря
    const { error } = await supabase.from('teams').update({
        inventory: newInventory
    }).eq('id', state.me.team_id);

    if (error) {
        console.error('Scavenge update error:', error);
        return { success: false, message: error.message };
    }
    
    // Обновляем локальный стейт для быстрого ответа
    state.currentTeam.inventory = newInventory;
    
    return { 
        success: true, 
        message: `${message} (+${quantity} ${state.globalItems[itemId]?.emoji || '🎁'} ${state.globalItems[itemId]?.name || '???'})`,
        itemId: itemId 
    };
}


export function setupRealtimeListeners(onMyTeamUpdate, onGlobalUpdate) {
    supabase.channel('my_team_updates')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams', filter: `id=eq.${state.me.team_id}` }, payload => {
            onMyTeamUpdate(payload.new, payload.old);
        })
        .subscribe();

    supabase.channel('global_updates')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams' }, payload => {
            const updatedTeam = payload.new;
            const idx = state.otherTeams.findIndex(t => t.id === updatedTeam.id);
            if (idx >= 0) state.otherTeams[idx] = { ...state.otherTeams[idx], ...updatedTeam };
            onGlobalUpdate(updatedTeam);
        })
        .subscribe();
}

// ===== TRADE SYSTEM FUNCTIONS (остается без изменений) =====

export async function sendTradeRequest(toTeamId, offerItemId, requestItemId) {
  // Проверка: есть ли предмет у отправителя
  const inv = state.currentTeam?.inventory || {};
  if ((inv[offerItemId] || 0) < 1) {
    return { success: false, msg: 'У вас нет этого предмета для обмена' };
  }

  // Проверка: существует ли предмет в базе (защита от подделки)
  if (!state.globalItems[offerItemId] || !state.globalItems[requestItemId]) {
    return { success: false, msg: 'Неверный ID предмета' };
  }

  const { error } = await supabase.from('trade_requests').insert({
    from_team_id: state.me.team_id,
    to_team_id: toTeamId,
    offer_item_id: offerItemId,
    request_item_id: requestItemId,
    status: 'pending'
  });

  if (error) {
    console.error('Trade send error:', error);
    return { success: false, msg: 'Не удалось отправить обмен' };
  }
  return { success: true };
}

export async function fetchIncomingTrades() {
  const { data, error } = await supabase
    .from('trade_requests')
    .select(`
      id,
      from_team_id,
      offer_item_id,
      request_item_id,
      teams!from_team_id(name, name_by_leader)
    `)
    .eq('to_team_id', state.me.team_id)
    .eq('status', 'pending');

  if (error) {
    console.error('Fetch trades error:', error);
    return [];
  }
  return data.map(t => ({
    ...t,
    from_team_name: t.teams.name_by_leader || t.teams.name
  }));
}

export async function respondToTrade(tradeId, accept = true) {
  const newStatus = accept ? 'accepted' : 'rejected';
  
  // Получаем данные обмена
  const { data: trade, error: fetchError } = await supabase
    .from('trade_requests')
    .select('*')
    .eq('id', tradeId)
    .single();

  if (fetchError || !trade) {
    return { success: false, msg: 'Обмен не найден' };
  }

  // Обновляем статус
  const { error: updateError } = await supabase
    .from('trade_requests')
    .update({ status: newStatus })
    .eq('id', tradeId);

  if (updateError) {
    console.error('Update trade status error:', updateError);
    return { success: false, msg: 'Ошибка при обновлении статуса' };
  }

  if (accept) {
    try {
      // Получаем актуальные данные команд
      const { data: fromTeam } = await supabase
        .from('teams')
        .select('inventory')
        .eq('id', trade.from_team_id)
        .single();
      
      const { data: toTeam } = await supabase
        .from('teams')
        .select('inventory')
        .eq('id', state.me.team_id)
        .single();

      if (!fromTeam || !toTeam) {
        return { success: false, msg: 'Одна из команд не найдена' };
      }

      const invFrom = { ...fromTeam.inventory };
      const invTo = { ...toTeam.inventory };

      // Проверка наличия предметов на момент принятия
      if ((invFrom[trade.offer_item_id] || 0) < 1) {
        return { success: false, msg: 'У отправителя больше нет предмета для обмена' };
      }
      if ((invTo[trade.request_item_id] || 0) < 1) {
        return { success: false, msg: 'У вас больше нет запрашиваемого предмета' };
      }

      // === ВЫПОЛНЕНИЕ ОБМЕНА ===
      // Отправитель ОТДАЁТ offer_item_id → ПОЛУЧАЕТ request_item_id
      invFrom[trade.offer_item_id]--;
      invFrom[trade.request_item_id] = (invFrom[trade.request_item_id] || 0) + 1;

      // Получатель (вы) ОТДАЁТЕ request_item_id → ПОЛУЧАЕТЕ offer_item_id
      invTo[trade.request_item_id]--;
      invTo[trade.offer_item_id] = (invTo[trade.offer_item_id] || 0) + 1;

      // Обновляем инвентарь
      const { error: err1 } = await supabase
        .from('teams')
        .update({ inventory: invFrom })
        .eq('id', trade.from_team_id);

      const { error: err2 } = await supabase
        .from('teams')
        .update({ inventory: invTo })
        .eq('id', state.me.team_id);

      if (err1 || err2) {
        console.error('Inventory update error:', err1 || err2);
        return { success: false, msg: 'Ошибка при обновлении инвентаря' };
      }

    } catch (e) {
      console.error('Critical trade execution error:', e);
      return { success: false, msg: 'Системная ошибка при выполнении обмена' };
    }
  }

  return { success: true };
}