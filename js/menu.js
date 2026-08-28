"use strict";

/**
 * Menu Principal y Sistema de Audio / Opciones para Koboldig
 */

const AudioSettings = {
  musicVolume: 0.35,
  sfxVolume: 0.5,
  musicMuted: false,
  sfxMuted: false,

  init() {
    try {
      const saved = localStorage.getItem("koboldig_audio_settings") || localStorage.getItem("alchemy_audio_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.musicVolume === "number") this.musicVolume = parsed.musicVolume;
        if (typeof parsed.sfxVolume === "number") this.sfxVolume = parsed.sfxVolume;
        if (typeof parsed.musicMuted === "boolean") this.musicMuted = parsed.musicMuted;
        if (typeof parsed.sfxMuted === "boolean") this.sfxMuted = parsed.sfxMuted;
      }
    } catch (e) { }
    this.applySettings();
  },

  save() {
    try {
      localStorage.setItem("koboldig_audio_settings", JSON.stringify({
        musicVolume: this.musicVolume,
        sfxVolume: this.sfxVolume,
        musicMuted: this.musicMuted,
        sfxMuted: this.sfxMuted
      }));
    } catch (e) { }
  },

  applySettings() {
    const menuMusicEl = document.getElementById("menu-music");
    const gameMusicEl = document.getElementById("music");
    const vol = this.musicMuted ? 0 : this.musicVolume;
    if (menuMusicEl) menuMusicEl.volume = vol;
    if (gameMusicEl) gameMusicEl.volume = vol;
  },

  setMusicVolume(val) {
    this.musicVolume = Math.max(0, Math.min(1, val));
    if (this.musicVolume > 0 && this.musicMuted) {
      this.musicMuted = false;
    }
    this.applySettings();
    this.save();
    this.updateUI();
  },

  setSfxVolume(val) {
    this.sfxVolume = Math.max(0, Math.min(1, val));
    if (this.sfxVolume > 0 && this.sfxMuted) {
      this.sfxMuted = false;
    }
    this.save();
    this.updateUI();
  },

  toggleMusicMute() {
    this.musicMuted = !this.musicMuted;
    this.applySettings();
    this.save();
    this.updateUI();
  },

  toggleSfxMute() {
    this.sfxMuted = !this.sfxMuted;
    this.save();
    this.updateUI();
  },

  updateUI() {
    const musicSlider = document.getElementById("optMusicVol");
    const sfxSlider = document.getElementById("optSfxVol");
    const musicVal = document.getElementById("optMusicVal");
    const sfxVal = document.getElementById("optSfxVal");
    const btnMusicMute = document.getElementById("btnOptMusicMute");
    const btnSfxMute = document.getElementById("btnOptSfxMute");

    if (musicSlider) musicSlider.value = Math.round(this.musicVolume * 100);
    if (sfxSlider) sfxSlider.value = Math.round(this.sfxVolume * 100);
    if (musicVal) musicVal.textContent = (this.musicMuted ? "0" : Math.round(this.musicVolume * 100)) + "%";
    if (sfxVal) sfxVal.textContent = (this.sfxMuted ? "0" : Math.round(this.sfxVolume * 100)) + "%";

    if (btnMusicMute) {
      btnMusicMute.textContent = this.musicMuted ? "MUTED" : "MUTE";
      btnMusicMute.classList.toggle("muted", this.musicMuted);
    }
    if (btnSfxMute) {
      btnSfxMute.textContent = this.sfxMuted ? "MUTED" : "MUTE";
      btnSfxMute.classList.toggle("muted", this.sfxMuted);
    }

    const btnMusic = document.getElementById("btnMusic");
    if (btnMusic) {
      btnMusic.textContent = "Musica: " + (this.musicMuted || this.musicVolume === 0 ? "NO" : "SI");
    }
    const btnSound = document.getElementById("btnSound");
    if (btnSound) {
      btnSound.textContent = "Sonido: " + (this.sfxMuted || this.sfxVolume === 0 ? "NO" : "SI");
    }
  }
};

const MainMenu = {
  elMenu: null,
  elOptionsModal: null,
  elQuitModal: null,
  particlesCanvas: null,
  pctx: null,
  particles: [],
  particleAnimId: null,

  init() {
    this.elMenu = document.getElementById("main-menu");
    this.elOptionsModal = document.getElementById("options-modal");
    this.elQuitModal = document.getElementById("quit-modal");
    this.particlesCanvas = document.getElementById("menu-particles");

    AudioSettings.init();
    this.initParticles();
    this.bindEvents();
  },

  initParticles() {
    if (!this.particlesCanvas) return;
    const cv = this.particlesCanvas;
    const resize = () => {
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    this.pctx = cv.getContext("2d");

    this.particles = [];
    const count = 28;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * cv.width,
        y: Math.random() * cv.height,
        r: 1 + Math.random() * 2.5,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.2 - Math.random() * 0.5,
        alpha: 0.2 + Math.random() * 0.6,
        color: ["#ffd65c", "#ff7ea5", "#57c785", "#7db2ff", "#b06cff"][Math.floor(Math.random() * 5)]
      });
    }

    const renderParticles = () => {
      if (this.elMenu && this.elMenu.classList.contains("hidden")) {
        return;
      }
      this.pctx.clearRect(0, 0, cv.width, cv.height);
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -10) { p.y = cv.height + 10; p.x = Math.random() * cv.width; }
        if (p.x < -10) p.x = cv.width + 10;
        if (p.x > cv.width + 10) p.x = -10;

        this.pctx.save();
        this.pctx.globalAlpha = p.alpha;
        this.pctx.fillStyle = p.color;
        this.pctx.shadowColor = p.color;
        this.pctx.shadowBlur = 8;
        this.pctx.beginPath();
        this.pctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        this.pctx.fill();
        this.pctx.restore();
      }
      this.particleAnimId = requestAnimationFrame(renderParticles);
    };
    renderParticles();
  },

  playUiSound(type) {
    if (typeof sfx === "function") {
      if (type === "play") sfx(520, 0.16, "sine", 0.28, 120);
      else if (type === "opt") sfx(440, 0.14, "triangle", 0.24, 60);
      else if (type === "quit") sfx(340, 0.14, "triangle", 0.24, -80);
      else if (type === "back") sfx(380, 0.12, "sine", 0.2, -40);
      else if (type === "hover") sfx(650, 0.04, "sine", 0.06);
    }
  },

  bindEvents() {
    const btnPlay = document.getElementById("menu-btn-play");
    const btnOptions = document.getElementById("menu-btn-options");
    const btnQuit = document.getElementById("menu-btn-quit");

    if (btnPlay) {
      btnPlay.addEventListener("click", () => {
        this.playUiSound("play");
        this.startGame();
      });
      btnPlay.addEventListener("mouseenter", () => this.playUiSound("hover"));
    }

    if (btnOptions) {
      btnOptions.addEventListener("click", () => {
        this.playUiSound("opt");
        this.openOptions();
      });
      btnOptions.addEventListener("mouseenter", () => this.playUiSound("hover"));
    }

    if (btnQuit) {
      btnQuit.addEventListener("click", () => {
        this.playUiSound("quit");
        this.openQuit();
      });
      btnQuit.addEventListener("mouseenter", () => this.playUiSound("hover"));
    }

    // Modal Options Controls
    const optMusicVol = document.getElementById("optMusicVol");
    const optSfxVol = document.getElementById("optSfxVol");
    const btnOptMusicMute = document.getElementById("btnOptMusicMute");
    const btnOptSfxMute = document.getElementById("btnOptSfxMute");
    const btnOptClose = document.getElementById("btnOptClose");

    if (optMusicVol) {
      optMusicVol.addEventListener("input", (e) => {
        AudioSettings.setMusicVolume(e.target.value / 100);
      });
    }
    if (optSfxVol) {
      optSfxVol.addEventListener("input", (e) => {
        AudioSettings.setSfxVolume(e.target.value / 100);
        this.playUiSound("hover");
      });
    }
    if (btnOptMusicMute) {
      btnOptMusicMute.addEventListener("click", () => {
        AudioSettings.toggleMusicMute();
        this.playUiSound("opt");
      });
    }
    if (btnOptSfxMute) {
      btnOptSfxMute.addEventListener("click", () => {
        AudioSettings.toggleSfxMute();
        this.playUiSound("opt");
      });
    }
    if (btnOptClose) {
      btnOptClose.addEventListener("click", () => {
        this.playUiSound("back");
        this.closeOptions();
      });
    }

    // Modal Quit Controls
    const btnQuitConfirm = document.getElementById("btnQuitConfirm");
    const btnQuitCancel = document.getElementById("btnQuitCancel");

    if (btnQuitConfirm) {
      btnQuitConfirm.addEventListener("click", () => {
        this.playUiSound("quit");
        this.quitGame();
      });
    }
    if (btnQuitCancel) {
      btnQuitCancel.addEventListener("click", () => {
        this.playUiSound("back");
        this.closeQuit();
      });
    }

    // In-game Return to Menu button
    const btnToMenu = document.getElementById("btnToMenu");
    if (btnToMenu) {
      btnToMenu.addEventListener("click", () => {
        this.playUiSound("back");
        this.showMainMenu();
      });
    }
    const btnPauseMenu = document.getElementById("btnPauseMenu");
    if (btnPauseMenu) {
      btnPauseMenu.addEventListener("click", () => {
        this.playUiSound("back");
        if (typeof togglePause === "function" && state === "pause") {
          togglePause();
        }
        this.showMainMenu();
      });
    }
  },

  playMenuMusic() {
    const menuMusicEl = document.getElementById("menu-music");
    const gameMusicEl = document.getElementById("music");
    if (gameMusicEl) gameMusicEl.pause();
    if (menuMusicEl && !AudioSettings.musicMuted && AudioSettings.musicVolume > 0 && menuMusicEl.paused) {
      menuMusicEl.volume = AudioSettings.musicVolume;
      menuMusicEl.play().catch(() => {});
    }
  },

  startGame() {
    if (this.elMenu) this.elMenu.classList.add("hidden");
    const menuMusicEl = document.getElementById("menu-music");
    const gameMusicEl = document.getElementById("music");
    if (menuMusicEl) menuMusicEl.pause();
    if (gameMusicEl && !AudioSettings.musicMuted && AudioSettings.musicVolume > 0) {
      gameMusicEl.volume = AudioSettings.musicVolume;
      gameMusicEl.play().catch(() => {});
    }
    if (typeof reset === "function") {
      reset();
    }
  },

  showMainMenu() {
    if (this.elMenu) this.elMenu.classList.remove("hidden");
    this.closeOptions();
    this.closeQuit();
    if (typeof togglePause === "function" && typeof state !== "undefined" && state === "play") {
      togglePause();
    }
    this.playMenuMusic();
    if (this.particlesCanvas) this.initParticles();
  },

  openOptions() {
    AudioSettings.updateUI();
    if (this.elOptionsModal) this.elOptionsModal.classList.remove("hidden");
  },

  closeOptions() {
    if (this.elOptionsModal) this.elOptionsModal.classList.add("hidden");
  },

  openQuit() {
    if (this.elQuitModal) this.elQuitModal.classList.remove("hidden");
  },

  closeQuit() {
    if (this.elQuitModal) this.elQuitModal.classList.add("hidden");
  },

  quitGame() {
    try {
      window.close();
    } catch (e) { }
    const quitCard = document.querySelector("#quit-modal .modal-box");
    if (quitCard) {
      quitCard.innerHTML = `
        <h2>KOBOLDIG</h2>
        <p style="font-size: 16px; margin: 18px 0; color: #cfd3ff;">¡Gracias por jugar!</p>
        <p style="font-size: 13px; color: #8fa0d8; margin-bottom: 20px;">Puedes cerrar esta pestaña de tu navegador.</p>
        <button class="btn-fantasy" onclick="MainMenu.showMainMenu()">VOLVER AL MENU</button>
      `;
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  MainMenu.init();
  const tryStartMenuMusic = () => {
    if (MainMenu.elMenu && !MainMenu.elMenu.classList.contains("hidden")) {
      MainMenu.playMenuMusic();
    }
  };
  document.addEventListener("pointerdown", tryStartMenuMusic, { once: true });
  document.addEventListener("keydown", tryStartMenuMusic, { once: true });
});
