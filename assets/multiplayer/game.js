(function () {
  const root = document.getElementById("multiplayer-root");
  const data = window.wordGameData;
  let backend = null;

  if (!root || !data) {
    return;
  }

  const state = {
    room: null,
    roomId: null,
    playerId: null,
    playerName: "",
    setupError: "",
    finalRevealOpen: false,
    unsubscribe: null,
    countdownId: null,
    countdownRemaining: null,
    lastRevealTimeout: null
  };

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getQuery() {
    return new URLSearchParams(window.location.search);
  }

  function persistIdentity() {
    try {
      window.sessionStorage.setItem("scatter-room-id", state.roomId || "");
      window.sessionStorage.setItem("scatter-player-id", state.playerId || "");
      window.sessionStorage.setItem("scatter-player-name", state.playerName || "");
    } catch (error) {
      // Ignore persistence issues.
    }
  }

  function clearStoredRoomIdentity() {
    try {
      window.sessionStorage.removeItem("scatter-room-id");
      window.sessionStorage.removeItem("scatter-player-id");
    } catch (error) {
      // Ignore persistence issues.
    }
  }

  function restoreIdentity() {
    const query = getQuery();
    const queryRoomId = query.get("room") || "";
    const queryPlayerId = query.get("player") || "";
    const queryPlayerName = query.get("name") || "";

    try {
      if (!queryRoomId) {
        clearStoredRoomIdentity();
        state.roomId = "";
        state.playerId = "";
        state.playerName = window.sessionStorage.getItem("scatter-player-name") || "";
        return;
      }

      state.roomId = queryRoomId;
      state.playerId = queryPlayerId || window.sessionStorage.getItem("scatter-player-id") || "";
      state.playerName = queryPlayerName || window.sessionStorage.getItem("scatter-player-name") || "";
    } catch (error) {
      state.roomId = queryRoomId;
      state.playerId = queryPlayerId;
      state.playerName = queryPlayerName;
    }
  }

  function playerForId(playerId) {
    return state.room ? state.room.players.find((player) => player.id === playerId) : null;
  }

  function getCurrentPlayer() {
    return playerForId(state.playerId);
  }

  function isHost() {
    const player = getCurrentPlayer();
    return Boolean(player && player.isHost);
  }

  function roomLink() {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("room", state.roomId || "");
    return url.toString();
  }

  function friendlySetupError(error, intent) {
    const message = error && error.message ? String(error.message) : "";
    const normalized = message.toLowerCase();

    if (intent === "join" && normalized.includes("room not found")) {
      return "Aucun salon ne correspond a ce code.";
    }

    if (
      normalized.includes("row-level security") ||
      normalized.includes("permission denied") ||
      normalized.includes("not allowed") ||
      normalized.includes("violates row-level security")
    ) {
      return "Supabase refuse actuellement l'acces aux tables du jeu. Reexecute le schema SQL dans Supabase pour appliquer les autorisations du petit bac.";
    }

    if (normalized.includes("failed to fetch") || normalized.includes("network")) {
      return "La connexion au service multijoueur a echoue. Verifie le deploiement Vercel et les variables SUPABASE_URL et SUPABASE_ANON_KEY.";
    }

    return intent === "join"
      ? "Impossible de rejoindre ce salon pour le moment."
      : "Impossible de creer un salon pour le moment.";
  }

  function roundAt(index) {
    return state.room && state.room.rounds ? state.room.rounds[index] : null;
  }

  function currentRound() {
    return roundAt(state.room.currentRoundIndex || 0);
  }

  function roomSubmissionKey(roundNumber) {
    return String(roundNumber);
  }

  function playerAnswers(roundNumber, playerId) {
    const roundSubmissions = (state.room.submissions || {})[roomSubmissionKey(roundNumber)] || {};
    return roundSubmissions[playerId] || { answers: {}, finishedAt: null };
  }

  function scoreEntries(roundNumber, categoryIndex) {
    const roundEntries = (state.room.scoreEntries || {})[roomSubmissionKey(roundNumber)] || {};
    return roundEntries[String(categoryIndex)] || {};
  }

  function duplicateInfo(roundNumber, categoryIndex) {
    const round = roundAt(roundNumber - 1);
    if (!round) {
      return { values: {}, duplicates: new Set() };
    }

    const answersByPlayer = {};
    const normalizedCounts = {};

    state.room.players.forEach((player) => {
      const entry = playerAnswers(roundNumber, player.id);
      const answer = (entry.answers[String(categoryIndex)] || "").trim();
      answersByPlayer[player.id] = answer;
      if (answer) {
        const normalized = answer.toLowerCase();
        normalizedCounts[normalized] = (normalizedCounts[normalized] || 0) + 1;
      }
    });

    const duplicates = new Set(
      Object.keys(normalizedCounts).filter((value) => normalizedCounts[value] > 1)
    );

    return { values: answersByPlayer, duplicates };
  }

  function stopLocalCountdown() {
    if (state.countdownId) {
      window.clearInterval(state.countdownId);
      state.countdownId = null;
    }
  }

  function updateTimerChip() {
    const timerChip = root.querySelector("[data-timer-chip]");
    if (!timerChip) {
      return;
    }

    if (state.countdownRemaining !== null) {
      timerChip.textContent = state.countdownRemaining + "s";
      timerChip.classList.add("timer-live");
      return;
    }

    timerChip.textContent = "En cours";
    timerChip.classList.remove("timer-live");
  }

  function isEditingAnswer() {
    const activeElement = document.activeElement;
    return Boolean(activeElement && root.contains(activeElement) && activeElement.hasAttribute("data-category-index"));
  }

  function syncCountdown() {
    stopLocalCountdown();
    if (!state.room || !state.room.timer || !state.room.timer.endsAt) {
      state.countdownRemaining = null;
      updateTimerChip();
      return;
    }

    const tick = function tick() {
      const remaining = Math.max(0, Math.ceil((state.room.timer.endsAt - Date.now()) / 1000));
      state.countdownRemaining = remaining;
      if (remaining <= 0) {
        stopLocalCountdown();
      }
      updateTimerChip();
    };

    tick();
    state.countdownId = window.setInterval(tick, 500);
  }

  async function refreshRoom(options) {
    if (!state.roomId) {
      return;
    }

    const nextRoom = await backend.getRoom(state.roomId);
    const preserveInput = Boolean(options && options.preserveInput);
    const shouldPreserveInput = preserveInput && isEditingAnswer() && state.room && state.room.stage === "playing" && nextRoom.stage === "playing";

    state.room = nextRoom;
    syncCountdown();

    if (shouldPreserveInput) {
      return;
    }

    render();
  }

  function subscribeToRoom() {
    if (state.unsubscribe) {
      state.unsubscribe();
    }

    state.unsubscribe = backend.subscribe(function handleSync(_, changedRoomId) {
      if (!state.roomId || (changedRoomId && changedRoomId !== state.roomId)) {
        return;
      }
      refreshRoom({ preserveInput: true });
    });
  }

  async function createRoom(playerName) {
    const result = await backend.createRoom(playerName);
    state.roomId = result.roomId;
    state.playerId = result.playerId;
    state.playerName = playerName;
    state.room = result.room;
    persistIdentity();
    subscribeToRoom();
    window.history.replaceState({}, "", `multiplayer.html?room=${state.roomId}&player=${state.playerId}&name=${encodeURIComponent(playerName)}`);
    render();
  }

  async function joinRoom(roomId, playerName) {
    const result = await backend.joinRoom(roomId, playerName);
    state.roomId = result.roomId;
    state.playerId = result.playerId;
    state.playerName = playerName;
    state.room = result.room;
    persistIdentity();
    subscribeToRoom();
    window.history.replaceState({}, "", `multiplayer.html?room=${state.roomId}&player=${state.playerId}&name=${encodeURIComponent(playerName)}`);
    render();
  }

  async function startGame() {
    await backend.updateRoom(state.roomId, function update(room) {
      room.stage = "playing";
      room.currentRoundIndex = 0;
      room.currentValidationCategoryIndex = 0;
      room.timer = null;
      room.finisherId = null;
      room.revealState = { showHostFinal: false };
      room.rounds = data.generateRounds();
      room.submissions = {};
      room.scoreEntries = {};
    });
    state.finalRevealOpen = false;
    refreshRoom();
  }

  async function saveAnswer(roundNumber, categoryIndex, value) {
    await backend.updateRoom(state.roomId, function update(room) {
      const roundKey = roomSubmissionKey(roundNumber);
      room.submissions[roundKey] = room.submissions[roundKey] || {};
      room.submissions[roundKey][state.playerId] = room.submissions[roundKey][state.playerId] || { answers: {}, finishedAt: null };
      room.submissions[roundKey][state.playerId].answers[String(categoryIndex)] = value;
    });
  }

  async function finishRound() {
    const round = currentRound();
    if (!round) {
      return;
    }

    await backend.updateRoom(state.roomId, function update(room) {
      const roundNumber = round.roundNumber;
      const roundKey = roomSubmissionKey(roundNumber);
      room.submissions[roundKey] = room.submissions[roundKey] || {};
      room.submissions[roundKey][state.playerId] = room.submissions[roundKey][state.playerId] || { answers: {}, finishedAt: null };
      room.submissions[roundKey][state.playerId].finishedAt = Date.now();

      if (!room.timer) {
        room.finisherId = state.playerId;
        room.timer = {
          startedAt: Date.now(),
          endsAt: Date.now() + 10000
        };
      }
    });

    refreshRoom();
  }

  async function forceValidation() {
    await backend.updateRoom(state.roomId, function update(room) {
      room.stage = "validation";
      room.currentValidationCategoryIndex = 0;
      room.timer = null;
    });
    refreshRoom();
  }

  async function applyCategoryScores(scoresByPlayer) {
    const round = currentRound();
    const categoryIndex = state.room.currentValidationCategoryIndex;
    await backend.updateRoom(state.roomId, function update(room) {
      const roundKey = roomSubmissionKey(round.roundNumber);
      room.scoreEntries[roundKey] = room.scoreEntries[roundKey] || {};
      room.scoreEntries[roundKey][String(categoryIndex)] = scoresByPlayer;

      room.players.forEach(function updatePlayer(player) {
        const previousRoundEntries = room.scoreEntries[roundKey];
        let total = 0;
        Object.keys(previousRoundEntries).forEach(function sumCategory(key) {
          total += Number(previousRoundEntries[key][player.id] || 0);
        });
        const earlierRounds = Object.keys(room.scoreEntries).filter((key) => key !== roundKey);
        earlierRounds.forEach(function sumRound(key) {
          Object.keys(room.scoreEntries[key]).forEach(function sumCategoryScores(categoryKey) {
            total += Number(room.scoreEntries[key][categoryKey][player.id] || 0);
          });
        });
        player.score = total;
      });

      if (room.currentValidationCategoryIndex >= round.categories.length - 1) {
        if (room.currentRoundIndex >= room.rounds.length - 1) {
          room.stage = "finished";
          room.revealState = { showHostFinal: true };
        } else {
          room.stage = "round-summary";
        }
      } else {
        room.currentValidationCategoryIndex += 1;
      }
    });
    refreshRoom();
  }

  async function continueAfterSummary() {
    await backend.updateRoom(state.roomId, function update(room) {
      room.stage = "playing";
      room.currentRoundIndex += 1;
      room.currentValidationCategoryIndex = 0;
      room.timer = null;
      room.finisherId = null;
      room.revealState = { showHostFinal: false };
    });
    state.finalRevealOpen = false;
    refreshRoom();
  }

  function renderSetup() {
    const noteTitle = backend && backend.mode === "supabase" ? "Salon en ligne" : "Mode local";
    const noteCopy = backend && backend.mode === "supabase"
      ? "Invitez vos proches avec le lien ou le code du salon, puis laissez l'hote lancer la prochaine manche au bon moment."
      : "Le mode multijoueur reste local tant que la configuration Supabase n'est pas active.";

    root.innerHTML = `
      <section class="room-card">
        <p class="eyebrow">Salon prive</p>
        <h2>Creer ou rejoindre un salon</h2>
        ${state.setupError ? `<div class="note-panel" role="alert"><strong>Action impossible</strong><p>${escapeHtml(state.setupError)}</p></div>` : ""}
        <form id="room-form" class="room-form">
          <label class="field-block">
            <span>Pseudo</span>
            <input class="text-input" name="name" maxlength="24" placeholder="Ex. Mereh" value="${escapeHtml(state.playerName || "")}" required>
          </label>
          <label class="field-block">
            <span>Code du salon</span>
            <input class="text-input" name="room" maxlength="6" placeholder="A renseigner pour rejoindre" value="${escapeHtml((state.roomId || "").toUpperCase())}">
          </label>
          <div class="action-row room-actions">
            <button class="primary-button" type="submit" name="intent" value="create">Creer un salon</button>
            <button class="ghost-button" type="submit" name="intent" value="join">Rejoindre un salon</button>
          </div>
        </form>
        <div class="note-panel">
          <strong>${escapeHtml(noteTitle)}</strong>
          <p>${escapeHtml(noteCopy)}</p>
        </div>
      </section>
    `;

    const form = root.querySelector("#room-form");
    form.addEventListener("submit", async function handleSubmit(event) {
      event.preventDefault();
      const submitter = event.submitter;
      const formData = new FormData(form);
      const name = String(formData.get("name") || "").trim();
      const roomId = String(formData.get("room") || "").trim().toUpperCase();
      const intent = submitter ? submitter.value : "create";

      state.setupError = "";

      if (!name) {
        state.setupError = "Ajoute un pseudo pour continuer.";
        renderSetup();
        return;
      }

      if (intent === "join" && !roomId) {
        state.setupError = "Renseigne le code du salon pour rejoindre une partie.";
        renderSetup();
        return;
      }

      try {
        if (intent === "join") {
          await joinRoom(roomId, name);
          return;
        }

        await createRoom(name);
      } catch (error) {
        state.setupError = friendlySetupError(error, intent);
        renderSetup();
      }
    });
  }

  function renderLobby() {
    const playersMarkup = state.room.players.map(function mapPlayer(player) {
      return `
        <article class="player-pill ${player.isHost ? "host-pill" : ""}">
          <strong>${escapeHtml(player.name)}</strong>
          <span>${player.isHost ? "Hote" : "Joueur"}</span>
        </article>
      `;
    }).join("");

    root.innerHTML = `
      <section class="room-grid">
        <article class="room-card">
          <p class="eyebrow">Salon</p>
          <h2>${escapeHtml(state.room.id)}</h2>
          <p class="panel-copy">Partagez ce lien ou le code du salon pour reunir toute la famille dans la meme partie.</p>
          <label class="field-block">
            <span>Lien d'invitation</span>
            <input class="text-input" value="${escapeHtml(roomLink())}" readonly>
          </label>
          <div class="action-row room-actions">
            <button class="ghost-button" type="button" id="copy-link">Copier le lien</button>
            ${isHost() ? '<button class="primary-button" type="button" id="start-room">Lancer une manche</button>' : ''}
          </div>
        </article>
        <article class="room-card">
          <p class="eyebrow">Joueurs</p>
          <div class="player-list">${playersMarkup}</div>
        </article>
      </section>
    `;

    const copyButton = root.querySelector("#copy-link");
    if (copyButton) {
      copyButton.addEventListener("click", async function handleCopy() {
        try {
          await navigator.clipboard.writeText(roomLink());
          copyButton.textContent = "Lien copie";
        } catch (error) {
          copyButton.textContent = "Copie manuelle";
        }
      });
    }

    const startButton = root.querySelector("#start-room");
    if (startButton) {
      startButton.addEventListener("click", startGame);
    }
  }

  function renderPlaying() {
    const round = currentRound();
    const roundAnswers = playerAnswers(round.roundNumber, state.playerId);
    const finisher = playerForId(state.room.finisherId);
    const categoriesMarkup = round.categories.map(function mapCategory(category, index) {
      const value = escapeHtml(roundAnswers.answers[String(index)] || "");
      return `
        <label class="field-block category-field">
          <span>${index + 1}. ${escapeHtml(category)}</span>
          <input class="text-input" data-category-index="${index}" maxlength="40" value="${value}" placeholder="${escapeHtml(round.letter)}...">
        </label>
      `;
    }).join("");

    root.innerHTML = `
      <section>
        <article class="room-card round-card">
          <div class="round-header">
            <div>
              <p class="eyebrow">Manche ${round.roundNumber}</p>
              <h2>Lettre ${escapeHtml(round.letter)}</h2>
            </div>
            <div class="timer-chip ${state.countdownRemaining !== null ? "timer-live" : ""}" data-timer-chip>
              ${state.countdownRemaining !== null ? `${state.countdownRemaining}s` : "En cours"}
            </div>
          </div>
          <form id="answers-form" class="category-grid">${categoriesMarkup}</form>
          <div class="action-row room-actions">
            <button class="ghost-button" type="button" id="finish-button">Je termine</button>
            ${isHost() ? '<button class="primary-button" type="button" id="force-validation">Ouvrir la validation</button>' : ''}
          </div>
          ${finisher ? `<p class="inline-fact show-fact">${escapeHtml(finisher.name)} a termine. Le chrono final est lance pour tout le salon.</p>` : ""}
        </article>
      </section>
    `;

    root.querySelectorAll("[data-category-index]").forEach(function bindInput(input) {
      input.addEventListener("change", function handleChange() {
        saveAnswer(round.roundNumber, Number(input.dataset.categoryIndex), input.value.trim());
      });
    });

    root.querySelector("#finish-button").addEventListener("click", finishRound);

    const forceValidationButton = root.querySelector("#force-validation");
    if (forceValidationButton) {
      forceValidationButton.addEventListener("click", forceValidation);
    }
  }

  function renderValidation() {
    const round = currentRound();
    const categoryIndex = state.room.currentValidationCategoryIndex;
    const categoryName = round.categories[categoryIndex];
    const duplicates = duplicateInfo(round.roundNumber, categoryIndex);
    const existingScores = scoreEntries(round.roundNumber, categoryIndex);
    const isFinalRevealCategory = round.roundNumber === state.room.rounds.length && categoryIndex === round.categories.length - 1;

    const cardsMarkup = state.room.players.map(function mapPlayer(player) {
      const answer = duplicates.values[player.id] || "";
      const normalized = answer.trim().toLowerCase();
      const duplicateClass = isFinalRevealCategory
        ? "secret-answer"
        : normalized && duplicates.duplicates.has(normalized) ? "duplicate-answer" : "unique-answer";
      const finisherPenaltyHint = state.room.finisherId === player.id ? "A coupe le chrono" : "";
      const currentScore = Number(existingScores[player.id] || 0);
      const statusLabel = isFinalRevealCategory
        ? "Carte finale scellee"
        : duplicateClass === "duplicate-answer" ? "Reponse partagee" : "Reponse originale";
      const answerMarkup = isFinalRevealCategory ? "Mot final masque" : escapeHtml(answer || "-");

      return `
        <article class="validation-card ${duplicateClass}" data-player-id="${player.id}">
          <header>
            <strong>${escapeHtml(player.name)}</strong>
            <span>${escapeHtml(statusLabel)}</span>
          </header>
          <p class="validation-answer ${isFinalRevealCategory ? "masked-validation-answer" : ""}">${answerMarkup}</p>
          <small>${escapeHtml(finisherPenaltyHint)}</small>
          ${isHost() ? `
            <div class="score-picker">
              <button type="button" class="score-button ${currentScore === -1 ? "picked" : ""}" data-score="-1">-1</button>
              <button type="button" class="score-button ${currentScore === 1 ? "picked" : ""}" data-score="1">+1</button>
              <button type="button" class="score-button ${currentScore === 2 ? "picked" : ""}" data-score="2">+2</button>
            </div>
          ` : ""}
        </article>
      `;
    }).join("");

    root.innerHTML = `
      <section class="room-card validation-shell">
        <div class="round-header">
          <div>
            <p class="eyebrow">Validation en direct</p>
            <h2>${categoryIndex + 1}. ${escapeHtml(categoryName)}</h2>
          </div>
          <div class="timer-chip">Manche ${round.roundNumber}</div>
        </div>
        <p class="panel-copy">${isFinalRevealCategory ? "La derniere carte reste volontairement masquee jusqu'a l'annonce finale." : "Attribuez les points categorie par categorie. Les reponses proches ressortent tout de suite pour accelerer l'arbitrage."}</p>
        <div class="validation-grid">${cardsMarkup}</div>
        <div class="action-row room-actions">
          ${isHost() ? '<button class="primary-button" type="button" id="save-category">Valider la categorie</button>' : '<div class="note-panel"><p>En attente de la validation de l\'hote.</p></div>'}
        </div>
      </section>
    `;

    if (!isHost()) {
      return;
    }

    const scores = {};
    state.room.players.forEach(function initPlayer(player) {
      scores[player.id] = Number(existingScores[player.id] || 0);
    });

    root.querySelectorAll(".validation-card").forEach(function bindCard(card) {
      card.querySelectorAll("[data-score]").forEach(function bindButton(button) {
        button.addEventListener("click", function handleScore() {
          const playerId = card.dataset.playerId;
          scores[playerId] = Number(button.dataset.score);
          card.querySelectorAll(".score-button").forEach(function reset(other) {
            other.classList.remove("picked");
          });
          button.classList.add("picked");
        });
      });
    });

    root.querySelector("#save-category").addEventListener("click", function handleSave() {
      applyCategoryScores(scores);
    });
  }

  function renderSummary() {
    const playersMarkup = state.room.players
      .slice()
      .sort(function sortByScore(left, right) { return right.score - left.score; })
      .map(function mapPlayer(player) {
        return `<li><strong>${escapeHtml(player.name)}</strong><span>${player.score} pts</span></li>`;
      }).join("");

    root.innerHTML = `
      <section class="room-card summary-card">
        <p class="eyebrow">Fin de manche</p>
        <h2>Classement provisoire</h2>
        <ol class="leaderboard-list">${playersMarkup}</ol>
        ${isHost() ? '<button class="primary-button" type="button" id="next-round">Lancer la manche suivante</button>' : '<p class="panel-copy">L\'hote prepare la manche suivante.</p>'}
      </section>
    `;

    const nextButton = root.querySelector("#next-round");
    if (nextButton) {
      nextButton.addEventListener("click", continueAfterSummary);
    }
  }

  function renderFinished() {
    const round = currentRound();
    const categoryName = round ? round.categories[9] : data.finalRound.finalCategory;
    const host = playerForId(state.room.hostId);
    const hostAnswer = host ? (playerAnswers(3, host.id).answers["9"] || data.finalRound.suggestedAnswer) : data.finalRound.suggestedAnswer;
    const finalAnswersMarkup = state.room.players
      .map(function mapFinalAnswer(player) {
        const answer = playerAnswers(3, player.id).answers["9"] || "-";
        return `
          <article class="final-answer-card ${player.isHost ? "host-answer-card" : ""}">
            <span>${escapeHtml(player.name)}</span>
            <strong>${escapeHtml(answer)}</strong>
          </article>
        `;
      }).join("");
    const playersMarkup = state.room.players
      .slice()
      .sort(function sortByScore(left, right) { return right.score - left.score; })
      .map(function mapPlayer(player) {
        return `<li><strong>${escapeHtml(player.name)}</strong><span>${player.score} pts</span></li>`;
      }).join("");

    root.innerHTML = `
      <section class="room-grid">
        <article class="room-card final-room-card">
          <p class="eyebrow">Annonce</p>
          <div class="surprise-stage ${state.finalRevealOpen ? "surprise-stage-open" : ""}">
            <span class="reveal-label">Derniere carte</span>
            <h2>${state.finalRevealOpen ? escapeHtml(data.finalRound.announcementTitle) : "Tout tenait dans un dernier mot en B..."}</h2>
            <p class="panel-copy">${state.finalRevealOpen ? escapeHtml(data.finalRound.announcementCopy) : `Gardez le suspense encore une seconde, puis ouvrez la derniere carte pour decouvrir l'annonce finale.`}</p>
            ${state.finalRevealOpen ? "" : '<button class="primary-button" type="button" id="reveal-announcement">Decouvrir l\'annonce</button>'}
          </div>
          <div class="host-reveal-panel ${state.finalRevealOpen ? "visible-reveal" : ""}">
            <span class="reveal-label">${escapeHtml(categoryName)}</span>
            <strong>${escapeHtml(hostAnswer || data.finalRound.suggestedAnswer)}</strong>
          </div>
          ${state.finalRevealOpen ? `<div class="final-answer-grid">${finalAnswersMarkup}</div>` : ""}
        </article>
        <article class="room-card summary-card">
          <p class="eyebrow">Classement</p>
          <ol class="leaderboard-list">${playersMarkup}</ol>
        </article>
      </section>
    `;

    const revealButton = root.querySelector("#reveal-announcement");
    if (revealButton) {
      revealButton.addEventListener("click", function handleReveal() {
        state.finalRevealOpen = true;
        renderFinished();
      });
    }
  }

  function render() {
    if (!state.room) {
      renderSetup();
      return;
    }

    if (state.room.stage === "lobby") {
      renderLobby();
      return;
    }

    if (state.room.stage === "playing") {
      renderPlaying();
      return;
    }

    if (state.room.stage === "validation") {
      renderValidation();
      return;
    }

    if (state.room.stage === "round-summary") {
      renderSummary();
      return;
    }

    renderFinished();
  }

  async function bootstrap() {
    try {
      await Promise.resolve(window.multiplayerBackendReady);
    } catch (error) {
      // Ignore initialization errors and use any available fallback backend.
    }

    backend = window.multiplayerBackend;

    if (!backend) {
      root.innerHTML = `
        <section class="room-card">
          <p class="eyebrow">Indisponible</p>
          <h2>Le mode multijoueur ne peut pas demarrer</h2>
          <p class="panel-copy">La configuration du backend n'a pas pu etre chargee.</p>
        </section>
      `;
      return;
    }

    restoreIdentity();
    if (!state.roomId || !state.playerId) {
      state.room = null;
      renderSetup();
      return;
    }

    subscribeToRoom();
    try {
      state.room = await backend.getRoom(state.roomId);
      persistIdentity();
      render();
    } catch (error) {
      state.room = null;
      renderSetup();
    }
  }

  bootstrap();
})();