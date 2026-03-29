(function () {
  const root = document.getElementById("quiz-root");

  if (!root || !window.quizContent) {
    return;
  }

  const state = {
    currentQuestion: 0,
    answers: [],
    selectedAvatar: null,
    checkedQuestions: []
  };

  const totalQuestions = window.quizContent.questions.length;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getPlantSvg(questionNumber) {
    const stage = Math.min(questionNumber + 1, totalQuestions);
    const stemHeight = 14 + stage * 4;
    const topY = 70 - stemHeight;
    const leafOpacity = Math.max(0.35, stage / totalQuestions);
    const bloomVisible = stage >= totalQuestions;

    return `
      <svg viewBox="0 0 92 88" class="plant-svg" role="img" aria-label="Plante en croissance">
        <rect x="28" y="66" width="36" height="14" rx="5" fill="#9b6b43"></rect>
        <rect x="24" y="78" width="44" height="6" rx="3" fill="#7a5233"></rect>
        <path d="M46 66 L46 ${topY}" fill="none" stroke="#2f8f56" stroke-width="4" stroke-linecap="round"></path>
        <path d="M46 ${Math.max(54, topY + 18)} C34 ${Math.max(48, topY + 12)}, 30 ${Math.max(42, topY + 20)}, 40 ${Math.max(38, topY + 28)}" fill="#76c36a" opacity="${leafOpacity}"></path>
        <path d="M46 ${Math.max(48, topY + 10)} C58 ${Math.max(42, topY + 4)}, 63 ${Math.max(38, topY + 14)}, 52 ${Math.max(34, topY + 22)}" fill="#57aa5c" opacity="${leafOpacity}"></path>
        ${stage >= 4 ? `<path d="M46 ${Math.max(42, topY + 8)} C37 ${Math.max(36, topY + 4)}, 35 ${Math.max(31, topY + 12)}, 43 ${Math.max(28, topY + 18)}" fill="#8ad17f" opacity="${leafOpacity}"></path>` : ""}
        ${stage >= 6 ? `<path d="M46 ${Math.max(36, topY + 2)} C56 ${Math.max(30, topY - 2)}, 59 ${Math.max(25, topY + 7)}, 49 ${Math.max(22, topY + 14)}" fill="#69bc63" opacity="${leafOpacity}"></path>` : ""}
        ${bloomVisible ? '<circle cx="46" cy="18" r="7" fill="#ffc857"></circle><circle cx="40" cy="22" r="5" fill="#ef6b58"></circle><circle cx="52" cy="22" r="5" fill="#ef6b58"></circle>' : '<circle cx="46" cy="20" r="4" fill="#9fd08c"></circle>'}
      </svg>
    `;
  }

  function getProgressMarkup(questionNumber) {
    const step = questionNumber + 1;
    const progressPercent = totalQuestions > 1 ? ((step - 1) / (totalQuestions - 1)) * 100 : 0;

    return `
      <div class="progress-card">
        <div class="progress-copy">
          <span>Question ${step} / ${totalQuestions}</span>
          <strong>${step >= 7 ? "Bien avance" : "Progression"}</strong>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${progressPercent}%;"></div>
          <div class="plant-badge" style="left: calc(${progressPercent}% - 30px);">
            ${getPlantSvg(questionNumber)}
          </div>
        </div>
      </div>
    `;
  }

  function getAvatarInitials(name) {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .replace(/\//g, "")
      .slice(0, 2)
      .toUpperCase();
  }

  function getAvatarFace(seed) {
    const faces = {
      dad: { skin: "#f2c7a5", hair: "#2c2b30", shirt: "#197278" },
      mom: { skin: "#f4cfb1", hair: "#5f4339", shirt: "#ef6b58" },
      siblings: { skin: "#f0c39d", hair: "#3c5b6f", shirt: "#ffc857" },
      friends: { skin: "#eac09f", hair: "#263238", shirt: "#7a9e7e" }
    };
    const palette = faces[seed] || faces.friends;

    return `
      <svg viewBox="0 0 88 88" class="mii-svg" role="img" aria-label="Avatar">
        <circle cx="44" cy="44" r="40" fill="#ffffff"></circle>
        <path d="M23 35 C24 16, 64 14, 65 35 L65 39 L23 39 Z" fill="${palette.hair}"></path>
        <ellipse cx="44" cy="41" rx="21" ry="24" fill="${palette.skin}"></ellipse>
        <circle cx="36" cy="40" r="2.4" fill="#173247"></circle>
        <circle cx="52" cy="40" r="2.4" fill="#173247"></circle>
        <path d="M39 53 C43 57, 49 57, 53 53" fill="none" stroke="#b75d4b" stroke-width="2.8" stroke-linecap="round"></path>
        <path d="M24 67 C29 57, 59 57, 64 67 L64 80 L24 80 Z" fill="${palette.shirt}"></path>
      </svg>
    `;
  }

  function renderQuestion() {
    const question = window.quizContent.questions[state.currentQuestion];
    const chosenIndex = state.answers[state.currentQuestion];
    const isChecked = Boolean(state.checkedQuestions[state.currentQuestion]);
    const choiceMarkup = question.choices.map((choice, index) => `
      <label class="choice-card ${chosenIndex === index ? "active" : ""} ${isChecked && index === question.answer ? "correct" : ""} ${isChecked && chosenIndex === index && index !== question.answer ? "incorrect" : ""}">
        <input type="radio" name="answer" value="${index}" ${chosenIndex === index ? "checked" : ""} ${isChecked ? "disabled" : ""}>
        <span class="choice-letter">${String.fromCharCode(65 + index)}</span>
        <span class="choice-text">${escapeHtml(choice)}</span>
      </label>
    `).join("");

    root.innerHTML = `
      ${getProgressMarkup(state.currentQuestion)}
      <section class="question-panel">
        <p class="eyebrow">Quiz</p>
        <h1>${escapeHtml(question.prompt)}</h1>
        <form id="quiz-form" class="choices-form">
          ${choiceMarkup}
          <p class="inline-fact ${isChecked ? "show-fact" : ""}">${isChecked ? escapeHtml(question.fact) : ""}</p>
          <div class="action-row">
            <button type="button" class="ghost-button" id="prev-button" ${state.currentQuestion === 0 ? "disabled" : ""}>Precedent</button>
            <button type="submit" class="primary-button" ${typeof chosenIndex === "number" ? "" : "disabled"}>${isChecked ? (state.currentQuestion === totalQuestions - 1 ? "Voir le resultat" : "Suivant") : "Valider"}</button>
          </div>
        </form>
      </section>
    `;

    const form = root.querySelector("#quiz-form");
    const prevButton = root.querySelector("#prev-button");

    form.addEventListener("change", (event) => {
      if (isChecked) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      state.answers[state.currentQuestion] = Number(target.value);
      renderQuestion();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (typeof state.answers[state.currentQuestion] !== "number") {
        return;
      }

      if (!state.checkedQuestions[state.currentQuestion]) {
        state.checkedQuestions[state.currentQuestion] = true;
        renderQuestion();
        return;
      }

      if (state.currentQuestion === totalQuestions - 1) {
        renderResult();
        return;
      }

      state.currentQuestion += 1;
      renderQuestion();
    });

    prevButton.addEventListener("click", () => {
      if (state.currentQuestion === 0) {
        return;
      }

      state.currentQuestion -= 1;
      renderQuestion();
    });
  }

  function renderResult() {
    const avatar = state.selectedAvatar || window.quizContent.avatars[0];
    const revealText = window.quizContent.revealByRole[avatar.role] || window.quizContent.revealByRole["tata-tonton"];

    root.innerHTML = `
      <section class="result-panel final-panel">
        <p class="eyebrow">${escapeHtml(window.quizContent.result.eyebrow)}</p>
        <div class="final-avatar-chip">
          <span class="avatar-portrait large-portrait">${getAvatarFace(avatar.id)}</span>
          <strong>${escapeHtml(avatar.name)}</strong>
        </div>
        <p class="panel-copy">${escapeHtml(window.quizContent.result.lead)}</p>
        <h1>${escapeHtml(revealText)}</h1>
        <p class="result-highlight">${escapeHtml(window.quizContent.result.outro)}</p>
        <div class="action-row result-actions">
          <a class="ghost-button as-link" href="index.html">Retour</a>
          <button type="button" class="primary-button" id="restart-button">Rejouer</button>
        </div>
      </section>
    `;

    root.querySelector("#restart-button").addEventListener("click", () => {
      state.currentQuestion = 0;
      state.answers = [];
      state.checkedQuestions = [];
      renderQuestion();
    });
  }

  try {
    const storedAvatarId = window.sessionStorage.getItem("tefenua-avatar");
    state.selectedAvatar = window.quizContent.avatars.find((avatar) => avatar.id === storedAvatarId) || window.quizContent.avatars[0];
  } catch (error) {
    state.selectedAvatar = window.quizContent.avatars[0];
  }

  renderQuestion();
})();