const c = document.getElementById('c'), x = c.getContext('2d'), bub = document.getElementById('bubble');
const compactIsland = document.getElementById('compact-island');
const islandCollapse = document.getElementById('island-collapse');
const islandPetButton = document.getElementById('island-pet-button');
const islandNotification = document.getElementById('island-notification');
const islandTitle = document.getElementById('island-title');
const islandArtist = document.getElementById('island-artist');
const islandStatus = document.getElementById('island-status');
const chat = document.getElementById('chat'), chatMessage = document.getElementById('chat-message');
const chatTranscript = document.getElementById('chat-transcript');
const chatForm = document.getElementById('chat-form'), chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const chatAttach = document.getElementById('chat-attach');
const chatNew = document.getElementById('chat-new');
const chatHistory = document.getElementById('chat-history');
const chatDemo = document.getElementById('chat-demo');
const chatHistoryPanel = document.getElementById('chat-history-panel');
const chatHistoryList = document.getElementById('chat-history-list');
const chatCurrent = document.getElementById('chat-current');
const attachmentList = document.getElementById('attachments');
let CX = 48, CY = 40;
let mood = 'idle', moodT = 0, t = 0, bobPhase = 0, look = { x: 0, y: 0 };
let musicPlaying = false, musicStyle = 'calm', musicMotion = 0, musicPhase = 0;
let blinkPulse = 0, blinkTimer = 0, blinkCountdown = 3 + Math.random() * 3, chatOpen = false;
let pointerOver = false, characterHovered = false, hoverStartedAt = 0, hoverAmount = 0, dropAmount = 0, dropPulse = 0, affection = false;
let entranceAmount = 1, greetingAmount = 0, clickAmount = 0;
let attachedFiles = [], previousFrameAt = 0, animationFramePending = false;
let activeChatRequestId = null, chatRequestSequence = 0;
let streamingEntry = null, streamingTextNode = null;
let currentConversation = createConversation();
let notificationTimer;
let mediaHideTimer;
let animationDemoTimer = null;
let animationDemoIndex = -1;
const MAX_TRANSCRIPT_MESSAGES = 80;
const MEDIA_PAUSE_HIDE_MS = 6000;
const EMOTION_COLORS = { happy:'#d7e4d8', joy:'#f0dfae', worried:'#e4d9c9', sad:'#d1d8df', sleepy:'#d2d2d0', thinking:'#dce2d5', annoyed:'#dfd3d0', dizzy:'#e3dfc9', angry:'#e62424', confused:'#ddd6c9', love:'#edc7d7', excited:'#f1d29d' };
const graphics = window.PipPetGraphics.createPetGraphics(x, EMOTION_COLORS);
let appearance = { color: '#d4d7d4', outfit: 'none', hair: 'none', accessory: 'none' };
window.api.getAppearance().then((value) => { appearance = { ...appearance, ...value }; graphics.setBaseColor(appearance.color); requestDraw(); }).catch(() => {});
window.api.onEvent((event) => {
  if (event?.type === 'appearance') { appearance = { ...appearance, ...event.appearance }; graphics.setBaseColor(appearance.color); requestDraw(); }
});
const STICKY = ['worried', 'sleepy', 'love'];
const REST_POSE = { eyeOpen:1, eyeLookX:0, eyeLookY:0, eyeScale:1, squash:0, bodyTilt:0, bobAmplitude:2, bobSpeed:2,
  emotion:{ happy:0, joy:0, worried:0, sad:0, sleepy:0, thinking:0, annoyed:0, dizzy:0, angry:0, confused:0, love:0, excited:0 } };
const MOOD_POSES = {
  idle: REST_POSE,
  happy: { eyeOpen:0.92, eyeLookX:0, eyeLookY:0, eyeScale:1.05, squash:-0.025, bodyTilt:0, bobAmplitude:2.5, bobSpeed:3.1,
    emotion:{ ...REST_POSE.emotion, happy:1 } },
  joy: { eyeOpen:0.94, eyeLookX:0, eyeLookY:0, eyeScale:1.1, squash:-0.035, bodyTilt:0, bobAmplitude:3, bobSpeed:3.4,
    emotion:{ ...REST_POSE.emotion, joy:1 } },
  worried: { eyeOpen:1, eyeLookX:0, eyeLookY:-0.25, eyeScale:1.05, squash:0.01, bodyTilt:0.012, bobAmplitude:1, bobSpeed:2.8,
    emotion:{ ...REST_POSE.emotion, worried:1 } },
  sad: { eyeOpen:0.72, eyeLookX:0, eyeLookY:0.35, eyeScale:0.96, squash:0.07, bodyTilt:-0.025, bobAmplitude:1, bobSpeed:1.5,
    emotion:{ ...REST_POSE.emotion, sad:1 } },
  sleepy: { eyeOpen:0.36, eyeLookX:0, eyeLookY:0.22, eyeScale:1, squash:0.02, bodyTilt:0.01, bobAmplitude:1.2, bobSpeed:1.2,
    emotion:{ ...REST_POSE.emotion, sleepy:1 } },
  thinking: { eyeOpen:0.78, eyeLookX:0.25, eyeLookY:-0.18, eyeScale:1.04, squash:0, bodyTilt:0.012, bobAmplitude:1.8, bobSpeed:2.8,
    emotion:{ ...REST_POSE.emotion, thinking:1 } },
  annoyed: { eyeOpen:0.72, eyeLookX:0, eyeLookY:0.12, eyeScale:0.98, squash:0.04, bodyTilt:-0.02, bobAmplitude:0.8, bobSpeed:4,
    emotion:{ ...REST_POSE.emotion, annoyed:1 } },
  dizzy: { eyeOpen:0.82, eyeLookX:0, eyeLookY:0, eyeScale:1.12, squash:-0.02, bodyTilt:0, bobAmplitude:3, bobSpeed:3,
    emotion:{ ...REST_POSE.emotion, dizzy:1 } },
  angry: { eyeOpen:0.48, eyeLookX:0, eyeLookY:0.1, eyeScale:1.02, squash:0.012, bodyTilt:0.006, bobAmplitude:0.55, bobSpeed:2.2,
    emotion:{ ...REST_POSE.emotion, angry:1 } },
  confused: { eyeOpen:0.92, eyeLookX:0.25, eyeLookY:-0.12, eyeScale:1.04, squash:0, bodyTilt:0.045, bobAmplitude:1.4, bobSpeed:2.4,
    emotion:{ ...REST_POSE.emotion, confused:1 } },
  love: { eyeOpen:0.72, eyeLookX:0, eyeLookY:0, eyeScale:1.14, squash:-0.04, bodyTilt:0, bobAmplitude:2.5, bobSpeed:2.5,
    emotion:{ ...REST_POSE.emotion, love:1 } },
  excited: { eyeOpen:1, eyeLookX:0, eyeLookY:-0.08, eyeScale:1.1, squash:-0.035, bodyTilt:0, bobAmplitude:3.5, bobSpeed:3.2,
    emotion:{ ...REST_POSE.emotion, excited:1 } },
};
const pose = { ...REST_POSE, emotion:{ ...REST_POSE.emotion } };
let poseTarget = { ...REST_POSE, emotion:{ ...REST_POSE.emotion } };
const AMBIENT_MOODS = ['angry', 'confused', 'excited'];
const ANIMATION_DEMO = [
  ['angry', 'Raiva'], ['confused', 'Confusão'], ['sad', 'Tristeza'],
  ['joy', 'Alegria'], ['happy', 'Felicidade'], ['love', 'Amor'], ['excited', 'Empolgação'],
];
let nextAmbientMoodAt = Date.now() + 22_000 + Math.random() * 12_000;

function setMood(m) {
  mood = MOOD_POSES[m] ? m : 'idle';
  moodT = 0;
  if (!AMBIENT_MOODS.includes(mood)) nextAmbientMoodAt = Date.now() + 20_000 + Math.random() * 15_000;
  const target = MOOD_POSES[mood];
  poseTarget = { ...target, emotion:{ ...target.emotion } };
}
function stopAnimationDemo() {
  if (!animationDemoTimer) return;
  clearInterval(animationDemoTimer);
  animationDemoTimer = null;
  animationDemoIndex = -1;
  chatDemo.textContent = '▶';
  chatDemo.title = 'Testar animações';
  chatDemo.setAttribute('aria-label', 'Testar animações do Pip');
  chatDemo.setAttribute('aria-pressed', 'false');
  setMood('idle');
}
function toggleAnimationDemo() {
  if (animationDemoTimer) {
    stopAnimationDemo();
    chatMessage.textContent = 'Demonstração encerrada.';
    return;
  }
  chatDemo.textContent = '■';
  chatDemo.title = 'Parar demonstração';
  chatDemo.setAttribute('aria-label', 'Parar demonstração de animações');
  chatDemo.setAttribute('aria-pressed', 'true');
  const showNextMood = () => {
    animationDemoIndex = (animationDemoIndex + 1) % ANIMATION_DEMO.length;
    const [nextMood, label] = ANIMATION_DEMO[animationDemoIndex];
    setMood(nextMood);
    chatMessage.textContent = `Testando animação: ${label}`;
  };
  showNextMood();
  animationDemoTimer = setInterval(showNextMood, 2200);
}
function smooth(current, target, elapsed, rate = 9) {
  return current + (target - current) * (1 - Math.exp(-elapsed * rate));
}
function updatePose(elapsed) {
  for (const key of ['eyeOpen', 'eyeScale', 'squash', 'bodyTilt', 'bobAmplitude', 'bobSpeed']) {
    pose[key] = smooth(pose[key], poseTarget[key], elapsed);
  }
  const gazeInfluence = poseTarget.emotion.angry > 0 ? 0.04 : 0.28;
  pose.eyeLookX = smooth(pose.eyeLookX, poseTarget.eyeLookX + look.x * gazeInfluence, elapsed, 12);
  pose.eyeLookY = smooth(pose.eyeLookY, poseTarget.eyeLookY + look.y * gazeInfluence * 0.8, elapsed, 12);
  for (const name of Object.keys(EMOTION_COLORS)) {
    pose.emotion[name] = smooth(pose.emotion[name], poseTarget.emotion[name], elapsed);
  }
}
function createConversation() {
  const id = globalThis.crypto?.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return { id, title: 'Conversa nova', messages: [] };
}

function updateConversationTitle() {
  const firstQuestion = currentConversation.messages.find((message) => message.role === 'user')?.text || '';
  currentConversation.title = firstQuestion.replace(/\s+/g, ' ').trim().slice(0, 64) || 'Conversa com o Pip';
  chatCurrent.title = currentConversation.title;
}

async function saveCurrentConversation() {
  if (!currentConversation.messages.length) return;
  updateConversationTitle();
  try {
    await window.api.saveConversation(currentConversation);
  } catch (error) {
    chatMessage.textContent = error.message || 'Não consegui salvar esta conversa.';
  }
}

function showConversation(conversation) {
  currentConversation = {
    id: conversation.id,
    title: conversation.title || 'Conversa com o Pip',
    messages: Array.isArray(conversation.messages) ? conversation.messages : [],
  };
  chatCurrent.title = currentConversation.title;
  chatTranscript.replaceChildren();
  for (const message of currentConversation.messages) appendTranscriptMessage(message.role, message.text);
  chatMessage.textContent = 'Conversa aberta.';
  chatHistoryPanel.hidden = true;
}

async function renderConversationHistory() {
  chatHistoryList.replaceChildren();
  chatHistoryList.append(Object.assign(document.createElement('p'), {
    className: 'history-empty', textContent: 'Carregando conversas…',
  }));
  try {
    const conversations = await window.api.listConversations();
    chatHistoryList.replaceChildren();
    if (!conversations.length) {
      chatHistoryList.append(Object.assign(document.createElement('p'), {
        className: 'history-empty', textContent: 'As conversas enviadas serão salvas aqui.',
      }));
      return;
    }
    for (const conversation of conversations) {
      const row = document.createElement('div');
      row.className = 'history-row';
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'history-item';
      const title = document.createElement('span');
      title.className = 'history-item-title';
      title.textContent = conversation.title || 'Conversa com o Pip';
      const date = document.createElement('time');
      date.className = 'history-item-date';
      date.textContent = new Date(conversation.updatedAt).toLocaleDateString('pt-BR');
      item.append(title, date);
      item.addEventListener('click', () => showConversation(conversation));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'history-delete';
      remove.textContent = '×';
      remove.title = 'Apagar conversa';
      remove.setAttribute('aria-label', `Apagar conversa ${conversation.title || 'Conversa com o Pip'}`);
      remove.addEventListener('click', () => deleteConversation(conversation));
      row.append(item, remove);
      chatHistoryList.append(row);
    }
  } catch (error) {
    chatHistoryList.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'history-empty', textContent: error.message || 'Não consegui carregar as conversas.',
    }));
  }
}

async function toggleConversationHistory() {
  if (!chatHistoryPanel.hidden) {
    chatHistoryPanel.hidden = true;
    return;
  }
  chatHistoryPanel.hidden = false;
  await renderConversationHistory();
}

async function deleteConversation(conversation) {
  const title = conversation.title || 'Conversa com o Pip';
  if (!window.confirm(`Apagar a conversa "${title}" permanentemente?`)) return;
  try {
    const removed = await window.api.deleteConversation(conversation.id);
    if (!removed) throw new Error('Esta conversa já foi apagada.');
    if (currentConversation.id === conversation.id) {
      currentConversation = createConversation();
      chatCurrent.title = 'Conversa nova';
      chatTranscript.replaceChildren();
      chatMessage.textContent = 'Conversa apagada.';
    }
    await renderConversationHistory();
  } catch (error) {
    chatHistoryList.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'history-empty', textContent: error.message || 'Não consegui apagar esta conversa.',
    }));
  }
}

async function startNewConversation() {
  if (activeChatRequestId) return;
  await saveCurrentConversation();
  currentConversation = createConversation();
  chatCurrent.title = 'Conversa nova';
  chatTranscript.replaceChildren();
  chatMessage.textContent = '';
  chatHistoryPanel.hidden = true;
  attachedFiles = [];
  renderAttachments();
  try { await window.api.clearAttachments(); } catch {}
  chatInput.focus();
}
function classifyMusicStyle(media) {
  const genres = Array.isArray(media?.genres) ? media.genres : typeof media?.genre === 'string' ? [media.genre] : [];
  const genreText = genres.join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\b(nu[ -]?metal|metalcore|deathcore|hardcore|thrash|heavy metal|hard rock|punk rock|industrial rock|grunge|metal)\b/.test(genreText)) return 'heavy';
  if (/\b(acoustic|ambient|chill|classical|lo[ -]?fi|lounge|soft rock|folk|piano|sleep|relax|new age|bossa nova|jazz|meditation|downtempo)\b/.test(genreText)) return 'calm';
  const artistText = `${media?.artist || ''} ${media?.title || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\b(korn|slipknot|linkin park|limp bizkit|system of a down|deftones|disturbed|rammstein|sepultura|metallica|pantera|slayer|rage against the machine|bring me the horizon)\b/.test(artistText)) return 'heavy';
  return 'calm';
}

function say(text, ms = 7000) {
  if (chatOpen) { chatMessage.textContent = text; return; }
  islandNotification.textContent = text;
  document.body.classList.add('has-notification');
  clearTimeout(notificationTimer);
  if (ms > 0) notificationTimer = setTimeout(() => {
    document.body.classList.remove('has-notification');
  }, ms);
}

function showChatThinking() {
  chatMessage.replaceChildren();
  const label = document.createElement('span');
  label.textContent = 'Pip está pensando';
  const dots = document.createElement('span');
  dots.className = 'thinking-dots';
  dots.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 3; index += 1) {
    const dot = document.createElement('i');
    dots.append(dot);
  }
  chatMessage.append(label, dots);
  chatMessage.classList.add('is-thinking');
}

function setChatMessage(text) {
  chatMessage.classList.remove('is-thinking');
  chatMessage.textContent = text;
}

function showChatProgress(requestId, chunk) {
  if (requestId !== activeChatRequestId || typeof chunk !== 'string' || !chunk) return;
  setChatMessage('');
  if (!streamingEntry) {
    streamingEntry = document.createElement('div');
    streamingEntry.className = 'chat-entry chat-stream-entry';
    streamingTextNode = document.createTextNode('');
    streamingEntry.append(streamingTextNode);
    chatTranscript.append(streamingEntry);
  }
  streamingTextNode.data += chunk;
  chatTranscript.scrollTop = chatTranscript.scrollHeight;
}

function discardStreamingPreview() {
  streamingEntry?.remove();
  streamingEntry = null;
  streamingTextNode = null;
}

function updateMedia(media) {
  const title = typeof media?.title === 'string' ? media.title.trim() : '';
  const artist = typeof media?.artist === 'string' ? media.artist.trim() : '';
  const available = !!(title || artist);
  const playing = available && media?.playing === true;
  clearTimeout(mediaHideTimer);
  musicPlaying = playing;
  musicStyle = available ? classifyMusicStyle(media) : 'calm';
  if (playing && !document.body.classList.contains('media-playing')) musicPhase = 0;
  document.body.classList.toggle('media-available', available);
  document.body.classList.toggle('media-playing', playing);
  islandTitle.textContent = title;
  islandArtist.textContent = artist;
  islandStatus.textContent = playing ? 'TOCANDO' : available ? 'PAUSADA' : '';
  if (available && !playing) {
    mediaHideTimer = setTimeout(() => {
      if (musicPlaying) return;
      document.body.classList.remove('media-available', 'media-playing');
      islandTitle.textContent = '';
      islandArtist.textContent = '';
      islandStatus.textContent = '';
      musicStyle = 'calm';
    }, MEDIA_PAUSE_HIDE_MS);
  }
}

function islandPoint(clientX, clientY) {
  const bounds = c.getBoundingClientRect();
  return { x: clientX - bounds.left, y: clientY - bounds.top };
}

function isPetAtClientPoint(clientX, clientY, radius = 58) {
  const point = islandPoint(clientX, clientY);
  return Math.hypot(point.x - CX, point.y - CY) < radius;
}

function movePetToChat() {
  chat.prepend(c);
  CX = 52;
  CY = window.innerHeight - 54;
}

function movePetToIsland() {
  compactIsland.prepend(c);
  CX = 48;
  CY = 40;
}

function resizeCanvas() {
  const height = Math.max(250, Math.round(window.innerHeight));
  if (c.height !== height) c.height = height;
  c.style.height = `${height}px`;
  CY = chatOpen ? height - 54 : 40;
  requestDraw();
}

function openChat() {
  if (chatOpen) return;
  chatOpen = true;
  // Keep the mascot in its familiar resting pose when the larger chat opens.
  clickAmount = 0.45;
  setMood(activeChatRequestId ? 'thinking' : 'idle');
  movePetToChat();
  document.body.classList.add('chat-open');
  bub.style.display = 'none';
  window.api.openChat();
  requestAnimationFrame(() => chatInput.focus());
}

function cancelActiveChatRequest() {
  if (!activeChatRequestId) return false;
  window.api.cancelAsk(activeChatRequestId);
  chatInput.disabled = true;
  chatSend.disabled = true;
  chatSend.textContent = 'Cancelando…';
  chatSend.dataset.cancelling = 'true';
  chatMessage.textContent = 'Cancelando…';
  return true;
}

function closeChat() {
  if (!chatOpen) return;
  stopAnimationDemo();
  chatOpen = false;
  movePetToIsland();
  document.body.classList.remove('chat-open');
  window.api.closeChat();
}

function appendTranscriptMessage(_role, text) {
  if (typeof text !== 'string' || !text) return;
  const entry = document.createElement('div');
  entry.className = 'chat-entry';
  appendFormattedMessage(entry, text);
  chatTranscript.append(entry);
  while (chatTranscript.childElementCount > MAX_TRANSCRIPT_MESSAGES) chatTranscript.firstElementChild.remove();
  chatTranscript.scrollTop = chatTranscript.scrollHeight;
}

const CODE_KEYWORDS = new Set(('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var ' +
  'as assert async await class def del elif except finally from global in is lambda nonlocal not or pass raise try while with yield ' +
  'export extends implements instanceof new private protected public static super this throw throws typeof void delete enum declare keyof type namespace readonly satisfies ' +
  'fn let mut pub use mod impl trait match loop move ref self Self where crate dyn async await unsafe extern const static ' +
  'function var do then fi end local true false null nil None True False and or not echo if elif else fi done case esac select until ' +
  'package import func type var struct interface map range go defer chan string int int8 int16 int32 int64 uint byte rune bool error float32 float64 any').split(/\s+/));

function appendFormattedMessage(container, text) {
  const fencedCode = /```([^\r\n`]*)\r?\n([\s\S]*?)```/g;
  let cursor = 0;
  let match;
  while ((match = fencedCode.exec(text))) {
    if (match.index > cursor) container.append(document.createTextNode(text.slice(cursor, match.index)));
    container.append(createCodeBlock(match[2].replace(/\r?\n$/, ''), match[1].trim()));
    cursor = fencedCode.lastIndex;
  }
  if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)));
}

function createCodeBlock(source, language) {
  const block = document.createElement('div');
  block.className = 'chat-code-block';
  const toolbar = document.createElement('div');
  toolbar.className = 'chat-code-toolbar';
  const languageLabel = document.createElement('span');
  languageLabel.className = 'chat-code-language';
  languageLabel.textContent = language || 'código';
  const copy = document.createElement('button');
  copy.className = 'chat-code-copy';
  copy.type = 'button';
  setCodeCopyIcon(copy, false);
  copy.title = 'Copiar código';
  copy.setAttribute('aria-label', 'Copiar código');
  copy.addEventListener('click', async () => {
    try {
      await copyCodeToClipboard(source);
      setCodeCopyIcon(copy, true);
      copy.title = 'Copiado';
      copy.setAttribute('aria-label', 'Código copiado');
      setTimeout(() => {
        setCodeCopyIcon(copy, false);
        copy.title = 'Copiar código';
        copy.setAttribute('aria-label', 'Copiar código');
      }, 1400);
    } catch {
      copy.title = 'Não foi possível copiar';
      copy.setAttribute('aria-label', 'Não foi possível copiar o código');
    }
  });
  toolbar.append(languageLabel, copy);
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.className = 'chat-code';
  appendHighlightedCode(code, source);
  pre.append(code);
  block.append(toolbar, pre);
  return block;
}

function setCodeCopyIcon(button, copied) {
  if (copied) {
    button.textContent = '✓';
    return;
  }
  const ns = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(ns, 'svg');
  icon.setAttribute('viewBox', '0 0 20 20');
  icon.setAttribute('width', '18');
  icon.setAttribute('height', '18');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '1.6');
  icon.setAttribute('stroke-linejoin', 'round');
  const rear = document.createElementNS(ns, 'rect');
  rear.setAttribute('x', '6'); rear.setAttribute('y', '3'); rear.setAttribute('width', '10'); rear.setAttribute('height', '12'); rear.setAttribute('rx', '1.5');
  const front = document.createElementNS(ns, 'rect');
  front.setAttribute('x', '3'); front.setAttribute('y', '6'); front.setAttribute('width', '10'); front.setAttribute('height', '12'); front.setAttribute('rx', '1.5');
  icon.append(rear, front);
  button.replaceChildren(icon);
}

async function copyCodeToClipboard(source) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(source); return; } catch {}
  }
  const field = document.createElement('textarea');
  field.value = source;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('Clipboard indisponível');
}

function appendHighlightedCode(container, source) {
  const tokens = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b|[^\s]|\s+/g;
  for (const match of source.matchAll(tokens)) {
    const value = match[0];
    let kind = '';
    if (/^(\/\/|\/\*|#)/.test(value)) kind = 'comment';
    else if (/^("|'|`)/.test(value)) kind = 'string';
    else if (/^\d/.test(value)) kind = 'number';
    else if (CODE_KEYWORDS.has(value)) kind = 'keyword';
    if (!kind) container.append(document.createTextNode(value));
    else {
      const token = document.createElement('span');
      token.className = `syntax-${kind}`;
      token.textContent = value;
      container.append(token);
    }
  }
}

function renderAttachments() {
  attachmentList.replaceChildren();
  for (const file of attachedFiles) {
    const chip = document.createElement('span');
    chip.className = 'attachment';
    const name = document.createElement('span');
    name.className = 'attachment-name';
    name.textContent = file.name;
    const remove = document.createElement('button');
    remove.className = 'attachment-remove';
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remover ${file.name}`);
    remove.addEventListener('click', async () => {
      try {
        await window.api.clearAttachments();
        attachedFiles = [];
        renderAttachments();
      } catch (error) {
        chatMessage.textContent = error.message || 'Não consegui remover o arquivo.';
      }
    });
    chip.append(name, remove);
    attachmentList.append(chip);
  }
}

async function attachFiles(result) {
  try {
    const files = await result;
    if (!files.length) return;
    attachedFiles = files;
    renderAttachments();
    openChat();
    chatMessage.textContent = files.length === 1
      ? `${files[0].name} anexado. Faça uma pergunta sobre o arquivo.`
      : `${files.length} arquivos anexados. Faça uma pergunta sobre eles.`;
    setMood('happy');
  } catch (error) {
    setMood('worried');
    say(error.message || 'Não consegui anexar esse arquivo.', 6000);
  }
}

function isFileDropTarget(event) {
  return chat.contains(event.target) || compactIsland.contains(event.target) || isPetAtClientPoint(event.clientX, event.clientY);
}

document.addEventListener('dragover', (event) => {
  if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
  event.preventDefault();
  const wasDraggingOverPip = document.body.classList.contains('file-dragging');
  const accepted = chatOpen || isFileDropTarget(event);
  document.body.classList.toggle('file-dragging', accepted);
  if (accepted) document.body.classList.add('island-expanded');
  if (accepted && !wasDraggingOverPip) dropPulse = 1;
  if (accepted) event.dataTransfer.dropEffect = 'copy';
});
document.addEventListener('dragleave', (event) => {
  if (!event.relatedTarget || !document.documentElement.contains(event.relatedTarget)) {
    document.body.classList.remove('file-dragging');
  }
});
document.addEventListener('drop', (event) => {
  if (!event.dataTransfer?.files?.length) return;
  event.preventDefault();
  document.body.classList.remove('file-dragging');
  if (!chatOpen && !isFileDropTarget(event)) return;
  attachFiles(window.api.attachFiles(Array.from(event.dataTransfer.files)));
});

window.api.onEvent((e) => {
  switch (e.type) {
    case 'hello': entranceAmount = 0; greetingAmount = 1; setMood('happy'); say('Oi! Estou aqui quando você precisar.', 4500); break;
    case 'cursor': {
      const point = islandPoint(e.x, e.y);
      look = { x: Math.max(-1, Math.min(1, (point.x - CX) / 45)), y: Math.max(-1, Math.min(1, (point.y - CY) / 35)) };
      break;
    }
    case 'worried': setMood('worried'); if (e.text) say(e.text, 6000); break;
    case 'relieved': if (mood === 'worried') { setMood('happy'); say('Sem erros agora!', 3000); } break;
    case 'saved': if (!STICKY.includes(mood)) setMood('joy'); break;
    case 'happy': setMood('joy'); say(e.text || 'Passou!', 4000); break;
    case 'sad':
      setMood('sad');
      if (!activeChatRequestId) say(e.text || 'Falhou. Quer ajuda?', 5000);
      break;
    case 'sleepy': setMood('sleepy'); break;
    case 'wake': if (mood === 'sleepy') setMood('idle'); break;
    case 'thinking':
      setMood('thinking');
      if (activeChatRequestId) showChatThinking();
      else say(e.text || 'Pensando…', 30000);
      break;
    case 'chat-progress': showChatProgress(e.requestId, e.chunk); break;
    case 'cancelled': setMood('idle'); if (chatOpen) setChatMessage('Parei por aqui.'); break;
    case 'answer':
      setMood('joy');
      // A resposta do chat local é salva pelo resultado do pedido abaixo.
      // Eventos sem pedido local continuam sendo avisos da ilha.
      if (!activeChatRequestId) say(e.text);
      break;
    case 'chat-opened': resizeCanvas(); chatInput.focus(); break;
    case 'chat-dismissed':
      chatOpen = false;
      movePetToIsland();
      document.body.classList.remove('chat-open');
      resizeCanvas();
      break;
    case 'media': updateMedia(e.media); break;
  }
});

islandCollapse.addEventListener('click', (event) => {
  event.stopPropagation();
  document.body.classList.remove('island-expanded');
});
islandPetButton.addEventListener('click', (event) => {
  event.stopPropagation();
  openChat();
});

document.addEventListener('mousemove', (e) => {
  const onPetSurface = chatOpen ? chat.contains(e.target) : compactIsland.contains(e.target);
  const point = islandPoint(e.clientX, e.clientY);
  const onCharacter = onPetSurface && Math.hypot(point.x - CX, point.y - CY) < 74;
  const over = compactIsland.contains(e.target) || bub.contains(e.target) || chat.contains(e.target);
  if (over !== pointerOver) {
    pointerOver = over;
    window.api.setInteractive(over);
  }
  if (onCharacter !== characterHovered) {
    characterHovered = onCharacter;
    hoverStartedAt = onCharacter ? Date.now() : 0;
    if (!onCharacter) {
      affection = false;
      if (mood === 'love') setMood('idle');
    }
  }
  if (characterHovered && hoverStartedAt && Date.now() - hoverStartedAt >= 2000) {
    affection = true;
    if (mood !== 'love') setMood('love');
  }
});
document.addEventListener('click', (event) => {
  if (compactIsland.contains(event.target)) {
    if (document.body.classList.contains('island-expanded')
      && isPetAtClientPoint(event.clientX, event.clientY, 54)) {
      openChat();
    }
    document.body.classList.add('island-expanded');
    return;
  }
});
bub.addEventListener('click', () => { bub.style.display = 'none'; });
document.getElementById('chat-close').addEventListener('click', closeChat);
chatDemo.addEventListener('click', toggleAnimationDemo);
chatNew.addEventListener('click', startNewConversation);
chatHistory.addEventListener('click', toggleConversationHistory);
document.getElementById('chat-settings').addEventListener('click', () => {
  window.api.openSettings();
});
chatAttach.addEventListener('click', () => attachFiles(window.api.chooseFiles()));
chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (activeChatRequestId) { cancelActiveChatRequest(); return; }
  stopAnimationDemo();
  const question = chatInput.value.trim();
  if (!question || chatInput.disabled) return;
  const requestId = `pip-overlay-chat-${Date.now()}-${++chatRequestSequence}`;
  activeChatRequestId = requestId;
  discardStreamingPreview();
  chatInput.disabled = true;
  chatNew.disabled = true;
  chatHistory.disabled = true;
  chatDemo.disabled = true;
  chatAttach.disabled = true;
  chatSend.disabled = false;
  chatSend.textContent = 'Cancelar';
  chatSend.dataset.cancelling = 'false';
  currentConversation.messages.push({ role: 'user', text: question });
  await saveCurrentConversation();
  chatInput.value = '';
  chatMessage.textContent = 'Pensando…';
  showChatThinking();
  setMood('thinking');
  try {
    const result = await window.api.ask(question, requestId, currentConversation.id);
    if (result.cancelled) {
      discardStreamingPreview();
      currentConversation.messages.push({ role: 'pip', text: result.text || 'Parei por aqui.' });
      appendTranscriptMessage('pip', result.text || 'Parei por aqui.');
      await saveCurrentConversation();
      setMood('idle');
      setChatMessage(result.text || 'Parei por aqui.');
      return;
    }
    discardStreamingPreview();
    currentConversation.messages.push({ role: 'pip', text: result.text || '' });
    appendTranscriptMessage('pip', result.text);
    await saveCurrentConversation();
    setMood(result.ok === false ? 'sad' : 'joy');
    setChatMessage(result.ok === false ? result.text : 'Sua vez.');
  } catch (error) {
    discardStreamingPreview();
    setMood('sad');
    const message = error.message || 'Não consegui enviar a pergunta.';
    currentConversation.messages.push({ role: 'pip', text: message });
    appendTranscriptMessage('pip', message);
    await saveCurrentConversation();
    setChatMessage('A pergunta não foi enviada.');
  } finally {
    activeChatRequestId = null;
    chatInput.disabled = false;
    chatNew.disabled = false;
    chatHistory.disabled = false;
    chatDemo.disabled = false;
    chatAttach.disabled = false;
    chatSend.disabled = false;
    chatSend.textContent = '↑';
    chatSend.dataset.cancelling = 'false';
    chatInput.value = '';
    chatInput.focus();
  }
});
document.addEventListener('keydown', (event) => {
  if (!chatOpen) return;
  if (event.key === 'Escape') { event.preventDefault(); closeChat(); }
  else if (event.target === chatInput && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

function draw(timestamp) {
  animationFramePending = false;
  if (document.visibilityState === 'hidden') {
    previousFrameAt = timestamp;
    return;
  }
  // Cap delayed frames so animations never jump after the window resumes or briefly stalls.
  const elapsed = previousFrameAt ? Math.min(0.05, Math.max(0, (timestamp - previousFrameAt) / 1000)) : 1 / 60;
  previousFrameAt = timestamp;
  t += elapsed; moodT += elapsed;
  bobPhase = (bobPhase + elapsed * pose.bobSpeed) % (Math.PI * 2);
  musicMotion = smooth(musicMotion, musicPlaying ? 1 : 0, elapsed, 3.5);
  if (musicPlaying) musicPhase += elapsed;
  if (characterHovered && hoverStartedAt && !affection && Date.now() - hoverStartedAt >= 2000) affection = true;
  hoverAmount = smooth(hoverAmount, characterHovered ? 1 : 0, elapsed, 10);
  const dropTarget = document.body.classList.contains('file-dragging') ? 1 : 0;
  dropAmount = smooth(dropAmount, dropTarget, elapsed, dropTarget ? 7 : 5);
  dropPulse = smooth(dropPulse, 0, elapsed, 4.5);
  if (!STICKY.includes(mood) && mood !== 'thinking' && moodT > 3) setMood('idle');
  if (!chatOpen && !document.body.classList.contains('island-expanded') && mood === 'idle' && Date.now() >= nextAmbientMoodAt) {
    const nextMood = AMBIENT_MOODS[Math.floor(Math.random() * AMBIENT_MOODS.length)];
    nextAmbientMoodAt = Date.now() + 22_000 + Math.random() * 18_000;
    setMood(nextMood);
  }
  updatePose(elapsed);
  if (blinkTimer > 0) blinkTimer = Math.max(0, blinkTimer - elapsed);
  else if ((blinkCountdown -= elapsed) <= 0) {
    blinkTimer = 0.085;
    blinkCountdown = 3.5 + Math.random() * 4;
  }
  blinkPulse = smooth(blinkPulse, blinkTimer > 0 ? 1 : 0, elapsed, blinkTimer > 0 ? 48 : 24);
  x.clearRect(0, 0, c.width, c.height);
  entranceAmount = smooth(entranceAmount, 1, elapsed, 7);
  greetingAmount = smooth(greetingAmount, 0, elapsed, 1.8);
  clickAmount = smooth(clickAmount, 0, elapsed, 14);
  const musicRate = musicStyle === 'heavy' ? 8.5 : 4.2;
  const musicBeat = Math.sin(musicPhase * musicRate);
  const happy = pose.emotion.happy;
  const celebration = Math.min(1, pose.emotion.joy + pose.emotion.excited);
  const mediaIsland = !chatOpen && document.body.classList.contains('island-expanded')
    && document.body.classList.contains('media-available');
  const motionScale = chatOpen ? 0.32 : mediaIsland ? 0.12 : 1;
  const bobWave = Math.sin(bobPhase) * (1 - celebration)
    + (1 - Math.cos(bobPhase)) * 0.5 * celebration;
  const musicBob = musicMotion * musicBeat * (musicStyle === 'heavy' ? 4.5 : 2.5) * motionScale;
  const oy = (1 - entranceAmount) * -38 + bobWave * pose.bobAmplitude * motionScale + musicBob;
  const ox = Math.sin(bobPhase) * (pose.emotion.worried * 1.5 + pose.emotion.angry * 0.7) * motionScale;
  const confusionTilt = Math.sin(t * 2.2) * 0.11 * pose.emotion.confused;
  const musicTilt = (pose.bodyTilt + confusionTilt + musicBeat * (musicStyle === 'heavy' ? 0.02 : 0.045) * musicMotion) * motionScale;
  const musicSquash = musicStyle === 'heavy'
    ? Math.max(0, musicBeat) * 0.09 * musicMotion * motionScale
    : -Math.cos(musicPhase * musicRate) * 0.018 * musicMotion * motionScale;
  const excitementSquash = Math.sin(bobPhase * 2) * 0.018 * pose.emotion.excited * motionScale;
  const squash = Math.max(-0.15, Math.min(0.25, pose.squash * motionScale + clickAmount * 0.12 * motionScale + dropPulse * 0.06 + musicSquash + excitementSquash));
  const receiveLift = Math.sin((1 - dropPulse) * Math.PI) * dropPulse * 4;
  const w = (64 + hoverAmount * 2 + clickAmount * 4 + dropPulse * 2) * (1 + squash);
  const h = (42 + hoverAmount * 2) * (1 - squash);
  const cx = CX + ox, cy = CY + oy + (42 - h) / 2 - receiveLift;
  const shellRadius = h * 0.34;
  x.save(); x.translate(cx, cy); x.rotate(musicTilt); x.translate(-cx, -cy);
  graphics.drawHeadsetBand(cx, cy - h / 2, w, Math.max(musicStyle === 'calm' ? musicMotion : 0, appearance.accessory === 'headphones' ? 1 : 0));
  if (greetingAmount > 0.02 && dropAmount < 0.1) {
    const wavePhase = t * 7.5;
    const wave = Math.sin(wavePhase) * greetingAmount;
    const lift = Math.cos(wavePhase) * greetingAmount;
    const arm = x.createLinearGradient(cx, cy - 12, cx, cy + 12);
    arm.addColorStop(0, '#f7faf7'); arm.addColorStop(0.5, '#e5ebe5'); arm.addColorStop(1, '#aeb8af');
    x.save(); x.fillStyle = arm; x.strokeStyle = '#7e8980'; x.lineWidth = 0.8;
    const arms = [
      [cx - 47, cy + 7 + lift * 2.5, 6.2, 5.2, -0.18 + wave * 0.12],
      [cx + 47, cy - 4 + lift * 4, 6.2, 5.2, 0.18 - wave * 0.72],
    ];
    for (const [armX, armY, radiusX, radiusY, angle] of arms) {
      x.beginPath(); x.ellipse(armX, armY, radiusX, radiusY, angle, 0, Math.PI * 2); x.fill(); x.stroke();
      x.fillStyle = '#ffffff70';
      x.beginPath(); x.ellipse(armX - 1, armY - 1.5, radiusX * 0.42, radiusY * 0.28, angle, 0, Math.PI * 2); x.fill();
      x.fillStyle = arm;
    }
    x.restore();
  }
  const top = cy - h / 2, bottom = cy + h / 2, left = cx - w / 2, right = cx + w / 2;
  const shell = x.createLinearGradient(cx, top, cx, bottom);
  const shellColors = graphics.getShellGradientColors(pose.emotion);
  shell.addColorStop(0, shellColors[0]);
  shell.addColorStop(0.16, shellColors[1]);
  shell.addColorStop(0.55, shellColors[2]);
  shell.addColorStop(1, shellColors[3]);
  x.fillStyle = shell;
  x.shadowColor = '#00000055'; x.shadowBlur = 11; x.shadowOffsetY = 5;
  x.beginPath(); x.roundRect(left, top, w, h, shellRadius); x.fill();
  x.shadowColor = 'transparent'; x.shadowBlur = 0; x.shadowOffsetY = 0;
  graphics.drawOutfit(cx, cy, w, h, appearance.outfit);
  graphics.drawHair(cx, top, appearance.hair);
  if (appearance.accessory !== 'none' && appearance.accessory !== 'headphones') graphics.drawAccessory(cx, cy, top, w, appearance.accessory);
  x.save();
  x.beginPath(); x.roundRect(left, top, w, h, shellRadius); x.clip();
  const highlight = x.createRadialGradient(cx - w * 0.28, top + h * 0.18, 1, cx - w * 0.28, top + h * 0.18, w * 0.72);
  highlight.addColorStop(0, '#ffffffa8'); highlight.addColorStop(0.42, '#ffffff38'); highlight.addColorStop(1, '#ffffff00');
  x.globalAlpha = graphics.getBaseHighlightAlpha(); x.fillStyle = highlight; x.fillRect(left, top, w, h);
  const sideShade = x.createLinearGradient(left, cy, right, cy);
  sideShade.addColorStop(0, '#ffffff00'); sideShade.addColorStop(0.72, '#61686108'); sideShade.addColorStop(1, '#343a3540');
  x.fillStyle = sideShade; x.fillRect(left, top, w, h);
  x.restore();
  x.shadowColor = 'transparent'; x.shadowBlur = 0; x.shadowOffsetY = 0;
  x.strokeStyle = graphics.getShellOutlineColor(pose.emotion); x.lineWidth = 1; x.globalAlpha = 0.5;
  x.beginPath(); x.roundRect(left, top, w, h, shellRadius); x.stroke();
  x.globalAlpha = 1;
  x.strokeStyle = '#ffffffa0'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(left + shellRadius, top + 1); x.quadraticCurveTo(cx, top - 0.5, right - shellRadius, top + 1); x.stroke();
  graphics.drawHeadsetCups(cx, cy, w, Math.max(musicStyle === 'calm' ? musicMotion : 0, appearance.accessory === 'headphones' ? 1 : 0));
  const love = Math.max(pose.emotion.love, affection ? 0.75 : 0);
  if (love > 0.03) {
    for (const s of [-1, 1]) {
      const drift = Math.sin(t * 1.4 + (s > 0 ? 1.5 : 0)) * 3;
      graphics.drawHeart(cx + s * 22, cy - 27 + drift, 4.5 + love * 1.5, love * 0.7);
    }
  }
  const eyeOpen = pose.eyeOpen * (1 - blinkPulse);
  const closed = eyeOpen < 0.12;
  const idleEyeBob = Math.sin(bobPhase) * 0.8;
  const musicEyeBob = musicBeat * (musicStyle === 'heavy' ? 2.8 : 1.5) * motionScale;
  const eyeBob = idleEyeBob * (1 - musicMotion) + musicEyeBob * musicMotion;
  for (const s of [-1, 1]) {
    const confusionGlance = Math.sin(t * 1.8) * 0.32 * pose.emotion.confused;
    const ex = cx + s * 14 + (pose.eyeLookX + confusionGlance) * 3.5;
    const ey = cy - 3 + dropAmount * 5 + eyeBob + pose.eyeLookY * 3.5;
    const eyeWidth = (4.2 + hoverAmount * 0.3) * pose.eyeScale;
    const eyeHeight = (7.2 + hoverAmount * 0.3) * pose.eyeScale * eyeOpen;
    x.fillStyle = '#111312'; x.strokeStyle = '#111312'; x.lineWidth = 2; x.lineCap = 'round';
    if (closed) {
      x.beginPath();
      if (pose.emotion.happy > 0.4) x.arc(ex, ey + 2, 5 * pose.eyeScale, Math.PI, Math.PI * 2);
      else { x.moveTo(ex - 4, ey); x.lineTo(ex + 4, ey); }
      x.stroke();
    } else {
      x.beginPath(); x.ellipse(ex, ey, eyeWidth, eyeHeight, 0, 0, 7); x.fill();
      x.fillStyle = '#ffffffb0'; x.beginPath(); x.arc(ex - 1.1, ey - 2.5, 1.15, 0, Math.PI * 2); x.fill();
    }
  }
  graphics.drawOutfitFace(cx, cy, w, h, appearance.outfit);
  const angry = pose.emotion.angry;
  const confused = pose.emotion.confused;
  const sad = pose.emotion.sad;
  const joy = Math.max(pose.emotion.joy, pose.emotion.happy * 0.72);
  const excited = pose.emotion.excited;
  if (angry > 0.04) {
    x.save(); x.globalAlpha = angry; x.strokeStyle = '#641010'; x.lineWidth = 3.2; x.lineCap = 'round';
    x.beginPath(); x.moveTo(cx - 19, cy - 15); x.lineTo(cx - 8, cy - 10); x.stroke();
    x.beginPath(); x.moveTo(cx + 8, cy - 10); x.lineTo(cx + 19, cy - 15); x.stroke();
    x.restore();
  }
  if (confused > 0.04) {
    const bob = Math.sin(t * 3) * 2;
    x.save(); x.globalAlpha = confused; x.fillStyle = '#e7d7a5'; x.font = 'bold 13px sans-serif'; x.textAlign = 'center';
    x.fillText('?', cx + 25, cy - 25 + bob); x.restore();
  }
  if (sad > 0.04) {
    x.save(); x.globalAlpha = sad * (0.65 + Math.sin(t * 1.2) * 0.15); x.fillStyle = '#8cc9e8';
    x.beginPath(); x.ellipse(cx + 14, cy + 7 + Math.sin(t * 0.8) * 1.5, 2, 3, -0.25, 0, Math.PI * 2); x.fill(); x.restore();
  }
  if (joy > 0.04 || excited > 0.04) {
    const sparkle = Math.max(joy, excited);
    graphics.drawSpark(cx - 25, cy - 25 + Math.sin(t * 3) * 2, 3 + sparkle * 2, sparkle * (0.65 + Math.sin(t * 4) * 0.25), t * 0.3);
    if (excited > 0.04) graphics.drawSpark(cx + 25, cy + 16 + Math.sin(t * 4) * 2, 3 + excited * 2, excited * 0.8, -t * 0.25);
  }
  x.restore();
  requestDraw();
}

function requestDraw() {
  if (document.visibilityState === 'hidden' || animationFramePending) return;
  animationFramePending = true;
  requestAnimationFrame(draw);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    entranceAmount = 0;
    greetingAmount = 1;
    requestDraw();
  }
});
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
requestDraw();
