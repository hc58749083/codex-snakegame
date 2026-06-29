"use strict";

const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const scoreElement = document.querySelector("#score");
const bestScoreElement = document.querySelector("#bestScore");
const overlay = document.querySelector("#gameOverlay");
const overlayKicker = document.querySelector("#overlayKicker");
const overlayTitle = document.querySelector("#overlayTitle");
const overlayText = document.querySelector("#overlayText");
const startButton = document.querySelector("#startButton");
const pauseButton = document.querySelector("#pauseButton");
const restartButton = document.querySelector("#restartButton");
const soundButton = document.querySelector("#soundButton");
const historyList = document.querySelector("#historyList");
const historyEmpty = document.querySelector("#historyEmpty");
const difficultyButtons = document.querySelectorAll("[data-difficulty]");

const GRID_SIZE = 20;
const CELL_SIZE = canvas.width / GRID_SIZE;
const DIFFICULTIES = {
  easy: { label: "简单", initialSpeed: 190, minSpeed: 100, speedStep: 8 },
  normal: { label: "普通", initialSpeed: 150, minSpeed: 70, speedStep: 10 },
  hard: { label: "困难", initialSpeed: 105, minSpeed: 50, speedStep: 10 },
};
const SCORE_HISTORY_KEY = "snake-score-history";
const SCORE_HISTORY_LIMIT = 10;
const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

let snake;
let food;
let direction;
let nextDirection;
let score;
let timer = null;
let state = "ready";
let soundEnabled = true;
let audioContext = null;
let bestScore = Number(localStorage.getItem("snake-best-score")) || 0;
let difficulty = localStorage.getItem("snake-difficulty");
let scoreHistory = getScoreHistory();

if (!DIFFICULTIES[difficulty]) difficulty = "normal";

function formatScore(value) {
  return String(value).padStart(3, "0");
}

function getScoreHistory() {
  try {
    const savedHistory = JSON.parse(localStorage.getItem(SCORE_HISTORY_KEY) || "[]");
    if (!Array.isArray(savedHistory)) return [];

    return savedHistory
      .filter((result) => (
        result
        && Number.isFinite(result.score)
        && DIFFICULTIES[result.difficulty]
        && Number.isFinite(result.playedAt)
      ))
      .slice(0, SCORE_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function saveScoreResult() {
  scoreHistory.unshift({ score, difficulty, playedAt: Date.now() });
  scoreHistory = scoreHistory.slice(0, SCORE_HISTORY_LIMIT);
  localStorage.setItem(SCORE_HISTORY_KEY, JSON.stringify(scoreHistory));
  renderScoreHistory();
}

function renderScoreHistory() {
  historyList.replaceChildren();
  historyEmpty.hidden = scoreHistory.length > 0;

  scoreHistory.forEach((result, index) => {
    const item = document.createElement("li");
    const rank = document.createElement("span");
    const details = document.createElement("span");
    const value = document.createElement("strong");
    const playedAt = new Date(result.playedAt);

    rank.className = "history-index";
    rank.textContent = String(index + 1).padStart(2, "0");
    details.className = "history-details";
    details.textContent = `${DIFFICULTIES[result.difficulty].label} · ${playedAt.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    value.textContent = formatScore(result.score);

    item.append(rank, details, value);
    historyList.append(item);
  });
}

function resetGame() {
  clearTimeout(timer);
  snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
  direction = DIRECTIONS.right;
  nextDirection = DIRECTIONS.right;
  score = 0;
  state = "ready";
  food = createFood();
  updateScore();
  pauseButton.disabled = true;
  pauseButton.textContent = "暂停";
  showOverlay(
    `${DIFFICULTIES[difficulty].label}模式`,
    "开始游戏",
    "吃掉果实，别撞到墙壁或自己。",
    "开始",
  );
  draw();
}

function startGame() {
  if (state === "over" || state === "ready") {
    if (state === "over") resetGame();
    state = "running";
    pauseButton.disabled = false;
    overlay.classList.add("hidden");
    scheduleTick();
  } else if (state === "paused") {
    resumeGame();
  }
}

function togglePause() {
  if (state === "running") pauseGame();
  else if (state === "paused") resumeGame();
}

function pauseGame() {
  state = "paused";
  clearTimeout(timer);
  pauseButton.textContent = "继续";
  showOverlay("游戏已暂停", "休息一下", "按空格或点击继续返回游戏。", "继续");
}

function resumeGame() {
  state = "running";
  pauseButton.textContent = "暂停";
  overlay.classList.add("hidden");
  scheduleTick();
}

function scheduleTick() {
  clearTimeout(timer);
  const settings = DIFFICULTIES[difficulty];
  const speed = Math.max(
    settings.minSpeed,
    settings.initialSpeed - Math.floor(score / 5) * settings.speedStep,
  );
  timer = setTimeout(tick, speed);
}

function selectDifficulty(name) {
  if (!DIFFICULTIES[name] || name === difficulty) return;
  difficulty = name;
  localStorage.setItem("snake-difficulty", difficulty);
  updateDifficultyButtons();
  resetGame();
}

function updateDifficultyButtons() {
  difficultyButtons.forEach((button) => {
    const isActive = button.dataset.difficulty === difficulty;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function tick() {
  if (state !== "running") return;

  direction = nextDirection;
  const head = {
    x: snake[0].x + direction.x,
    y: snake[0].y + direction.y,
  };
  const hitsWall = head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE;
  const willEat = head.x === food.x && head.y === food.y;
  const bodyToCheck = willEat ? snake : snake.slice(0, -1);
  const hitsSelf = bodyToCheck.some((part) => part.x === head.x && part.y === head.y);

  if (hitsWall || hitsSelf) {
    endGame();
    return;
  }

  snake.unshift(head);
  if (willEat) {
    score += 1;
    food = createFood();
    updateScore();
    playTone(620, 0.07);
  } else {
    snake.pop();
  }

  draw();
  scheduleTick();
}

function endGame() {
  state = "over";
  clearTimeout(timer);
  pauseButton.disabled = true;
  playTone(150, 0.2);
  saveScoreResult();

  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem("snake-best-score", String(bestScore));
    updateScore();
  }

  showOverlay("GAME OVER", "游戏结束", `本局得分 ${score}，再来一局刷新记录。`, "再玩一次");
}

function createFood() {
  const freeCells = [];
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      if (!snake?.some((part) => part.x === x && part.y === y)) freeCells.push({ x, y });
    }
  }
  return freeCells[Math.floor(Math.random() * freeCells.length)];
}

function setDirection(name) {
  const candidate = DIRECTIONS[name];
  if (!candidate) return;
  if (candidate.x + direction.x === 0 && candidate.y + direction.y === 0) return;
  nextDirection = candidate;
  if (state === "ready") startGame();
}

function updateScore() {
  scoreElement.textContent = formatScore(score);
  bestScoreElement.textContent = formatScore(bestScore);
}

function showOverlay(kicker, title, text, buttonText) {
  overlayKicker.textContent = kicker;
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  startButton.textContent = buttonText;
  overlay.classList.remove("hidden");
}

function draw() {
  ctx.fillStyle = "#091626";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawFood();
  snake.forEach(drawSnakePart);
}

function drawGrid() {
  ctx.strokeStyle = "rgba(88, 166, 255, 0.06)";
  ctx.lineWidth = 1;
  for (let i = 1; i < GRID_SIZE; i += 1) {
    const position = i * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(position, 0);
    ctx.lineTo(position, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, position);
    ctx.lineTo(canvas.width, position);
    ctx.stroke();
  }
}

function drawSnakePart(part, index) {
  const padding = 2;
  ctx.fillStyle = index === 0 ? "#8fc7ff" : `hsl(${211 + Math.min(index, 16)}, 78%, ${64 - Math.min(index, 12)}%)`;
  roundRect(
    part.x * CELL_SIZE + padding,
    part.y * CELL_SIZE + padding,
    CELL_SIZE - padding * 2,
    CELL_SIZE - padding * 2,
    index === 0 ? 7 : 5,
  );
  ctx.fill();

  if (index === 0) drawEyes(part);
}

function drawEyes(head) {
  const baseX = head.x * CELL_SIZE;
  const baseY = head.y * CELL_SIZE;
  const center = CELL_SIZE / 2;
  const side = 5;
  const forward = 5;
  let eyes;

  if (direction.x !== 0) {
    eyes = [
      { x: center + direction.x * forward, y: center - side },
      { x: center + direction.x * forward, y: center + side },
    ];
  } else {
    eyes = [
      { x: center - side, y: center + direction.y * forward },
      { x: center + side, y: center + direction.y * forward },
    ];
  }

  ctx.fillStyle = "#0b2745";
  eyes.forEach((eye) => {
    ctx.beginPath();
    ctx.arc(baseX + eye.x, baseY + eye.y, 2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawFood() {
  const x = food.x * CELL_SIZE + CELL_SIZE / 2;
  const y = food.y * CELL_SIZE + CELL_SIZE / 2;
  ctx.shadowColor = "rgba(255, 92, 85, .6)";
  ctx.shadowBlur = 14;
  ctx.fillStyle = "#ff5c55";
  ctx.beginPath();
  ctx.arc(x, y + 1, CELL_SIZE * .31, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#58a6ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 7);
  ctx.quadraticCurveTo(x + 4, y - 13, x + 8, y - 10);
  ctx.stroke();
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function updateSoundButton() {
  const label = soundEnabled ? "关闭音效" : "开启音效";
  soundButton.classList.toggle("muted", !soundEnabled);
  soundButton.textContent = soundEnabled ? "🔊" : "🔇";
  soundButton.setAttribute("aria-label", label);
  soundButton.title = label;
}

function playTone(frequency, duration) {
  if (!soundEnabled) return;
  audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "square";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.04, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

document.addEventListener("keydown", (event) => {
  const keyMap = {
    ArrowUp: "up", w: "up", W: "up",
    ArrowDown: "down", s: "down", S: "down",
    ArrowLeft: "left", a: "left", A: "left",
    ArrowRight: "right", d: "right", D: "right",
  };

  if (keyMap[event.key]) {
    event.preventDefault();
    setDirection(keyMap[event.key]);
  } else if (event.code === "Space") {
    event.preventDefault();
    togglePause();
  }
});

document.querySelectorAll("[data-direction]").forEach((button) => {
  button.addEventListener("pointerdown", () => setDirection(button.dataset.direction));
});

difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => selectDifficulty(button.dataset.difficulty));
});

startButton.addEventListener("click", startGame);
pauseButton.addEventListener("click", togglePause);
restartButton.addEventListener("click", () => {
  resetGame();
  startGame();
});
soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  updateSoundButton();
});

bestScoreElement.textContent = formatScore(bestScore);
updateSoundButton();
updateDifficultyButtons();
renderScoreHistory();
resetGame();
