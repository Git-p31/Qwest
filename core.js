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
// Квестовые предметы (6-10, 14+) исключены, они уникальны и не участвуют в крафте/луте
export const GADGET_POOL = [11, 12, 13]; 
export const RESOURCE_POOL = [1, 2, 3, 4, 5]; 

// ===== ДАННЫЕ ДЛЯ ЗАДАНИЙ (СЕКРЕТНОЕ СЛОВО) =====
export const SECRET_WORD_ITEM_ID = 14; 
export const SECRET_WORDS = {
    2: "ГЛИНТВЕЙН", // Task 2 (101/103) - Cheapest item
    3: "ЗВЕЗДА", // Task 3 (101/103) - Star form
    5: "JINGLEBELLS", // Task 5 (101/103) - Sing a song
    
    // НОВЫЕ СЕКРЕТНЫЕ СЛОВА ДЛЯ ГРУППЫ 102/104
    10: "ШАПКА", // Task 10
    12: "ЗВЕЗДА", // Task 12
    13: "1723", // Task 13 (Год создания фонтана) - ИСПРАВЛЕНО
    14: "JINGLEBELLS" // Task 14
};

// МАТРИЦА ВЫПАДАЮЩИХ ПРЕДМЕТОВ (Награды за миссии)
export const MISSION_REWARDS = {
    101: [1, 3, 7, 8, 10], // Team 101 (A)
    102: [2, 4, 5, 7, 9],  // Team 102 (B)
    103: [1, 3, 5, 8, 10], // Team 103 (C)
    104: [2, 4, 6, 7, 9],  // Team 104 (D)
};

// ===== СТРУКТУРА МАРШРУТОВ =====
export const MISSION_PATH_STRUCTURE = {
    '101_103': [ 
        {taskId: 1, stallName: 'Палатка №154 (Миссия 1)'},
        {taskId: 2, stallName: 'Палатка №40 (Миссия 2)'},
        {taskId: 3, stallName: 'Палатка №1 (Миссия 3)'},
        {taskId: 4, stallName: 'Палатка №135 (Миссия 4)'},
        {taskId: 5, stallName: 'Палатка №171 (Миссия 5)'},
        {taskId: 6, stallName: 'Палатка №409 (ФИНАЛ)'},
    ],
    '102_104': [ 
        {taskId: 10, stallName: 'Палатка №162 (Миссия 1)'},
        {taskId: 11, stallName: 'Палатка №51 (Миссия 2)'},
        {taskId: 12, stallName: 'Палатка №25 (Миссия 3)'},
        {taskId: 13, stallName: 'Палатка №170 (Миссия 4)'},
        {taskId: 14, stallName: 'Палатка №70 (Миссия 5)'},
        {taskId: 15, stallName: 'Палатка №325 (ФИНАЛ)'},
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
    const { data: teams } = await supabase.from('teams').select('id, name, frozen_until, current_tent_id, name_by_leader, selfie_url'); 
    const { data: players } = await supabase.from('players').select('team_id');

    if (teams && players && state.me) {
        state.otherTeams = teams.filter(t => t.id !== state.me.team_id).map(t => {
            const count = players.filter(p => p.team_id === t.id).length;
            return {
                ...t,
                playerCount: count,
                x: t.x || (20 + Math.random() * 60), 
                y: t.y || (20 + Math.random() * 60),
                type: 'team'
            };
        });
    }
}

export async function fetchStaticMapPoints() {
    const { data, error } = await supabase.from('map_points').select('*');
    if (error) {
        console.error("Error fetching map points:", error);
        return [];
    }
    return data.map(p => ({
        id: p.id.toString(), 
        type: p.type,
        x: p.lng,
        y: p.lat,
        title: p.name,
        desc: p.description,
        icon: p.icon 
    }));
}

export async function fetchQuizData(taskId, teamId) {
    let tableName = '';
    let groupBaseId = null;

    if (teamId === 101 || teamId === 103) {
        tableName = 'quiz_data_101_103';
        groupBaseId = 101;
    } else if (teamId === 102 || teamId === 104) {
        tableName = 'quiz_data_102_104';
        groupBaseId = 102;
    } else {
        console.error("Unknown team ID for quiz data fetch:", teamId);
        return [];
    }
    
    let query = supabase.from(tableName)
        .select('*')
        .eq('task_id', taskId); 
        
    if (taskId === 1 || taskId === 10) { 
        query = query.or(`team_id.eq.${teamId},team_id.eq.${groupBaseId},team_id.is.null`);
    } else if (taskId === 4 || taskId === 13) { 
        query = query.is('team_id', null);
    } 
    
    const { data, error } = await query;

    if (error) {
        console.error("Error fetching quiz data from table " + tableName + ":", error);
        return [];
    }
    return data;
}

export async function fetchGlobalGameState() {
    const { data: teams, error } = await supabase.from('teams').select('id, tasks, updated_at').order('updated_at', { ascending: true });
    if (error) {
        console.error("Error fetching global state:", error);
        return [];
    }
    return teams;
}

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

export async function updateTeam(updateObject, teamId = state.me.team_id) {
    const { error } = await supabase.from('teams')
        .update(updateObject)
        .eq('id', teamId);
        
    if (error) {
        console.error('Team Update Error:', error);
        return { success: false, message: error.message };
    }
    return { success: true };
}

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


// --- GAMEPLAY LOGIC ---

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

export async function useGadgetLogic(itemId, targetTeamId) {
    const { data, error } = await supabase.rpc('use_gadget', {
        attacker_team_id: state.me.team_id, 
        target_team_id: targetTeamId,
        item_id: parseInt(itemId)
    });
    
    if (error) return { success: false, msg: error.message };
    if (data && !data.success) return { success: false, msg: data.message };
    
    state.lastGadgetUsage = Date.now(); 
    return { success: true };
}

// === НОВАЯ ЛОГИКА ПОИСКА (SCAVENGE) ===
// Полный рандом + возможность найти несколько предметов
export async function scavengeItemLogic() {
    const roll = Math.random();
    
    // Шанс 20%, что не найдем ничего
    if (roll < 0.20) {
        return { success: true, message: "🥶 Вы перерыли весь сугроб, но нашли только ледяную крошку.", itemId: null };
    }

    // Определяем количество находок (от 1 до 3 предметов)
    const lootCount = Math.floor(Math.random() * 3) + 1; 
    const foundItems = {};
    const messages = [];

    for (let i = 0; i < lootCount; i++) {
        const itemRoll = Math.random();
        let itemId = null;
        let qty = 1;

        if (itemRoll < 0.15) { 
            // 15% Шанс на ГАДЖЕТ
            const idx = Math.floor(Math.random() * GADGET_POOL.length);
            itemId = GADGET_POOL[idx];
            qty = 1; // Гаджеты по 1
        } else {
            // 85% Шанс на РЕСУРС
            const idx = Math.floor(Math.random() * RESOURCE_POOL.length);
            itemId = RESOURCE_POOL[idx];
            qty = Math.floor(Math.random() * 2) + 1; // 1 или 2 ресурса
        }

        if (itemId) {
            foundItems[itemId] = (foundItems[itemId] || 0) + qty;
        }
    }

    // Обновляем инвентарь
    const newInventory = { ...state.currentTeam.inventory };
    let msgStr = "Найдено: ";

    for (const [id, count] of Object.entries(foundItems)) {
        newInventory[id] = (newInventory[id] || 0) + count;
        const itemDef = state.globalItems[id];
        const emoji = itemDef?.emoji?.startsWith('http') ? '📦' : (itemDef?.emoji || '📦');
        msgStr += `${emoji} ${itemDef?.name || '???'} x${count}, `;
    }

    // Сохраняем в БД
    const { error } = await supabase.from('teams').update({
        inventory: newInventory
    }).eq('id', state.me.team_id);

    if (error) {
        console.error('Scavenge update error:', error);
        return { success: false, message: error.message };
    }
    
    state.currentTeam.inventory = newInventory;
    
    return { 
        success: true, 
        message: msgStr.slice(0, -2) + "!", // Удаляем последнюю запятую
        itemId: 'multiple' 
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

// ===== TRADE SYSTEM FUNCTIONS =====

export async function sendTradeRequest(toTeamId, offerItemId, requestItemId) {
    const inv = state.currentTeam?.inventory || {};
    if ((inv[offerItemId] || 0) < 1) {
        return { success: false, msg: 'У вас нет этого предмета для обмена' };
    }

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
    
    const { data: trade, error: fetchError } = await supabase
        .from('trade_requests')
        .select('*')
        .eq('id', tradeId)
        .single();

    if (fetchError || !trade) {
        return { success: false, msg: 'Обмен не найден' };
    }
    
    if (accept) {
        try {
            const { data: fromTeam } = await supabase.from('teams').select('inventory').eq('id', trade.from_team_id).single();
            const { data: toTeam } = await supabase.from('teams').select('inventory').eq('id', state.me.team_id).single();

            if (!fromTeam || !toTeam) return { success: false, msg: 'Команда не найдена' };

            const invFrom = { ...fromTeam.inventory };
            const invTo = { ...toTeam.inventory };

            if ((invFrom[trade.offer_item_id] || 0) < 1) return { success: false, msg: 'Предмет уже недоступен' };
            if ((invTo[trade.request_item_id] || 0) < 1) return { success: false, msg: 'У вас нет требуемого предмета' };

            invFrom[trade.offer_item_id]--;
            invFrom[trade.request_item_id] = (invFrom[trade.request_item_id] || 0) + 1;
            invTo[trade.request_item_id]--;
            invTo[trade.offer_item_id] = (invTo[trade.offer_item_id] || 0) + 1;

            await supabase.from('teams').update({ inventory: invFrom }).eq('id', trade.from_team_id);
            await supabase.from('teams').update({ inventory: invTo }).eq('id', state.me.team_id);

        } catch (e) {
            console.error('Trade error:', e);
            return { success: false, msg: 'Ошибка обмена' };
        }
    }
    
    const { error } = await supabase.from('trade_requests').update({ status: newStatus }).eq('id', tradeId);
    return { success: !error };
}

// 🕵️ НОВАЯ ФУНКЦИЯ ДЛЯ ШПИОНА
export async function getEnemyInventory(targetTeamId) {
    const { data, error } = await supabase
        .from('teams')
        .select('inventory, name_by_leader, name')
        .eq('id', targetTeamId)
        .single();
    
    if (error) {
        console.error("Spy error:", error);
        return null;
    }
    return data;
}

// ===== REALTIME PVP LOGIC =====

// 1. Создать вызов (начать игру)
export async function createPvPGame(targetTeamId, gameType) {
    const myTeamId = state.me.team_id;
    
    // Начальное состояние для крестиков-ноликов
    const initialBoard = Array(9).fill(null);
    
    const { data, error } = await supabase.from('active_games').insert({
        game_type: gameType,
        team_a_id: myTeamId,      // Вы - инициатор (Крестики ❌)
        team_b_id: targetTeamId,  // Соперник (Нолики ⭕)
        current_turn_team_id: myTeamId, // Первый ход ваш
        board_state: initialBoard,
        status: 'active'
    }).select().single();

    if (error) {
        console.error("Game create error", error);
        return { success: false, msg: error.message };
    }
    return { success: true, game: data };
}

// 2. Отправить ход
export async function makeGameMove(gameId, newBoard, nextTurnTeamId) {
    const { error } = await supabase.from('active_games')
        .update({ 
            board_state: newBoard,
            current_turn_team_id: nextTurnTeamId
        })
        .eq('id', gameId);
        
    return { success: !error };
}

// 3. Завершить игру (победа/ничья)
export async function finishGame(gameId, winnerTeamId) {
    const { error } = await supabase.from('active_games')
        .update({ 
            status: 'finished',
            winner_team_id: winnerTeamId
        })
        .eq('id', gameId);
        
    return { success: !error };
}

// 4. Слушатель входящих игр (для game.js)
export function subscribeToGames(onGameUpdate) {
    return supabase.channel('public:active_games')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'active_games' }, payload => {
            const game = payload.new;
            const myTeam = state.me.team_id;
            
            // Если это касается нас (мы либо создали, либо нас вызвали)
            if (game && (game.team_a_id === myTeam || game.team_b_id === myTeam)) {
                onGameUpdate(game);
            }
        })
        .subscribe();
}