import './style.css';

const LOCAL_URL = "http://127.0.0.1:18765";
const statusEl = document.querySelector("#status");
const openButton = document.querySelector("#open-local");

function setStatus(text) {
  if (statusEl) {
    statusEl.textContent = text;
  }
}

function tryOpen() {
  const probe = new Image();
  probe.onload = () => {
    window.location.replace(`${LOCAL_URL}/?shell=wails`);
  };
  probe.onerror = () => {
    setStatus("Starting local SkillOps service...");
    setTimeout(tryOpen, 700);
  };
  probe.src = `${LOCAL_URL}/assets/logo.svg?probe=${Date.now()}`;
}

if (openButton) {
  openButton.addEventListener("click", () => {
    window.location.href = `${LOCAL_URL}/?shell=wails`;
  });
}

tryOpen();
