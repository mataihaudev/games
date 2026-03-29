(function () {
  const avatarRoot = document.getElementById("avatar-selector");
  const startLink = document.getElementById("start-quiz-link");

  if (!avatarRoot || !startLink || !window.quizContent) {
    return;
  }

  let selectedAvatarId = null;

  function getInitials(name) {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .replace(/\//g, "")
      .slice(0, 2)
      .toUpperCase();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
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

  function render() {
    avatarRoot.innerHTML = window.quizContent.avatars.map((avatar) => `
      <button type="button" class="avatar-card ${selectedAvatarId === avatar.id ? "selected" : ""}" data-avatar-id="${avatar.id}">
        <span class="avatar-portrait">${getAvatarFace(avatar.id)}</span>
        <strong>${escapeHtml(avatar.name)}</strong>
        <span>${escapeHtml(avatar.label)}</span>
      </button>
    `).join("");

    avatarRoot.querySelectorAll("[data-avatar-id]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedAvatarId = button.dataset.avatarId;
        try {
          window.sessionStorage.setItem("tefenua-avatar", selectedAvatarId);
        } catch (error) {
          // Ignore storage issues and keep in-memory selection only.
        }
        startLink.classList.remove("disabled-link");
        startLink.setAttribute("aria-disabled", "false");
        render();
      });
    });
  }

  startLink.addEventListener("click", (event) => {
    if (!selectedAvatarId) {
      event.preventDefault();
    }
  });

  render();
})();