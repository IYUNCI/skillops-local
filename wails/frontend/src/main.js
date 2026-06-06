import './style.css';

const LOCAL_URL = 'http://127.0.0.1:18765';
const frame = document.querySelector('#skillopsFrame');
const bootText = document.querySelector('#bootText');
const bootHint = document.querySelector('#bootHint');

let attempts = 0;
const maxAttempts = 80;

function setBootText(text) {
  if (bootText) {
    bootText.textContent = text;
  }
}

function showFrame() {
  if (!frame) {
    return;
  }
  bootHint?.setAttribute('style', 'opacity: 0; pointer-events: none;');
  frame.style.visibility = 'visible';
}

function probeAndLoad() {
  const probe = new Image();
  probe.onload = () => {
    if (!frame) {
      return;
    }
    frame.src = `${LOCAL_URL}/?shell=wails`;
    setBootText('SkillOps 已就绪，正在加载…');
    showFrame();
  };

  probe.onerror = () => {
    attempts += 1;
    if (attempts >= maxAttempts) {
      setBootText('SkillOps 启动超时，请检查是否有系统安全软件拦截本地端口 18765，或重启应用再试。');
      return;
    }
    setBootText(`正在启动 SkillOps…（${attempts}/${maxAttempts}）`);
    setTimeout(probeAndLoad, 600);
  };

  probe.src = `${LOCAL_URL}/assets/logo.svg?probe=${Date.now()}`;
}

if (frame) {
  frame.style.visibility = 'hidden';
}
frame?.addEventListener('load', showFrame);

probeAndLoad();
