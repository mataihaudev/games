(function () {
  const STORAGE_KEY = "scatter-room-state";
  const CHANNEL_NAME = "scatter-room-channel";
  const listeners = new Set();
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;

  function randomId(length) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let value = "";
    for (let index = 0; index < length; index += 1) {
      value += chars[Math.floor(Math.random() * chars.length)];
    }
    return value;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function toIsoString(value) {
    return value ? new Date(value).toISOString() : null;
  }

  function toTimestamp(value) {
    return value ? new Date(value).getTime() : null;
  }

  function readState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { rooms: {} };
    } catch (error) {
      return { rooms: {} };
    }
  }

  function writeState(state) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (channel) {
      channel.postMessage({ type: "sync" });
    }
    listeners.forEach((listener) => listener(clone(state)));
  }

  function notifyRoom(roomId) {
    const state = readState();
    listeners.forEach((listener) => listener(clone(state), roomId));
  }

  function ensureRoom(state, roomId) {
    const room = state.rooms[roomId];
    if (!room) {
      throw new Error("Room not found");
    }
    return room;
  }

  function createMockBackend() {
    if (channel) {
      channel.addEventListener("message", () => {
        notifyRoom(null);
      });
    }

    return {
      mode: "mock",
      subscribe(callback) {
        listeners.add(callback);
        return function unsubscribe() {
          listeners.delete(callback);
        };
      },
      async createRoom(hostName) {
        const state = readState();
        const roomId = randomId(6);
        const hostId = randomId(8);
        const room = {
          id: roomId,
          hostId,
          createdAt: Date.now(),
          stage: "lobby",
          currentRoundIndex: 0,
          currentValidationCategoryIndex: 0,
          timer: null,
          finisherId: null,
          rounds: [],
          players: [
            {
              id: hostId,
              name: hostName,
              score: 0,
              joinedAt: Date.now(),
              isHost: true
            }
          ],
          submissions: {},
          scoreEntries: {},
          revealState: { showHostFinal: false }
        };

        state.rooms[roomId] = room;
        writeState(state);
        return { roomId, playerId: hostId, room: clone(room) };
      },
      async joinRoom(roomId, playerName) {
        const state = readState();
        const room = ensureRoom(state, roomId);
        const playerId = randomId(8);
        room.players.push({
          id: playerId,
          name: playerName,
          score: 0,
          joinedAt: Date.now(),
          isHost: false
        });
        writeState(state);
        return { roomId, playerId, room: clone(room) };
      },
      async getRoom(roomId) {
        const state = readState();
        return clone(ensureRoom(state, roomId));
      },
      async updateRoom(roomId, updater) {
        const state = readState();
        const room = ensureRoom(state, roomId);
        updater(room);
        writeState(state);
        return clone(room);
      }
    };
  }

  function getWindowConfig() {
    const config = window.__GAME_CONFIG__ || {};
    return {
      supabaseUrl: String(config.supabaseUrl || "").trim(),
      supabaseAnonKey: String(config.supabaseAnonKey || "").trim()
    };
  }

  async function getRuntimeConfig() {
    const staticConfig = getWindowConfig();
    if (staticConfig.supabaseUrl && staticConfig.supabaseAnonKey) {
      return staticConfig;
    }

    try {
      const response = await fetch("/api/runtime-config", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      if (!response.ok) {
        return staticConfig;
      }

      const payload = await response.json();
      return {
        supabaseUrl: String(payload.supabaseUrl || staticConfig.supabaseUrl || "").trim(),
        supabaseAnonKey: String(payload.supabaseAnonKey || staticConfig.supabaseAnonKey || "").trim()
      };
    } catch (error) {
      return staticConfig;
    }
  }

  function hasSupabaseConfig(config) {
    return Boolean(
      config &&
      config.supabaseUrl &&
      config.supabaseAnonKey &&
      window.supabase &&
      typeof window.supabase.createClient === "function"
    );
  }

  function composeRoom(roomRow, playerRows, submissionRows) {
    const room = {
      id: roomRow.id,
      hostId: roomRow.host_id,
      createdAt: toTimestamp(roomRow.created_at),
      stage: roomRow.stage,
      currentRoundIndex: roomRow.current_round_index,
      currentValidationCategoryIndex: roomRow.current_validation_category_index,
      timer: roomRow.timer_ends_at ? {
        startedAt: toTimestamp(roomRow.timer_started_at),
        endsAt: toTimestamp(roomRow.timer_ends_at)
      } : null,
      finisherId: roomRow.finisher_id,
      rounds: Array.isArray(roomRow.rounds) ? roomRow.rounds : [],
      players: playerRows.map((player) => ({
        id: player.id,
        name: player.name,
        score: Number(player.score || 0),
        joinedAt: toTimestamp(player.joined_at),
        isHost: Boolean(player.is_host)
      })),
      submissions: {},
      scoreEntries: {},
      revealState: roomRow.reveal_state || {}
    };

    submissionRows.forEach((submission) => {
      const roundKey = String(submission.round_number);
      room.submissions[roundKey] = room.submissions[roundKey] || {};
      room.submissions[roundKey][submission.player_id] = room.submissions[roundKey][submission.player_id] || { answers: {}, finishedAt: null };

      if (submission.category_index >= 0 && submission.answer) {
        room.submissions[roundKey][submission.player_id].answers[String(submission.category_index)] = submission.answer;
      }

      if (submission.finished_at) {
        room.submissions[roundKey][submission.player_id].finishedAt = toTimestamp(submission.finished_at);
      }

      if (submission.category_index >= 0 && submission.awarded_points !== null && submission.awarded_points !== undefined) {
        room.scoreEntries[roundKey] = room.scoreEntries[roundKey] || {};
        room.scoreEntries[roundKey][String(submission.category_index)] = room.scoreEntries[roundKey][String(submission.category_index)] || {};
        room.scoreEntries[roundKey][String(submission.category_index)][submission.player_id] = Number(submission.awarded_points);
      }
    });

    return room;
  }

  function flattenSubmissions(room) {
    const flatRows = {};
    const roundKeys = Object.keys(room.submissions || {});

    roundKeys.forEach((roundKey) => {
      const roundSubmissions = room.submissions[roundKey] || {};
      Object.keys(roundSubmissions).forEach((playerId) => {
        const playerSubmission = roundSubmissions[playerId] || { answers: {}, finishedAt: null };
        const answerKeys = Object.keys(playerSubmission.answers || {});
        const scoreKeys = Object.keys(((room.scoreEntries || {})[roundKey]) || {}).filter((categoryIndex) => {
          const scoreValues = room.scoreEntries[roundKey][categoryIndex] || {};
          return scoreValues[playerId] !== null && scoreValues[playerId] !== undefined;
        });
        const categoryKeys = new Set(answerKeys.concat(scoreKeys));

        if (categoryKeys.size === 0 && playerSubmission.finishedAt) {
          categoryKeys.add("-1");
        }

        categoryKeys.forEach((categoryKey) => {
          const scoreValues = ((((room.scoreEntries || {})[roundKey]) || {})[categoryKey]) || {};
          const compositeKey = [roundKey, categoryKey, playerId].join(":");
          flatRows[compositeKey] = {
            room_id: room.id,
            round_number: Number(roundKey),
            category_index: Number(categoryKey),
            player_id: playerId,
            answer: (playerSubmission.answers || {})[categoryKey] || null,
            awarded_points: scoreValues[playerId] !== undefined ? Number(scoreValues[playerId]) : null,
            finished_at: playerSubmission.finishedAt ? toIsoString(playerSubmission.finishedAt) : null,
            is_finisher: room.finisherId === playerId && Number(roundKey) === room.currentRoundIndex + 1
          };
        });
      });
    });

    return flatRows;
  }

  function roomPayload(room) {
    return {
      id: room.id,
      host_id: room.hostId,
      stage: room.stage,
      current_round_index: room.currentRoundIndex,
      current_validation_category_index: room.currentValidationCategoryIndex,
      timer_started_at: room.timer ? toIsoString(room.timer.startedAt) : null,
      timer_ends_at: room.timer ? toIsoString(room.timer.endsAt) : null,
      finisher_id: room.finisherId,
      rounds: room.rounds || [],
      reveal_state: room.revealState || {}
    };
  }

  function playerPayload(room, player) {
    return {
      id: player.id,
      room_id: room.id,
      name: player.name,
      score: Number(player.score || 0),
      is_host: Boolean(player.isHost),
      joined_at: toIsoString(player.joinedAt) || new Date().toISOString()
    };
  }

  async function runQuery(query, fallbackMessage) {
    const result = await query;
    if (result.error) {
      throw new Error(result.error.message || fallbackMessage);
    }
    return result.data;
  }

  function createSupabaseBackend(client) {
    async function getRoom(roomId) {
      const roomRow = await runQuery(
        client.from("rooms").select("*").eq("id", roomId).maybeSingle(),
        "Unable to load room"
      );

      if (!roomRow) {
        throw new Error("Room not found");
      }

      const [playerRows, submissionRows] = await Promise.all([
        runQuery(
          client.from("players").select("*").eq("room_id", roomId).order("joined_at", { ascending: true }),
          "Unable to load players"
        ),
        runQuery(
          client.from("submissions").select("*").eq("room_id", roomId),
          "Unable to load submissions"
        )
      ]);

      return composeRoom(roomRow, playerRows || [], submissionRows || []);
    }

    async function syncRoomFields(room) {
      await runQuery(
        client.from("rooms").update(roomPayload(room)).eq("id", room.id),
        "Unable to update room"
      );
    }

    async function syncPlayers(originalRoom, nextRoom) {
      const originalPlayers = new Map((originalRoom.players || []).map((player) => [player.id, JSON.stringify(playerPayload(originalRoom, player))]));
      const changedPlayers = (nextRoom.players || []).filter((player) => {
        const payload = JSON.stringify(playerPayload(nextRoom, player));
        return originalPlayers.get(player.id) !== payload;
      }).map((player) => playerPayload(nextRoom, player));

      if (changedPlayers.length === 0) {
        return;
      }

      await runQuery(
        client.from("players").upsert(changedPlayers, { onConflict: "id" }),
        "Unable to sync players"
      );
    }

    async function syncSubmissions(originalRoom, nextRoom) {
      const originalMap = flattenSubmissions(originalRoom);
      const nextMap = flattenSubmissions(nextRoom);
      const originalKeys = Object.keys(originalMap);
      const nextKeys = Object.keys(nextMap);
      const nextRows = nextKeys.filter((key) => JSON.stringify(originalMap[key]) !== JSON.stringify(nextMap[key])).map((key) => nextMap[key]);
      const removedKeys = originalKeys.filter((key) => !nextMap[key]);

      if (nextRows.length > 0) {
        await runQuery(
          client.from("submissions").upsert(nextRows, { onConflict: "room_id,round_number,category_index,player_id" }),
          "Unable to sync submissions"
        );
      }

      if (removedKeys.length > 0) {
        await Promise.all(removedKeys.map((key) => {
          const row = originalMap[key];
          return runQuery(
            client.from("submissions").delete().match({
              room_id: row.room_id,
              round_number: row.round_number,
              category_index: row.category_index,
              player_id: row.player_id
            }),
            "Unable to remove submissions"
          );
        }));
      }
    }

    return {
      mode: "supabase",
      subscribe(callback) {
        const realtimeChannel = client
          .channel("scatter-room-sync-" + randomId(6))
          .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, (payload) => {
            callback(null, payload.new && payload.new.id ? payload.new.id : payload.old && payload.old.id ? payload.old.id : null);
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "players" }, (payload) => {
            callback(null, payload.new && payload.new.room_id ? payload.new.room_id : payload.old && payload.old.room_id ? payload.old.room_id : null);
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "submissions" }, (payload) => {
            callback(null, payload.new && payload.new.room_id ? payload.new.room_id : payload.old && payload.old.room_id ? payload.old.room_id : null);
          });

        realtimeChannel.subscribe();

        return function unsubscribe() {
          client.removeChannel(realtimeChannel);
        };
      },
      async createRoom(hostName) {
        const roomId = randomId(6);
        const hostId = randomId(8);

        await runQuery(
          client.from("rooms").insert({
            id: roomId,
            host_id: hostId,
            stage: "lobby",
            current_round_index: 0,
            current_validation_category_index: 0,
            timer_started_at: null,
            timer_ends_at: null,
            finisher_id: null,
            rounds: [],
            reveal_state: { showHostFinal: false }
          }),
          "Unable to create room"
        );

        await runQuery(
          client.from("players").insert({
            id: hostId,
            room_id: roomId,
            name: hostName,
            score: 0,
            is_host: true
          }),
          "Unable to create host player"
        );

        return { roomId, playerId: hostId, room: await getRoom(roomId) };
      },
      async joinRoom(roomId, playerName) {
        const playerId = randomId(8);

        await runQuery(
          client.from("players").insert({
            id: playerId,
            room_id: roomId,
            name: playerName,
            score: 0,
            is_host: false
          }),
          "Unable to join room"
        );

        return { roomId, playerId, room: await getRoom(roomId) };
      },
      async getRoom(roomId) {
        return getRoom(roomId);
      },
      async updateRoom(roomId, updater) {
        const originalRoom = await getRoom(roomId);
        const nextRoom = clone(originalRoom);
        updater(nextRoom);

        await syncRoomFields(nextRoom);
        await Promise.all([
          syncPlayers(originalRoom, nextRoom),
          syncSubmissions(originalRoom, nextRoom)
        ]);

        return getRoom(roomId);
      }
    };
  }

  async function initializeBackend() {
    const runtimeConfig = await getRuntimeConfig();

    if (hasSupabaseConfig(runtimeConfig)) {
      const client = window.supabase.createClient(runtimeConfig.supabaseUrl, runtimeConfig.supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });
      window.multiplayerBackend = createSupabaseBackend(client);
      return window.multiplayerBackend;
    }

    window.multiplayerBackend = createMockBackend();
    return window.multiplayerBackend;
  }

  window.multiplayerBackendReady = initializeBackend().catch(function handleBackendError() {
    window.multiplayerBackend = createMockBackend();
    return window.multiplayerBackend;
  });
})();