import { characterList, appSettings } from './characters.js';

const DEFAULT_API_KEY = "";

// DEXIE DATABASE INITIALIZATION
const db = new Dexie("RoleplayChatDB");
db.version(1).stores({
  chats: 'characterId',
  settings: 'key',
  bonds: 'characterId'
});

let currentCharacter = characterList ? characterList[0] : null;
let chatHistory = [];

let aiConfig = {
  apiKey: '',
  model: 'gemini-2.5-flash',
  temperature: 0.7,
  topK: 40,
  topP: 0.95,
  maxTokens: 1024,
  historyCount: 10,
  userProfile: ''
};

// Fungsi Utilitas Keamanan: Sanitisasi Teks untuk mencegah XSS
function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// DOM Elements
const toast = document.querySelector(".toast");
const toastT = document.querySelector(".toast span");
const chatSelectionPage = document.getElementById('chatSelectionPage');
const chatMainWrapper = document.getElementById('chatMainWrapper');
const listChatContainer = document.getElementById('listChatContainer');
const chatBox = document.getElementById('chatBox');
const typeBox = document.getElementById('type-box');

const activeAvatar = document.getElementById('activeAvatar');
const activeName = document.getElementById('activeName');
const txtChatCount = document.getElementById('txt-chat');

const settingsDrawer = document.getElementById('settingsDrawer');
const settingsOverlay = document.getElementById('settingsOverlay');
const sortPopup = document.getElementById('s-short');
const extraContextInput = document.getElementById('extraContextInput');
const userProfileInput = document.getElementById('userProfileInput');

const tabChatList = document.getElementById('tabChatList');
const tabAiSettings = document.getElementById('tabAiSettings');
const navBtnChat = document.getElementById('navBtnChat');
const navBtnSettings = document.getElementById('navBtnSettings');
const aiSettingsCollapsibleHeader = document.getElementById('aiSettingsCollapsibleHeader');
const aiSettingsBody = document.getElementById('aiSettingsBody');
const minimizeAiSettingsBtn = document.getElementById('minimizeAiSettingsBtn');

const openContextBtn = document.getElementById('openContextBtn');
const contextPopup = document.getElementById('contextPopup');
const closeContextPopupBtn = document.getElementById('closeContextPopupBtn');
const saveContextBtn = document.getElementById('saveContextBtn');
const cMid = document.getElementById("c-underline");

// ================= DEXIE DB SERVICES =================
async function loadAiSettings() {
  const savedConfig = await db.settings.get('ai_config');
  if (savedConfig) {
    aiConfig = { ...aiConfig, ...savedConfig.value };
  }
  
  if (userProfileInput) userProfileInput.value = aiConfig.userProfile || '';
  document.getElementById('apiKeyInput').value = aiConfig.apiKey || '';
  document.getElementById('modelSelect').value = aiConfig.model || 'gemini-2.5-flash';
  document.getElementById('temperatureInput').value = aiConfig.temperature;
  document.getElementById('tempVal').textContent = aiConfig.temperature;
  document.getElementById('topKInput').value = aiConfig.topK;
  document.getElementById('topKVal').textContent = aiConfig.topK;
  document.getElementById('topPInput').value = aiConfig.topP;
  document.getElementById('topPVal').textContent = aiConfig.topP;
  document.getElementById('maxTokensInput').value = aiConfig.maxTokens;
  document.getElementById('historyUploadSelect').value = aiConfig.historyCount;

  const savedTheme = await db.settings.get('app_theme');
  applyTheme(savedTheme ? savedTheme.value : (appSettings?.defaultTheme || 'light'));
}

async function saveAiSettingsFromPage() {
  aiConfig.apiKey = document.getElementById('apiKeyInput').value.trim();
  aiConfig.model = document.getElementById('modelSelect').value;
  aiConfig.temperature = parseFloat(document.getElementById('temperatureInput').value);
  aiConfig.topK = parseInt(document.getElementById('topKInput').value);
  aiConfig.topP = parseFloat(document.getElementById('topPInput').value);
  aiConfig.maxTokens = parseInt(document.getElementById('maxTokensInput').value);
  aiConfig.historyCount = parseInt(document.getElementById('historyUploadSelect').value);
  aiConfig.userProfile = userProfileInput ? userProfileInput.value.trim() : '';

  await db.settings.put({ key: 'ai_config', value: aiConfig });

  showToast("Pengaturan Berhasil Disimpan");
}

async function getBondLevel(charId) {
  const record = await db.bonds.get(charId);
  const bondExp = record ? record.exp : 0;
  return Math.floor(bondExp / 10) + 1;
}

async function addBondExp(charId, emotion) {
  let expGained = 1;
  const emo = emotion ? emotion.toLowerCase() : '';
  if (['senang', 'bahagia'].includes(emo)) expGained = 3;

  const record = await db.bonds.get(charId);
  let currentExp = record ? record.exp : 0;
  await db.bonds.put({ characterId: charId, exp: currentExp + expGained });
}

async function saveChatHistory() {
  if (!currentCharacter) return;
  await db.chats.put({ characterId: currentCharacter.id, history: chatHistory });
}

async function loadChatHistory() {
  if (!currentCharacter) return;
  const record = await db.chats.get(currentCharacter.id);
  chatBox.innerHTML = '';

  if (record && record.history) {
    chatHistory = record.history;
    if (chatHistory.length === 0 && currentCharacter.greeting) {
      tambahPesan(currentCharacter.greeting, 'bot', 0, false);
    } else {
      chatHistory.forEach((item, historyIndex) => {
        const role = item.role === 'user' ? 'user' : 'bot';
        const fullText = item.parts ? item.parts.map(p => p.text).join(' ') : '';

        if (role === 'user' && (fullText === '...' || fullText.includes('/lanjutkan respon sebelumnya/'))) {
          return;
        }

        const cleanText = processEmotionAndText(fullText);
        tambahPesan(cleanText, role, historyIndex, false);
      });
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  } else {
    chatHistory = [];
    if (currentCharacter.greeting) tambahPesan(currentCharacter.greeting, 'bot', 0, false);
  }
}

// ================= UTILITAS & PROSES TEKS =================
function processEmotionAndText(rawText) {
  if (!rawText) return '';
  const emotionRegex = /\[EMOSI:\s*(\w+)\]/i;
  const match = rawText.match(emotionRegex);

  let cleanText = rawText;
  let emotion = "biasa";

  if (match) {
    emotion = match[1].toLowerCase();
    cleanText = rawText.replace(emotionRegex, '').trim();
  }

  if (currentCharacter) {
    addBondExp(currentCharacter.id, emotion);
  }

  return cleanText;
}

function parseMessageSegments(text) {
  if (!text) return [];
  const regex = /\*(.*?)\*/g;
  const segments = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const speech = text.substring(lastIndex, match.index).trim();
      if (speech) segments.push({ type: 'speech', text: speech });
    }
    const action = match[1].trim();
    if (action) segments.push({ type: 'action', text: `*${action}*` });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    const remainingSpeech = text.substring(lastIndex).trim();
    if (remainingSpeech) segments.push({ type: 'speech', text: remainingSpeech });
  }

  return segments;
}

// ================= RENDER PESAN =================
function tambahPesan(teks, pengirim, historyIndex = 0, autoScroll = true) {
  const cleanTeks = processEmotionAndText(teks);
  const segments = parseMessageSegments(cleanTeks);
  const avatarSrc = currentCharacter ? (currentCharacter.avatar || 'img/shun.png') : 'img/shun.png';

  const listSegments = segments.length > 0 ? segments : [{ type: 'speech', text: cleanTeks }];

  listSegments.forEach((segment, segmentIndex) => {
    const bubbleWrapper = document.createElement('div');
    const isAction = segment.type === 'action';
    
    // Keamanan: Escape teks untuk mencegah serangan XSS
    const safeText = escapeHTML(segment.text);
    const textHtml = `<span class="${isAction ? 'action-text' : ''}">${safeText}</span>`;
    
    const rewindBtnHTML = segmentIndex === 0 
      ? `<button class="rewind-btn" title="Rewind" data-index="${historyIndex}">↩</button>` 
      : '';

    if (pengirim === 'user') {
      bubbleWrapper.className = `user-bubble ${isAction ? 'action-bubble' : ''}`;
      bubbleWrapper.innerHTML = `${rewindBtnHTML}${textHtml}`;
    } else {
      bubbleWrapper.className = `bot-bubble ${isAction ? 'action-bubble' : ''}`;
      
      if (segmentIndex === 0) {
        bubbleWrapper.innerHTML = `
          <img src="${avatarSrc}" alt="Avatar">
          ${textHtml}
          ${rewindBtnHTML}
        `;
      } else {
        bubbleWrapper.innerHTML = `
          <div style="width: 38px; flex-shrink: 0;"></div>
          ${textHtml}
        `;
      }
    }

    const btn = bubbleWrapper.querySelector('.rewind-btn');
    if (btn) {
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-index'));
        if (confirm("Hapus pesan ini dan semua pesan setelahnya?")) {
          chatHistory = chatHistory.slice(0, idx);
          await saveChatHistory();
          await loadChatHistory();
        }
      });
    }

    chatBox.appendChild(bubbleWrapper);
  });

  if (autoScroll) chatBox.scrollTop = chatBox.scrollHeight;
}

async function renderCharacterList(list = characterList) {
  if (!listChatContainer || !list) return;
  listChatContainer.innerHTML = '';
  if (txtChatCount) txtChatCount.textContent = `Chat (${list.length})`;

  for (const char of list) {
    const item = document.createElement('div');
    item.className = 'chat-item';
    const level = await getBondLevel(char.id);

    const safeName = escapeHTML(char.name);

    item.innerHTML = `
      <img src="${char.avatar || 'img/shun.png'}" class="avatar" alt="${safeName}">
      <span class="user-name">${safeName}</span>
      <span class="bond-tag">Lv. ${level}</span>
    `;
    
    item.addEventListener('click', async () => {
      currentCharacter = char;
      activeName.textContent = char.name;
      activeAvatar.src = char.avatar || 'img/shun.png';

      await db.settings.put({ key: 'active_character_id', value: char.id });

      const vnBtn = document.getElementById('vn');
      if (vnBtn) {
        vnBtn.style.display = char.vn ? 'block' : 'none';
      }

      chatSelectionPage.style.display = 'none';
      chatMainWrapper.style.display = 'flex';
      await loadChatHistory();
    });
    listChatContainer.appendChild(item);
  }
}

// ================= KIRIM PESAN AI =================
async function kirimPesan() {
  const activeApiKey = aiConfig.apiKey !== '' ? aiConfig.apiKey : DEFAULT_API_KEY;

  // Keamanan & Pengalihan: Jika API Key Kosong, Alihkan ke tutorial.html
  if (!activeApiKey || activeApiKey.trim() === '') {
    window.location.href = 'tutorial.html';
    return;
  }

  const sendBtn = document.getElementById('sendBtn');
  const text = typeBox.innerText.trim();

  if (!currentCharacter) return;

  typeBox.innerText = '';
  const isDecoy = (text === '' || text === '...' || text.toLowerCase() === '/lanjutkan respon sebelumnya/');

  if (!isDecoy) {
    tambahPesan(text, 'user', chatHistory.length);
    const segments = parseMessageSegments(text);
    const userParts = segments.map(seg => ({ text: seg.text }));
    chatHistory.push({ role: "user", parts: userParts.length > 0 ? userParts : [{ text }] });
  } else {
    chatHistory.push({ 
      role: "user", 
      parts: [{ text: "/lanjutkan respon sebelumnya/" }] 
    });
  }

  await saveChatHistory();

  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'bot-bubble action-bubble';
  loadingDiv.id = 'loading';
  loadingDiv.innerHTML = `<img src="${currentCharacter.avatar || 'img/shun.png'}"><span class="action-text">sedang mengetik...</span>`;
  chatBox.appendChild(loadingDiv);
  chatBox.scrollTop = chatBox.scrollHeight;

  sendBtn.disabled = true;

  let historyToUpload = chatHistory;
  if (aiConfig.historyCount > 0 && chatHistory.length > aiConfig.historyCount) {
    historyToUpload = chatHistory.slice(-aiConfig.historyCount);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${aiConfig.model}:generateContent?key=${activeApiKey}`;
  
  const extraContext = extraContextInput ? extraContextInput.value.trim() : '';
  const userProfileContext = aiConfig.userProfile 
    ? `\n\n[DESKRIPSI USER / LAWAN BICARA]:\n${aiConfig.userProfile}` 
    : '';

  const fullSystemInstruction = (currentCharacter.systemInstruction || '') 
    + userProfileContext 
    + (extraContext ? `\n\n[Konteks Tambahan]: ${extraContext}` : '');

  const payload = {
    system_instruction: { parts: [{ text: fullSystemInstruction }] },
    contents: historyToUpload,
    generationConfig: {
      temperature: aiConfig.temperature,
      topK: aiConfig.topK,
      topP: aiConfig.topP,
      maxOutputTokens: aiConfig.maxTokens
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    document.getElementById('loading')?.remove();

    if (response.ok && data.candidates && data.candidates[0].content.parts) {
      const parts = data.candidates[0].content.parts;
      let rawReply = parts.filter(p => p.text && !p.thought).map(p => p.text).join('\n');
      if (!rawReply.trim()) rawReply = parts[parts.length - 1].text;

      const cleanReply = processEmotionAndText(rawReply);
      tambahPesan(cleanReply, 'bot', chatHistory.length);

      chatHistory.push({ role: "model", parts: [{ text: cleanReply }] });
      await saveChatHistory();
    } else {
      tambahPesan("Error: " + (data.error?.message || "Gagal memperoleh balasan."), 'bot', chatHistory.length);
    }
  } catch (err) {
    document.getElementById('loading')?.remove();
    tambahPesan("Koneksi gagal. Periksa jaringan Anda.", 'bot', chatHistory.length);
  } finally {
    sendBtn.disabled = false;
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  db.settings.put({ key: 'app_theme', value: theme });
  const themeSelect = document.getElementById('themeSelect');
  if (themeSelect) themeSelect.value = theme;
}

function toggleModal(show) {
  if (settingsDrawer) settingsDrawer.style.display = show ? 'flex' : 'none';
  if (settingsOverlay) settingsOverlay.style.display = show ? 'block' : 'none';
}

async function exportChatData() {
  if (!currentCharacter) return;
  const record = await db.chats.get(currentCharacter.id);
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(record ? record.history : []));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `chat_export_${currentCharacter.id}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function importChatData(event) {
  const file = event.target.files[0];
  if (!file || !currentCharacter) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const importedHistory = JSON.parse(e.target.result);
      chatHistory = importedHistory;
      await saveChatHistory();
      await loadChatHistory();
      alert("Chat Berhasil Diimport!");
      toggleModal(false);
    } catch (err) {
      alert("Format File JSON Tidak Valid.");
    }
  };
  reader.readAsText(file);
}

// ================= EVENT LISTENERS =================
document.addEventListener('DOMContentLoaded', async () => {
  await loadAiSettings();
  await renderCharacterList();

  document.getElementById('temperatureInput')?.addEventListener('input', (e) => document.getElementById('tempVal').textContent = e.target.value);
  document.getElementById('topKInput')?.addEventListener('input', (e) => document.getElementById('topKVal').textContent = e.target.value);
  document.getElementById('topPInput')?.addEventListener('input', (e) => document.getElementById('topPVal').textContent = e.target.value);

  navBtnChat?.addEventListener('click', () => {
    cMid.classList.remove('push');
    navBtnChat.classList.add('active');
    navBtnSettings.classList.remove('active');
    tabChatList.classList.add('active-tab');
    tabAiSettings.classList.remove('active-tab');
  });

  navBtnSettings?.addEventListener('click', () => {
    cMid.classList.add('push');
    navBtnSettings.classList.add('active');
    navBtnChat.classList.remove('active');
    tabAiSettings.classList.add('active-tab');
    tabChatList.classList.remove('active-tab');
  });

  function toggleAiSettingsMinimize() {
    aiSettingsBody.classList.toggle('minimized');
    minimizeAiSettingsBtn.textContent = aiSettingsBody.classList.contains('minimized') ? '+' : '—';
  }

  aiSettingsCollapsibleHeader?.addEventListener('click', toggleAiSettingsMinimize);
  document.getElementById('saveAiSettingsBtn')?.addEventListener('click', saveAiSettingsFromPage);

  openContextBtn?.addEventListener('click', () => contextPopup.classList.add('show'));
  closeContextPopupBtn?.addEventListener('click', () => contextPopup.classList.remove('show'));
  saveContextBtn?.addEventListener('click', () => {
    contextPopup.classList.remove('show');
    showToast("Konteks Berhasil Tersimpan");
  });

  document.getElementById('drawer')?.addEventListener('click', () => toggleModal(true));
  document.getElementById('closeSettings')?.addEventListener('click', () => toggleModal(false));
  settingsOverlay?.addEventListener('click', () => toggleModal(false));

  document.getElementById('sendBtn')?.addEventListener('click', kirimPesan);

  document.getElementById('vn')?.addEventListener('click', () => {
    window.location.href = 'my_Office.html';
  });

  document.getElementById('back')?.addEventListener('click', () => {
    chatMainWrapper.style.display = 'none';
    chatSelectionPage.style.display = 'block';
    contextPopup.classList.remove('show');
    renderCharacterList();
  });

  document.getElementById('themeSelect')?.addEventListener('change', (e) => applyTheme(e.target.value));

  document.getElementById('exportBtn')?.addEventListener('click', exportChatData);
  document.getElementById('importBtn')?.addEventListener('click', () => document.getElementById('fileInput').click());
  document.getElementById('fileInput')?.addEventListener('change', importChatData);

  document.getElementById('resetBtn')?.addEventListener('click', async () => {
    if (confirm("Hapus seluruh riwayat chat karakter ini?")) {
      chatHistory = [];
      await saveChatHistory();
      await loadChatHistory();
      toggleModal(false);
    }
  });

  document.getElementById('sh-box')?.addEventListener('click', () => {
    if (sortPopup) sortPopup.style.display = sortPopup.style.display === 'grid' ? 'none' : 'grid';
  });
  document.getElementById('close-')?.addEventListener('click', () => {
    if (sortPopup) sortPopup.style.display = 'none';
  });
});

let toastTimeout;

function showToast(pesan) {
  if (!toastT || !toast) return;
  toastT.textContent = pesan;
  toast.classList.remove("showT");
  clearTimeout(toastTimeout);

  void toast.offsetWidth; 

  toast.classList.add("showT");

  toastTimeout = setTimeout(() => {
    toast.classList.remove("showT");
  }, 2000);
}

extraContextInput?.addEventListener('blur', () => {
  contextPopup.classList.remove('show');
});