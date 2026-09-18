import { characterList } from './characters.js';

const Dexie = window.Dexie;
const DEFAULT_API_KEY = "";

// Fungsi Utilitas Keamanan: Sanitisasi Teks untuk mencegah XSS
function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById('navMenu').classList.toggle('collapsed');
  console.log("HTML selesai dimuat! Anda sudah bisa memanipulasi elemen.");
});

let aiConfig = {
  apiKey: "",
  model: "gemini-2.5-flash",
  temperature: 0.7,
  topK: 40,
  topP: 0.95,
  maxTokens: 800,
  historyCount: 10,
  userProfile: ""
};

// MAP AUDIO KUSTOM UNTUK SETIAP EMOSI
const emotionSounds = {
  biasa: 'audio/normal.mp3',
  senang: 'audio/normal.mp3',
  bahagia: 'audio/normal.mp3',
  sedih: 'audio/sweat.mp3',
  marah: 'audio/angry.mp3',
  kaget: 'audio/normal.mp3'
};

const shakeEmot = {
  biasa: 'S-animation',
  senang: 'S-happy-animation',
  bahagia: 'S-animation',
  sedih: 'S-sad-animation',
  marah: 'S-angry-animation',
  kaget: 'S-animation'
};

// DEXIE DATABASE INITIALIZATION
const db = new Dexie("RoleplayChatDB");
db.version(1).stores({
  chats: 'characterId',
  settings: 'key',
  bonds: 'characterId'
});

let currentCharacter = characterList[0];
let chatHistory = [];
let isInputMode = false;
let isTypingAI = false;
let typewriterTimer = null;

// VARIABEL QUEUE VISUAL NOVEL (PER SEGMEN)
let currentSegments = [];
let currentSegmentIndex = 0;

// DOM Elements
const bubbleChat = document.getElementById('bubbleChat');
const chatText = document.getElementById('chatText');
const speakerName = document.getElementById('speakerName');
const historyBox = document.getElementById('historyBox');
const historyContent = document.getElementById('historyContent');
const historyBtn = document.getElementById('history-btn');
const closeHistoryBtn = document.getElementById('close-history-btn');
const exitBtn = document.getElementById('exit-btn');
const spriteImg = document.getElementById('sprite');
const burgerBtn = document.getElementById('burger-btn');
const navMenu = document.getElementById('navMenu');
const settingBtn = document.getElementById('setting-btn');

// Choice Box Pop-up Elements
const choiceContainer = document.getElementById('choiceContainer');
const choiceInput = document.getElementById('choiceInput');
const choiceSendBtn = document.getElementById('choiceSendBtn');
const choiceCancelBtn = document.getElementById('choiceCancelBtn');

// Modal Elements
const dataModal = document.getElementById('vn-data-modal');
const modalCharName = document.getElementById('modal-char-name');
const exportBtn = document.getElementById('vn-export-btn');
const importTriggerBtn = document.getElementById('vn-import-trigger-btn');
const importFileInput = document.getElementById('vn-import-file-input');
const resetBtn = document.getElementById('vn-reset-btn');
const closeDataBtn = document.getElementById('vn-close-data-btn');

let firstLoad = true;
const path = "audio/bgm/";
let bgmAudio = null;
let bgm = [
  `${path}Track_2_Mitsukiyo_Luminous_Memory.ogg`,
  `${path}Track_39_KARUT_Water_Drop.ogg`,
  `${path}Track_38_Mitsukiyo_Guruguru_Usagi.ogg`,
  `${path}Track_37_Mitsukiyo_Aira.ogg`,
  `${path}Track_36_Mitsukiyo_Koi_is_love.ogg`,
  `${path}Track_35_Mitsukiyo_Morose_Dreamer.ogg`,
  `${path}Track_26_Mitsukiyo_Lemonade_Diary.ogg`,
  `${path}Track_25_Mitsukiyo_Future_Bossa.ogg`,
  `${path}Track_21_Nor_Midnight_Trip.ogg`,
  `${path}Track_17_Mitsukiyo_Irasshaimase.ogg`,
  `${path}Track_14_KARUT_Step_by_Step.ogg`,
  `${path}Track_10_Mitsukiyo_Romantic_Smile.ogg`,
  `${path}Track_9_Mitsukiyo_Midsummer_cat.ogg`,
  `${path}Track_4_Mitsukiyo_Lovely_Picnic.ogg`
];
let volume = 0.3;

function initBGM() {
  let random = bgm[Math.floor(Math.random() * bgm.length)];
  if (!bgmAudio) {
    bgmAudio = new Howl({
      src: [random],
      volume: volume,
      format: ["ogg"],
      onloaderror: (id, err) => console.log("Gagal memuat audio:", err),
      onplayerror: (id, err) => console.log("Gagal memutar audio:", err)
    });
    bgmAudio.play();
  } else if (!bgmAudio.playing()) {
    bgmAudio.play();
  }

  bgmAudio.on('end', async function() {
    let random = bgm[Math.floor(Math.random() * bgm.length)];
    await bgmAudio.play.stop;
    bgmAudio = new Howl({
      src: [random],
      volume: volume,
      format: ["ogg"],
      onloaderror: (id, err) => console.log("Gagal memuat audio:", err),
      onplayerror: (id, err) => console.log("Gagal memutar audio:", err)
    });
    await bgmAudio.play();
  });
}

window.onload = () => { initBGM(); };

window.showToast = function(message, type = 'error', duration = 3000) {
  const toast = document.getElementById('toast-notification');
  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast-visible toast-${type}`;

  setTimeout(() => {
    toast.className = 'toast-hidden';
  }, duration);
};

// ================= MEMUAT KONFIGURASI AI & BOND =================
async function loadAiSettings() {
  try {
    const savedConfig = await db.settings.get('ai_config');
    if (savedConfig && savedConfig.value) {
      aiConfig = { ...aiConfig, ...savedConfig.value };
    }
  } catch (err) {
    console.error("Gagal memuat konfigurasi AI:", err);
  }
}

async function addBondExp(charId, emotion) {
  let expGained = 1;
  const emo = emotion ? emotion.toLowerCase() : '';
  if (['senang', 'bahagia'].includes(emo)) expGained = 3;

  try {
    const record = await db.bonds.get(charId);
    let currentExp = record ? record.exp : 0;
    await db.bonds.put({ characterId: charId, exp: currentExp + expGained });
  } catch (err) {
    console.error("Gagal menambahkan EXP Bond:", err);
  }
}

// ================= MANAJEMEN DATA (EXPORT, IMPORT, RESET) =================
function openDataModal() {
  if (!dataModal) return;

  const charName = currentCharacter ? currentCharacter.name : 'Karakter';
  if (modalCharName) modalCharName.textContent = charName;

  dataModal.style.display = 'flex';
}

function initDataModalListeners() {
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (!chatHistory || chatHistory.length === 0) {
        showToast("Tidak ada riwayat percakapan untuk diexport.", "error");
        return;
      }
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(chatHistory, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `chat_${currentCharacter.id}_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast("Riwayat chat berhasil diexport!", "success");
    });
  }

  if (importTriggerBtn && importFileInput) {
    importTriggerBtn.addEventListener('click', () => importFileInput.click());

    importFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedHistory = JSON.parse(event.target.result);
          if (Array.isArray(importedHistory)) {
            chatHistory = importedHistory;
            await saveChatHistory();
            
            if (chatHistory.length > 0) {
              const lastMsg = chatHistory[chatHistory.length - 1];
              const text = lastMsg.parts ? lastMsg.parts.map(p => p.text).join(' ') : '';
              playTypewriterQueue(text);
            }
            
            dataModal.style.display = 'none';
            showToast("Riwayat chat berhasil diimport!", "success");
          } else {
            showToast("Format file JSON tidak valid.", "error");
          }
        } catch (err) {
          showToast("Gagal membaca file JSON.", "error");
        }
      };
      reader.readAsText(file);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      firstLoad = true;
      const charName = currentCharacter ? currentCharacter.name : 'Karakter';
      if (confirm(`Apakah Anda yakin ingin menghapus seluruh percakapan dengan ${charName}?`)) {
        chatHistory = [];
        
        await db.chats.delete(currentCharacter.id);
        
        const greeting = currentCharacter.greeting || "Halo, Sensei!";
        playTypewriterQueue(greeting);

        dataModal.style.display = 'none';
        showToast("Percakapan berhasil direset.", "success");
      }
    });
  }

  if (closeDataBtn) {
    closeDataBtn.addEventListener('click', () => {
      dataModal.style.display = 'none';
    });
  }
}

if (settingBtn) {
  settingBtn.addEventListener('click', () => {
    openDataModal();
  });
}

// ================= TOGGLE MINIMIZE NAVIGASI VIA BURGER BUTTON =================
if (burgerBtn) {
  burgerBtn.addEventListener('click', () => {
    const targetMenu = navMenu || document.getElementById('navMenu');
    if (targetMenu) {
      targetMenu.classList.toggle('collapsed');
    }
  });
}

// ================= CLOSE HISTORY BUTTON =================
if (closeHistoryBtn && historyBox) {
  closeHistoryBtn.addEventListener('click', () => {
    historyBox.style.display = 'none';
  });
}

// ================= EMOSI, LOG, AUDIO & SPRITE CONTROLLER =================
function detectEmotion(rawText) {
  const emotionRegex = /\[EMOSI:\s*(\w+)\]/i;
  const match = rawText ? rawText.match(emotionRegex) : null;
  return match ? match[1].toLowerCase() : 'biasa';
}

function logEmotionText(rawText) {
  if (!rawText) {
    console.log("[LOG EMOSI]: Teks kosong atau tidak valid.");
    return null;
  }
  const emotion = detectEmotion(rawText);
  console.log(`[LOG EMOSI]: ${emotion}`);
  return emotion;
}

function triggerEmotionReaction(rawText) {
  if (firstLoad) return;

  const emotion = logEmotionText(rawText);

  const soundPath = emotionSounds[emotion] || emotionSounds['biasa'];
  if (soundPath) {
    if (typeof Howl !== 'undefined') {
      const sfxAudio = new Howl({
        src: [soundPath],
        volume: 0.6,
        onloaderror: (id, err) => console.log("Gagal memuat audio:", err),
        onplayerror: (id, err) => console.log("Gagal memutar audio:", err)
      });
      
      sfxAudio.play();
    } else {
      const sfxAudio = new Audio(soundPath);
      sfxAudio.volume = 0.6;
      sfxAudio.play().catch(err => console.log("Gagal memutar audio fallback:", err));
    }
  }

  if (spriteImg) {
    let classes = Object.values(shakeEmot);
    const emotiShk = shakeEmot[emotion] || "";
    classes.forEach((item) => { spriteImg.classList.remove(item); });
    
    void spriteImg.offsetWidth;
    spriteImg.classList.add(emotiShk);
  }
}

function updateCharacterSprite(rawText) {
  if (!currentCharacter || !currentCharacter.sprite || !spriteImg) return;
	
  const emotion = detectEmotion(rawText);
  const spritePath = currentCharacter.sprite[emotion] || currentCharacter.sprite['biasa'];

  if (spritePath) {
    spriteImg.src = spritePath;
  }

  if (currentCharacter) {
    addBondExp(currentCharacter.id, emotion);
  }
}

function processEmotionAndText(rawText) {
  const emotionRegex = /\[EMOSI:\s*(\w+)\]/i;
  const match = rawText ? rawText.match(emotionRegex) : null;

  let cleanText = rawText || '';
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

// ================= SISTEM ANIMASI TYPEWRITER PER-INDEX SEGMEN =================
function renderCurrentSegment(onComplete) {
  if (currentSegmentIndex >= currentSegments.length) {
    isTypingAI = false;
    if (onComplete) onComplete();
    return;
  }

  isTypingAI = true;
  chatText.innerHTML = '';
  
  if (typewriterTimer) clearInterval(typewriterTimer);

  const seg = currentSegments[currentSegmentIndex];
  const targetText = seg.text;

  const span = document.createElement('span');
  if (seg.type === 'action') {
    span.className = 'action-text';
  }
  chatText.appendChild(span);

  let charIndex = 0;
  typewriterTimer = setInterval(() => {
    if (charIndex < targetText.length) {
      span.textContent += targetText.charAt(charIndex);
      charIndex++;
      chatText.scrollTop = chatText.scrollHeight;
    } else {
      clearInterval(typewriterTimer);
      isTypingAI = false;
      if (onComplete) onComplete();
    }
  }, 30);
}

function playTypewriterQueue(rawText) {
  updateCharacterSprite(rawText);
  const cleanText = processEmotionAndText(rawText);
  
  currentSegments = parseMessageSegments(cleanText);
  currentSegmentIndex = 0;

  if (currentSegments.length === 0) {
    currentSegments = [{ type: 'speech', text: cleanText }];
  }

  renderCurrentSegment();
}

// ================= MODES & DIALOG INTERACTION =================
function enableInputMode() {
  if (isInputMode || isTypingAI) return;
  
  isInputMode = true;
  if (choiceContainer) {
    choiceContainer.style.display = 'flex';
    choiceInput.innerText = '';
    choiceInput.focus();
  }
}

function disableInputMode() {
  isInputMode = false;
  if (choiceContainer) {
    choiceContainer.style.display = 'none';
    choiceInput.innerText = '';
  }
  speakerName.innerText = currentCharacter ? currentCharacter.name : "AI";
}

if (choiceSendBtn) {
  choiceSendBtn.addEventListener('click', () => {
    executeKirimPesan();
  });
}

if (choiceCancelBtn) {
  choiceCancelBtn.addEventListener('click', () => {
    disableInputMode();
  });
}

if (choiceInput) {
  choiceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeKirimPesan();
    }
  });
}

bubbleChat.addEventListener('click', () => {
  if (isInputMode) return;
  
  if (isTypingAI) {
    clearInterval(typewriterTimer);
    const seg = currentSegments[currentSegmentIndex];
    if (seg) {
      chatText.innerHTML = '';
      const span = document.createElement('span');
      if (seg.type === 'action') span.className = 'action-text';
      span.textContent = seg.text;
      chatText.appendChild(span);
    }
    isTypingAI = false;
    return;
  }

  if (currentSegmentIndex < currentSegments.length - 1) {
    currentSegmentIndex++;
    renderCurrentSegment();
    return;
  }

  enableInputMode();
});

// ================= KIRIM PESAN & API GEMINI =================
async function executeKirimPesan() {
  const activeApiKey = aiConfig.apiKey !== '' ? aiConfig.apiKey : DEFAULT_API_KEY;

  // Keamanan & Pengalihan: Pengalihan ke tutorial.html apabila API Key belum diisi
  if (!activeApiKey || activeApiKey.trim() === '') {
    window.location.href = 'tutorial.html';
    return;
  }

  if (!currentCharacter) {
    showToast("Karakter belum dipilih.", "error");
    return;
  }

  const rawInput = choiceInput.innerText.trim();
  disableInputMode();

  const isDecoy = (rawInput === '' || rawInput === '...' || rawInput.toLowerCase() === '/lanjutkan respon sebelumnya/');

  if (!isDecoy) {
    const segments = parseMessageSegments(rawInput);
    const userParts = segments.map(seg => ({ text: seg.text }));
    chatHistory.push({ role: "user", parts: userParts.length > 0 ? userParts : [{ text: rawInput }] });
  } else {
    chatHistory.push({ 
      role: "user", 
      parts: [{ text: "/lanjutkan respon sebelumnya/" }] 
    });
  }

  await saveChatHistory();

  speakerName.innerText = currentCharacter.name;
  chatText.innerText = `${currentCharacter.name} sedang berpikir...`;

  let historyToUpload = chatHistory;
  if (aiConfig.historyCount > 0 && chatHistory.length > aiConfig.historyCount) {
    historyToUpload = chatHistory.slice(-aiConfig.historyCount);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${aiConfig.model}:generateContent?key=${activeApiKey}`;

  const userProfileContext = aiConfig.userProfile 
    ? `\n\n[DESKRIPSI USER / LAWAN BICARA]:\n${aiConfig.userProfile}` 
    : '';

  const fullSystemInstruction = (currentCharacter.systemInstruction || '') + userProfileContext;

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

    if (response.ok && data.candidates && data.candidates[0].content.parts) {
      const parts = data.candidates[0].content.parts;
      let rawReply = parts.filter(p => p.text && !p.thought).map(p => p.text).join('\n');
      if (!rawReply.trim()) rawReply = parts[parts.length - 1].text;

      firstLoad = false;

      chatHistory.push({ role: "model", parts: [{ text: rawReply }] });
      await saveChatHistory();

      triggerEmotionReaction(rawReply);
      playTypewriterQueue(rawReply);
    } else {
      const errorMsg = data.error?.message || "Gagal memperoleh balasan.";
      showToast(`Error: ${errorMsg}`, "error");
      chatText.innerText = "(Terjadi kesalahan respon)";
    }
  } catch (err) {
    showToast("Koneksi gagal. Periksa jaringan Anda.", "error");
    chatText.innerText = "(Koneksi terputus)";
  }
}

// ================= DEXIE DB & INITIALIZATION =================
async function saveChatHistory() {
  if (!currentCharacter) return;

  try {
    await db.chats.put({
      characterId: currentCharacter.id,
      history: chatHistory
    });
  } catch (err) {
    console.error("Gagal menyimpan ke Dexie:", err);
    showToast("Gagal menyimpan riwayat chat.", "error");
  }
}

async function loadChatHistory() {
  try {
    const activeCharSetting = await db.settings.get('active_character_id');
    const activeCharId = activeCharSetting ? activeCharSetting.value : "nagisa";
    
    currentCharacter = characterList.find(c => c.id === activeCharId) || characterList[0];
    speakerName.innerText = currentCharacter.name;

    const record = await db.chats.get(currentCharacter.id);

    if (record && record.history && record.history.length > 0) {
      chatHistory = record.history;
      const lastMsg = chatHistory[chatHistory.length - 1];
      
      if (lastMsg.role === 'model') {
        const text = lastMsg.parts ? lastMsg.parts.map(p => p.text).join(' ') : '';
        playTypewriterQueue(text);
      } else {
        chatText.innerText = "...";
        updateCharacterSprite("[EMOSI:biasa]");
      }
    } else {
      chatHistory = [];
      const greeting = currentCharacter.greeting || "";
      playTypewriterQueue(greeting);
    }
  } catch (err) {
    console.error("Gagal memuat dari Dexie:", err);
  } finally {
    setTimeout(() => {
      firstLoad = false;
    }, 500);
  }
}

if (historyBtn) {
  historyBtn.addEventListener('click', async () => {
    if (historyBox) {
      if (historyBox.style.display === 'none' || historyBox.style.display === '') {
        renderHistoryModal();
        historyBox.style.display = 'flex';
      } else {
        historyBox.style.display = 'none';
      }
    }
  });
}

function renderHistoryModal() {
  if (!historyContent) return;
  historyContent.innerHTML = '';

  chatHistory.forEach(item => {
    const fullText = item.parts ? item.parts.map(p => p.text).join(' ') : '';
    
    if (item.role === 'user' && (fullText === '...' || fullText.includes('/lanjutkan respon sebelumnya/'))) return;

    const avatar = item.role === 'user' 
      ? 'icon/Sensei.png' 
      : ((currentCharacter && currentCharacter.avatar) || 'icon/Nagisa.png');

    const cleanText = processEmotionAndText(fullText);
    const segments = parseMessageSegments(cleanText);

    if (segments.length === 0) {
      const div = document.createElement('div');
      div.className = `h-msg ${item.role === 'user' ? 'user' : 'bot'}`;
      
      const img = document.createElement('img');
      img.src = avatar;
      img.onerror = () => { img.src = 'icon/Nagisa.png'; };

      const contentDiv = document.createElement('div');
      contentDiv.textContent = cleanText;

      div.appendChild(img);
      div.appendChild(contentDiv);
      historyContent.appendChild(div);
      return;
    }

    segments.forEach(seg => {
      const div = document.createElement('div');
      const isAction = seg.type === 'action';

      div.className = `h-msg ${item.role === 'user' ? 'user' : 'bot'} ${isAction ? 'action' : ''}`;
      
      const img = document.createElement('img');
      img.src = avatar;
      img.onerror = () => { img.src = 'icon/Nagisa.png'; };

      const contentDiv = document.createElement('div');
      if (isAction) contentDiv.className = 'action-text';
      contentDiv.textContent = seg.text;

      div.appendChild(img);
      div.appendChild(contentDiv);
      historyContent.appendChild(div);
    });
  });

  if (historyContent) historyContent.scrollTop = historyContent.scrollHeight;
}

if (exitBtn) {
  exitBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initDataModalListeners();
  await loadAiSettings();
  await loadChatHistory();
});