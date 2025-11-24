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

export const ROLES_DATA = {
    Explorer: 'Исследователь', Guardian: 'Хранитель', Saboteur: 'Диверсант',
    Negotiator: 'Переговорщик', leader: 'Лидер', Spy: 'Шпион', Scavenger: 'Кладоискатель'
};

export const CRAFT_RECIPES = [
    { id: 1, name: "Ледяная Бомба", resultId: 11, description: "Замораживает врагов", ingredients: [{ id: 1, count: 3 }, { id: 2, count: 1 }] },
    { id: 2, name: "Какао-Бомба", resultId: 12, description: "Снимает лед", ingredients: [{ id: 3, count: 2 }, { id: 4, count: 1 }] },
    { id: 3, name: "Огненная Руна", resultId: 13, description: "Защита", ingredients: [{ id: 5, count: 1 }, { id: 2, count: 1 }] }
];

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
  // Проверка: есть ли предмет у отправителя
  const inv = state.currentTeam?.inventory || {};
  if ((inv[offerItemId] || 0) < 1) {
    return { success: false, msg: 'У вас нет этого предмета для обмена' };
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
  const {  trade, error: fetchError } = await supabase
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
      const {  fromTeam } = await supabase
        .from('teams')
        .select('inventory')
        .eq('id', trade.from_team_id)
        .single();
      
      const {  toTeam } = await supabase
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