(function () {
  const root = document.getElementById("gender-reveal-root");
  const PRESENCE_TIMEOUT = 45000;
  const PRESENCE_INTERVAL = 20000;
  let backend = null;

  if (!root) {
    return;
  }

  const state = {
    room: null,
    roomId: "",
    playerId: "",
    playerName: "",
    error: "",
    unsubscribe: null,
    heartbeatId: null
  };

  const BOARD_MODES = {
    classic: {
      id: "classic",
      label: "Classique",
      gridSize: 5,
      tileCount: 25,
      revealAfterTurn: 5
    },
    fast: {
      id: "fast",
      label: "Rapide",
      gridSize: 3,
      tileCount: 9,
      revealAfterTurn: 3
    }
  };

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function query() {
    return new URLSearchParams(window.location.search);
  }

  function normalizeName(value) {
    return String(value || "").trim().toLowerCase();
  }

  function gameState(room) {
    const reveal = (room && room.revealState) || {};
    return reveal.kind === "gender-reveal" ? reveal : null;
  }

  function currentPlayer() {
    return state.room && state.room.players.find(function findPlayer(player) {
      return player.id === state.playerId;
    });
  }

  function isHost() {
    const player = currentPlayer();
    return Boolean(player && player.isHost);
  }

  function teamFor(playerId) {
    const reveal = gameState(state.room);
    return reveal && reveal.teams ? reveal.teams[playerId] : "";
  }

  function roomLink() {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("room", state.roomId);
    return url.toString();
  }

  function persistIdentity() {
    try {
      window.sessionStorage.setItem("reveal-room-id", state.roomId);
      window.sessionStorage.setItem("reveal-player-id", state.playerId);
      window.sessionStorage.setItem("reveal-player-name", state.playerName);
      window.localStorage.setItem("reveal-room-id", state.roomId);
      window.localStorage.setItem("reveal-player-id", state.playerId);
      window.localStorage.setItem("reveal-player-name", state.playerName);
    } catch (error) {
      // Storage is only used to make a reconnection easier.
    }
  }

  function restoreIdentity() {
    const params = query();
    const roomId = params.get("room") || "";
    try {
      state.roomId = roomId;
      state.playerId = roomId ? (window.sessionStorage.getItem("reveal-player-id") || window.localStorage.getItem("reveal-player-id") || "") : "";
      state.playerName = window.sessionStorage.getItem("reveal-player-name") || window.localStorage.getItem("reveal-player-name") || "";
    } catch (error) {
      state.roomId = roomId;
    }
  }

  function friendlyError(error, action) {
    const message = String((error && error.message) || "").toLowerCase();
    if (message.includes("room not found")) {
      return "Ce salon n'existe plus ou le lien est incomplet.";
    }
    if (message.includes("name already taken")) {
      return "Ce pseudo est deja utilise dans ce salon. Choisissez-en un autre.";
    }
    if (message.includes("network") || message.includes("failed to fetch")) {
      return "La connexion au salon a échoué. Vérifiez votre connexion puis réessayez.";
    }
    return action === "join" ? "Impossible de rejoindre ce salon pour le moment." : "Impossible de créer le salon pour le moment.";
  }

  function modeFor(reveal) {
    return BOARD_MODES[reveal && reveal.mode] || BOARD_MODES.classic;
  }

  function initialRevealState(modeId) {
    const mode = BOARD_MODES[modeId] || BOARD_MODES.classic;
    return {
      kind: "gender-reveal",
      mode: mode.id,
      board: Array.from({ length: mode.tileCount }, function emptyTile() { return null; }),
      teams: {},
      presence: {},
      pendingTeam: null,
      turn: 0,
      revealTurn: mode.revealAfterTurn + 1 + Math.floor(Math.random() * (mode.tileCount - mode.revealAfterTurn)),
      revealColor: "pink",
      revealDone: false,
      started: false
    };
  }

  async function refreshRoom() {
    if (!state.roomId) {
      return;
    }
    state.room = await backend.getRoom(state.roomId);
    if (!gameState(state.room)) {
      throw new Error("Wrong game room");
    }
    render();
  }

  function subscribe() {
    if (state.unsubscribe) {
      state.unsubscribe();
    }
    state.unsubscribe = backend.subscribe(function syncRoom(_, changedRoomId) {
      if (!changedRoomId || changedRoomId === state.roomId) {
        refreshRoom().catch(function ignoreRefreshError() {});
      }
    });
  }

  async function markPresence(connected) {
    if (!state.roomId || !state.playerId || !state.room || !gameState(state.room)) {
      return;
    }
    await backend.updateRoom(state.roomId, function update(room) {
      const reveal = room.revealState;
      reveal.presence = reveal.presence || {};
      reveal.presence[state.playerId] = {
        connected: connected,
        lastSeen: Date.now()
      };
    });
  }

  function startHeartbeat() {
    if (state.heartbeatId) {
      window.clearInterval(state.heartbeatId);
    }
    markPresence(true).catch(function ignorePresenceError() {});
    state.heartbeatId = window.setInterval(function heartbeat() {
      markPresence(true).catch(function ignorePresenceError() {});
    }, PRESENCE_INTERVAL);
  }

  function isOnline(playerId, reveal) {
    const presence = reveal.presence && reveal.presence[playerId];
    return Boolean(presence && presence.connected && Date.now() - Number(presence.lastSeen || 0) < PRESENCE_TIMEOUT);
  }

  async function createRoom(name, modeId) {
    const result = await backend.createRoom(name);
    state.roomId = result.roomId;
    state.playerId = result.playerId;
    state.playerName = name;
    state.room = result.room;
    await backend.updateRoom(state.roomId, function configureRoom(room) {
      room.revealState = initialRevealState(modeId);
      room.revealState.presence[result.playerId] = { connected: true, lastSeen: Date.now() };
    });
    state.room = await backend.getRoom(state.roomId);
    persistIdentity();
    window.history.replaceState({}, "", "gender-reveal.html?room=" + encodeURIComponent(state.roomId));
    subscribe();
    startHeartbeat();
    render();
  }

  async function joinRoom(roomId, name, team) {
    const roomSnapshot = await backend.getRoom(roomId);
    const existingSameName = (roomSnapshot.players || []).find(function findSameName(player) {
      return normalizeName(player.name) === normalizeName(name);
    });

    if (existingSameName && existingSameName.id !== state.playerId) {
      throw new Error("Name already taken");
    }

    const result = await backend.joinRoom(roomId, name);
    state.roomId = result.roomId;
    state.playerId = result.playerId;
    state.playerName = name;
    await backend.updateRoom(state.roomId, function selectTeam(room) {
      if (!gameState(room)) {
        throw new Error("Wrong game room");
      }
      room.revealState.teams = room.revealState.teams || {};
      room.revealState.presence = room.revealState.presence || {};
      if (!room.players.find(function findPlayer(player) { return player.id === state.playerId; }).isHost) {
        room.revealState.teams[state.playerId] = team;
      }
      room.revealState.presence[state.playerId] = { connected: true, lastSeen: Date.now() };
    });
    state.room = await backend.getRoom(state.roomId);
    persistIdentity();
    window.history.replaceState({}, "", "gender-reveal.html?room=" + encodeURIComponent(state.roomId));
    subscribe();
    startHeartbeat();
    render();
  }

  async function updateGame(mutator) {
    await backend.updateRoom(state.roomId, function update(room) {
      if (!gameState(room)) {
        throw new Error("Wrong game room");
      }
      mutator(room.revealState, room);
    });
    await refreshRoom();
  }

  async function startGame() {
    await updateGame(function begin(reveal) {
      reveal.started = true;
    });
  }

  async function authorizeTeam(team) {
    await updateGame(function authorize(reveal) {
      if (!reveal.revealDone && reveal.started && !reveal.pendingTeam) {
        reveal.pendingTeam = team;
      }
    });
  }

  async function flipTile(index) {
    await updateGame(function flip(reveal) {
      const ownTeam = reveal.teams[state.playerId];
      if (reveal.revealDone || !reveal.pendingTeam || reveal.board[index] || ownTeam !== reveal.pendingTeam) {
        return;
      }
      const nextTurn = Number(reveal.turn || 0) + 1;
      const isReveal = nextTurn === Number(reveal.revealTurn);
      reveal.board[index] = isReveal ? "pink" : reveal.pendingTeam;
      reveal.turn = nextTurn;
      reveal.pendingTeam = null;
      if (isReveal) {
        reveal.revealDone = true;
      }
    });
  }

  function renderSetup() {
    const joining = Boolean(query().get("room"));
    root.innerHTML = `
      <section class="room-card reveal-setup-card">
        <p class="eyebrow">Gender reveal à distance</p>
        <h2>${joining ? "Rejoindre la partie" : "Créer la partie"}</h2>
        <p class="panel-copy">${joining ? "Choisissez votre équipe, puis attendez que le maître du jeu vous donne une case." : "Créez le salon en tant que maître du jeu. Vous ne jouerez pas : vous gérerez les tours."}</p>
        ${state.error ? `<div class="note-panel" role="alert"><strong>Action impossible</strong><p>${escapeHtml(state.error)}</p></div>` : ""}
        <form id="reveal-setup-form" class="room-form">
          <label class="field-block"><span>Votre pseudo</span><input class="text-input" name="name" maxlength="24" value="${escapeHtml(state.playerName)}" required></label>
          ${!joining ? `
            <fieldset class="board-mode-picker">
              <legend>Format de la partie</legend>
              <label class="board-mode-option"><input type="radio" name="mode" value="classic" checked><span><strong>Grille classique</strong><small>25 cases · 5 × 5 · surprise après le 5e tour</small></span></label>
              <label class="board-mode-option"><input type="radio" name="mode" value="fast"><span><strong>Grille rapide</strong><small>9 cases · 3 × 3 · surprise après le 3e tour</small></span></label>
            </fieldset>
          ` : ""}
          ${joining ? `
            <fieldset class="team-choice-fieldset">
              <legend>Votre équipe</legend>
              <label class="team-choice shark-choice"><input type="radio" name="team" value="shark" checked><span>🦈 Requin</span><small>Équipe verte</small></label>
              <label class="team-choice fish-choice"><input type="radio" name="team" value="fish"><span>🐟 Poisson</span><small>Équipe mauve</small></label>
            </fieldset>
          ` : ""}
          <button class="primary-button" type="submit">${joining ? "Rejoindre le salon" : "Créer le salon"}</button>
        </form>
      </section>
    `;
    root.querySelector("#reveal-setup-form").addEventListener("submit", async function submit(event) {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const name = String(form.get("name") || "").trim();
      if (!name) {
        state.error = "Ajoutez un pseudo pour continuer.";
        renderSetup();
        return;
      }
      state.error = "";
      try {
        if (joining) {
          await joinRoom(query().get("room"), name, String(form.get("team") || "shark"));
        } else {
          await createRoom(name, String(form.get("mode") || "classic"));
        }
      } catch (error) {
        state.error = friendlyError(error, joining ? "join" : "create");
        renderSetup();
      }
    });
  }

  function playerList(reveal) {
    return state.room.players.map(function playerMarkup(player) {
      const team = teamFor(player.id);
      const online = isOnline(player.id, reveal);
      const label = player.isHost ? "Maître du jeu" : (team === "shark" ? "🦈 Requin" : "🐟 Poisson");
      return `<li class="reveal-player ${team ? "team-" + team : ""}"><span><strong>${escapeHtml(player.name)}</strong><small>${label}</small></span><em class="presence-dot ${online ? "online" : "offline"}">${online ? "En ligne" : "Déconnecté"}</em></li>`;
    }).join("");
  }

  function renderRoom() {
    const reveal = gameState(state.room);
    const mode = modeFor(reveal);
    const ownTeam = teamFor(state.playerId);
    const canFlip = reveal.started && !reveal.revealDone && reveal.pendingTeam && ownTeam === reveal.pendingTeam;
    const board = reveal.board.map(function tileMarkup(value, index) {
      const className = value ? " is-" + value : "";
      const label = value === "shark" ? "Case Requin" : value === "fish" ? "Case Poisson" : value === "pink" ? "Révélation rose" : value === "blue" ? "Révélation bleue" : "Case cachée";
      return `<button class="reveal-tile${className}" type="button" data-tile="${index}" ${!canFlip || value ? "disabled" : ""} aria-label="${label}">${value ? (value === "shark" ? "🦈" : value === "fish" ? "🐟" : "✨") : "?"}</button>`;
    }).join("");
    const actionMessage = reveal.revealDone
      ? "La case révélation a été trouvée !"
      : !reveal.started
        ? "Le maître du jeu peut lancer la grille quand tout le monde est prêt."
        : reveal.pendingTeam
          ? (isHost() ? `L'équipe ${reveal.pendingTeam === "shark" ? "Requin" : "Poisson"} peut retourner une case.` : (ownTeam === reveal.pendingTeam ? "Votre équipe peut retourner une case !" : "L'autre équipe choisit une case."))
          : "En attente du maître du jeu pour attribuer la prochaine case.";

    root.innerHTML = `
      <section class="reveal-game-layout">
        <article class="room-card reveal-board-card">
          <div class="reveal-heading">
            <div><p class="eyebrow">Grille surprise · ${escapeHtml(mode.label)}</p><h2>${mode.tileCount} cases à retourner</h2></div>
            <span class="turn-chip">${reveal.turn} tour${reveal.turn > 1 ? "s" : ""}</span>
          </div>
          <p class="panel-copy">${actionMessage}</p>
          <div class="reveal-board reveal-board-${mode.gridSize}" aria-label="Grille de ${mode.tileCount} cases">${board}</div>
          ${reveal.revealDone ? '<div class="final-reveal pink"><span>Gender reveal</span><strong>C\'est une fille !</strong></div>' : ""}
        </article>
        <aside class="reveal-sidebar">
          ${isHost() ? `
            <article class="room-card">
              <p class="eyebrow">Salon ${escapeHtml(state.roomId)}</p>
              <label class="field-block"><span>Lien à partager</span><input class="text-input" value="${escapeHtml(roomLink())}" readonly></label>
              <div class="share-actions">
                <button class="primary-button share-reveal-link" type="button">Partager l'invitation</button>
                <button class="ghost-button copy-reveal-link" type="button">Copier le lien</button>
              </div>
              <p class="presence-help">Dans Messenger, demandez aux joueurs d'utiliser le menu ⋮ puis « Ouvrir dans le navigateur » pour éviter les coupures.</p>
            </article>
          ` : ""}
          <article class="room-card">
            <p class="eyebrow">Participants</p>
            <ul class="reveal-player-list">${playerList(reveal)}</ul>
            <p class="presence-help">Une personne est indiquée déconnectée après environ une minute sans activité. Elle peut revenir avec le même lien et pseudo.</p>
          </article>
          ${isHost() ? `
            <article class="room-card host-controls">
              <p class="eyebrow">Commandes du maître du jeu</p>
              <h2>${reveal.started ? "Attribuer une case" : "Prêt à jouer ?"}</h2>
              ${!reveal.started ? '<button class="primary-button" type="button" id="start-reveal-game">Lancer la grille</button>' : `
                <div class="host-team-actions">
                  <button class="team-action shark-action" type="button" data-award="shark" ${reveal.pendingTeam || reveal.revealDone ? "disabled" : ""}>Donner une case aux Requins</button>
                  <button class="team-action fish-action" type="button" data-award="fish" ${reveal.pendingTeam || reveal.revealDone ? "disabled" : ""}>Donner une case aux Poissons</button>
                </div>
              `}
              <p class="reveal-pink-note"><strong>Révélation rose</strong><span>La case surprise est rose et apparaît aléatoirement après le ${mode.revealAfterTurn}e tour.</span></p>
            </article>
          ` : ""}
        </aside>
      </section>
    `;

    root.querySelectorAll("[data-tile]").forEach(function bindTile(tile) {
      tile.addEventListener("click", function chooseTile() {
        flipTile(Number(tile.dataset.tile)).catch(function ignoreTileError() {});
      });
    });
    const copyLinkButton = root.querySelector(".copy-reveal-link");
    if (copyLinkButton) {
      copyLinkButton.addEventListener("click", async function copyLink() {
        try {
          await navigator.clipboard.writeText(roomLink());
          this.textContent = "Lien copié";
        } catch (error) {
          this.textContent = "Copiez le lien ci-dessus";
        }
      });
    }
    const shareLinkButton = root.querySelector(".share-reveal-link");
    if (shareLinkButton) {
      shareLinkButton.addEventListener("click", async function shareLink() {
        const shareData = {
          title: "Grille Gender Reveal",
          text: "Rejoins notre partie Gender Reveal ! Choisis ton équipe et attends ta case.",
          url: roomLink()
        };
        try {
          if (navigator.share) {
            await navigator.share(shareData);
            return;
          }
          await navigator.clipboard.writeText(roomLink());
          this.textContent = "Lien copié";
        } catch (error) {
          if (error && error.name !== "AbortError") {
            this.textContent = "Copiez le lien ci-dessus";
          }
        }
      });
    }
    const startButton = root.querySelector("#start-reveal-game");
    if (startButton) {
      startButton.addEventListener("click", function start() { startGame().catch(function ignoreStartError() {}); });
    }
    root.querySelectorAll("[data-award]").forEach(function bindAward(button) {
      button.addEventListener("click", function award() { authorizeTeam(button.dataset.award).catch(function ignoreAwardError() {}); });
    });
  }

  function render() {
    if (!state.room || !gameState(state.room)) {
      renderSetup();
      return;
    }
    renderRoom();
  }

  async function bootstrap() {
    try {
      await Promise.resolve(window.multiplayerBackendReady);
      backend = window.multiplayerBackend;
      restoreIdentity();
      if (state.roomId && state.playerId) {
        state.room = await backend.getRoom(state.roomId);
        if (!gameState(state.room) || !state.room.players.some(function hasSavedPlayer(player) { return player.id === state.playerId; })) {
          state.room = null;
        } else {
          subscribe();
          startHeartbeat();
        }
      }
    } catch (error) {
      state.room = null;
    }
    render();
  }

  document.addEventListener("visibilitychange", function visibleAgain() {
    if (document.visibilityState === "visible") {
      markPresence(true).catch(function ignorePresenceError() {});
      refreshRoom().catch(function ignoreRefreshError() {});
    }
  });
  window.addEventListener("pagehide", function leavingPage() {
    markPresence(false).catch(function ignorePresenceError() {});
  });

  bootstrap();
})();