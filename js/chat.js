var Chat = (function() {
  'use strict';

  var GEMINI_MODEL = 'gemini-2.5-flash';
  var GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
  var SILICONFLOW_URL = 'https://api.siliconflow.cn/v1/chat/completions';

  var CHAT_STORAGE = 'plants_chat_messages';
  var CHAT_DISPLAY = 'plants_chat_display'; // 显示用消息（纯文本）
  var CHAT_PLANTS = 'plants_chat_plant_ids';
  var MAX_MESSAGES = 12; // 超过此数自动精简，减少长上下文等待
  var MAX_INLINE_PHOTOS = 1; // 仅传 1 张图，降低上传体积
  var MIN_REQUEST_GAP_MS = 1000; // 客户端节流，减少 429
  var MAX_RETRY = 2; // 避免手机端长时间等待重试
  var MAX_CONTEXT_RECORDS = 2; // 每次注入最多 2 条本地知识
  var MAX_CONTEXT_CHARS = 700; // 本地知识注入上限，避免请求过大

  var messages = []; // Gemini contents 格式
  var displayMessages = []; // 纯文本显示记录 [{role, text}]
  var systemPrompt = '';
  var currentRecordId = null;
  var isStreaming = false;
  var abortController = null;
  var chatPlantIds = []; // 本轮对话涉及的植物 ID
  var lastRequestAt = 0;

  function getProvider() {
    return localStorage.getItem('plants_ai_provider') || 'gemini';
  }

  function getModel() {
    if (getProvider() === 'siliconflow') {
      return localStorage.getItem('plants_siliconflow_model') || 'Qwen/Qwen3-VL-8B-Instruct';
    }
    return localStorage.getItem('plants_gemini_model') || GEMINI_MODEL;
  }

  function getKey() {
    if (getProvider() === 'siliconflow') {
      return localStorage.getItem('plants_siliconflow_key') || '';
    }
    return localStorage.getItem('plants_gemini_key') || '';
  }

  function hasKey() { return !!getKey(); }

  function getProviderLabel() {
    return getProvider() === 'siliconflow' ? 'SiliconFlow' : 'Gemini';
  }

  function wait(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }

  function isRetryableStatus(status) {
    return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
  }

  function getRetryDelayMs(attempt, retryAfterHeader) {
    var fromHeader = Number(retryAfterHeader);
    if (!isNaN(fromHeader) && fromHeader > 0) return Math.ceil(fromHeader * 1000);
    var base = Math.min(1000 * Math.pow(2, attempt), 8000);
    return base + Math.floor(Math.random() * 500);
  }

  function requestWithRetry(url, body, signal, onRetry, extraHeaders) {
    var attempt = 0;

    function run() {
      var now = Date.now();
      var gap = now - lastRequestAt;
      var delay = gap < MIN_REQUEST_GAP_MS ? (MIN_REQUEST_GAP_MS - gap) : 0;

      return wait(delay).then(function() {
        if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
        lastRequestAt = Date.now();
        return fetch(url, {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {}),
          body: JSON.stringify(body),
          signal: signal
        });
      }).then(function(response) {
        if (isRetryableStatus(response.status) && attempt < MAX_RETRY) {
          attempt++;
          var retryMs = getRetryDelayMs(attempt, response.headers.get('retry-after'));
          if (onRetry) onRetry({ attempt: attempt, max: MAX_RETRY, delayMs: retryMs, status: response.status });
          return wait(retryMs).then(run);
        }
        return response;
      }).catch(function(err) {
        if (err.name === 'AbortError') throw err;
        if (attempt < MAX_RETRY) {
          attempt++;
          var retryMs = getRetryDelayMs(attempt, null);
          if (onRetry) onRetry({ attempt: attempt, max: MAX_RETRY, delayMs: retryMs, status: 0 });
          return wait(retryMs).then(run);
        }
        throw err;
      });
    }

    return run();
  }

  function getProviderHeaders() {
    if (getProvider() === 'siliconflow') {
      return { Authorization: 'Bearer ' + getKey() };
    }
    return {};
  }

  function extractResponseText(data) {
    try {
      if (data && data.choices && data.choices[0] && data.choices[0].message) {
        return data.choices[0].message.content || '';
      }
      if (data && data.candidates && data.candidates[0] &&
          data.candidates[0].content && data.candidates[0].content.parts) {
        var parts = data.candidates[0].content.parts;
        var out = '';
        for (var i = 0; i < parts.length; i++) {
          if (parts[i].text) out += parts[i].text;
        }
        return out;
      }
    } catch (e) {}
    return '';
  }

  function getTextParts(msg) {
    if (!msg || !msg.parts) return '';
    return msg.parts
      .filter(function(p) { return p && typeof p.text === 'string'; })
      .map(function(p) { return p.text; })
      .join('\n');
  }

  function normalizeText(text) {
    return (text || '')
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, ' ')
      .trim();
  }

  function extractKeywords(text) {
    var normalized = normalizeText(text);
    if (!normalized) return [];
    var parts = normalized.split(/\s+/).filter(function(t) { return t.length >= 2; });
    var uniq = {};
    parts.forEach(function(p) { uniq[p] = true; });
    return Object.keys(uniq).slice(0, 16);
  }

  function recordText(record) {
    return normalizeText([
      record.name,
      record.title,
      record.family,
      record.genus,
      record.features,
      record.content,
      record.notes,
      record.observation,
      record.relatedObjects,
      record.location,
      record.obsNote,
      (record.tags || []).join(' ')
    ].filter(Boolean).join(' '));
  }

  function countSharedTags(a, b) {
    var aTags = (a && a.tags) || [];
    var bTags = (b && b.tags) || [];
    if (!aTags.length || !bTags.length) return 0;
    var map = {};
    aTags.forEach(function(t) { map[t] = true; });
    var count = 0;
    bTags.forEach(function(t) { if (map[t]) count++; });
    return count;
  }

  function scoreRecord(record, currentRecord, keywords) {
    var score = 0;
    var hay = recordText(record);

    if (currentRecord && record.id === currentRecord.id) score += 100;
    if (currentRecord && record.type !== 'pending' && record.status !== 'pending') {
      if (currentRecord.family && record.family && currentRecord.family === record.family) score += 15;
      if (currentRecord.genus && record.genus && currentRecord.genus === record.genus) score += 18;
      if (countSharedTags(currentRecord, record) > 0) score += countSharedTags(currentRecord, record) * 6;
      if ((record.links || []).indexOf(currentRecord.id) !== -1) score += 10;
      if ((currentRecord.links || []).indexOf(record.id) !== -1) score += 10;
      if (record.linkedPlantIds && record.linkedPlantIds.indexOf(currentRecord.id) !== -1) score += 14;
    }

    keywords.forEach(function(k) {
      if (hay.indexOf(k) !== -1) score += 2;
    });

    if (record.updatedAt) {
      var days = Math.floor((Date.now() - new Date(record.updatedAt).getTime()) / (24 * 60 * 60 * 1000));
      if (!isNaN(days) && days <= 30) score += 3;
      if (!isNaN(days) && days <= 7) score += 2;
    }

    return score;
  }

  function summarizeRecord(record, currentRecord) {
    var title = record.name || record.title || '未命名记录';
    var pieces = [];
    if (record.type) pieces.push('类型:' + record.type);
    if (record.family) pieces.push('科:' + record.family);
    if (record.genus) pieces.push('属:' + record.genus);
    if (record.features) pieces.push('特征:' + record.features);
    if (record.content) pieces.push('内容:' + String(record.content).slice(0, 80));
    if (record.notes) pieces.push('笔记:' + String(record.notes).slice(0, 80));
    if (record.obsNote) pieces.push('观察:' + String(record.obsNote).slice(0, 60));
    if (record.tags && record.tags.length) pieces.push('标签:' + record.tags.slice(0, 4).join('/'));

    var relation = '';
    if (currentRecord) {
      if (record.id === currentRecord.id) relation = '（当前记录）';
      else if (record.family && currentRecord.family && record.family === currentRecord.family) relation = '（同科）';
      else if (record.genus && currentRecord.genus && record.genus === currentRecord.genus) relation = '（同属）';
      else if (record.linkedPlantIds && record.linkedPlantIds.indexOf(currentRecord.id) !== -1) relation = '（关联笔记）';
    }
    return title + relation + '｜' + pieces.join('；');
  }

  function buildKnowledgeContext(msgs) {
    if (!Storage || !Storage.getCompleted) return '';
    var all = Storage.getCompleted().filter(function(r) { return r && r.status !== 'pending'; });
    if (all.length === 0) return '';

    var currentRecord = currentRecordId ? Storage.getById(currentRecordId) : null;
    var latestUserText = '';
    for (var i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        latestUserText = getTextParts(msgs[i]);
        if (latestUserText) break;
      }
    }
    var queryText = latestUserText + '\n' + (currentRecord ? getTextParts({ parts: [{ text: formatObservation(currentRecord) }] }) : '');
    var keywords = extractKeywords(queryText);

    var ranked = all.map(function(r) {
      return { record: r, score: scoreRecord(r, currentRecord, keywords) };
    }).filter(function(x) {
      return x.score > 0;
    }).sort(function(a, b) {
      return b.score - a.score;
    }).slice(0, MAX_CONTEXT_RECORDS);

    if (ranked.length === 0 && currentRecord) {
      ranked = [{ record: currentRecord, score: 100 }];
    }
    if (ranked.length === 0) return '';

    var lines = [];
    lines.push('【本地知识库参考（来自用户历史记录）】');
    lines.push('仅把以下内容当作参考证据；若与当前观察冲突，以当前观察为准并明确说明冲突。');
    for (var j = 0; j < ranked.length; j++) {
      lines.push((j + 1) + '. ' + summarizeRecord(ranked[j].record, currentRecord));
    }
    lines.push('回答时优先引用以上记录中的一致证据，并区分“已知事实”与“推测”。');

    var context = lines.join('\n');
    if (context.length > MAX_CONTEXT_CHARS) {
      context = context.slice(0, MAX_CONTEXT_CHARS) + '\n（本地参考已截断）';
    }
    return context;
  }

  // 持久化对话
  function saveChat() {
    try {
      localStorage.setItem(CHAT_STORAGE, JSON.stringify(messages));
      localStorage.setItem(CHAT_DISPLAY, JSON.stringify(displayMessages));
      localStorage.setItem(CHAT_PLANTS, JSON.stringify(chatPlantIds));
    } catch (e) { /* localStorage 满了就放弃持久化 */ }
  }

  function loadChat() {
    try {
      var m = localStorage.getItem(CHAT_STORAGE);
      var d = localStorage.getItem(CHAT_DISPLAY);
      var p = localStorage.getItem(CHAT_PLANTS);
      messages = m ? JSON.parse(m) : [];
      displayMessages = d ? JSON.parse(d) : [];
      chatPlantIds = p ? JSON.parse(p) : [];
    } catch (e) {
      messages = [];
      displayMessages = [];
      chatPlantIds = [];
    }
  }

  function clearChat() {
    messages = [];
    displayMessages = [];
    chatPlantIds = [];
    localStorage.removeItem(CHAT_STORAGE);
    localStorage.removeItem(CHAT_DISPLAY);
    localStorage.removeItem(CHAT_PLANTS);
  }

  // 格式化观察数据为文本
  function formatObservation(record) {
    var lines = [];
    if (record.growthForm) lines.push('生长形态：' + record.growthForm);
    if (record.leafArrangement) lines.push('叶子排列：' + record.leafArrangement);
    if (record.leafType) lines.push('叶子结构：' + record.leafType);
    if (record.leafEdge) lines.push('叶子边缘：' + record.leafEdge);
    if (record.leafVein) lines.push('叶脉走向：' + record.leafVein);
    if (record.leafTexture) lines.push('叶子手感：' + record.leafTexture);
    if (record.petalCount) lines.push('花瓣数量：' + record.petalCount);
    if (record.flowerSymmetry) lines.push('花的形状：' + record.flowerSymmetry);
    if (record.petalConnection) lines.push('花瓣连接：' + record.petalConnection);
    if (record.flowerCluster) lines.push('花序类型：' + record.flowerCluster);
    if (record.fruitTexture) lines.push('果实质感：' + record.fruitTexture);
    if (record.fruitDetail) lines.push('果实外观：' + record.fruitDetail);
    if (record.location) lines.push('发现地点：' + record.location);
    if (record.date) lines.push('观察日期：' + record.date);
    if (record.attraction) lines.push('吸引我的：' + record.attraction);
    if (record.obsNote) lines.push('其他补充：' + record.obsNote);
    return lines.join('\n');
  }

  // 构建系统提示词（保留科普深度，同时更有结构）
  function buildSystemPrompt() {
    return '你是一位专业、克制、可靠的植物学导师。默认使用简体中文，避免幼稚化表达、口号化修辞和过度煽情。\n\n' +
      '开场要求：\n' +
      '每次回复第一句都先用“探险者/探险旅程”语气打招呼并引导进入观察，但要自然简短，不浮夸。\n\n' +
      '输出格式（严格固定为以下三个小标题，顺序不可变）：\n' +
      '🍃现有观察\n' +
      '👀下一步观察\n' +
      '✨探索边界\n\n' +
      '观察数据解释规则（必须遵守）：\n' +
      '- 用户记录可能来自不同部位（叶、花、果、茎）与不同时间阶段（花期前后），可并存。\n' +
      '- 除非同一观察维度出现直接对立（例如同一枝条同时“对生”且“互生”），否则不要判定“观察矛盾”。\n' +
      '- 发现潜在冲突时，先给“可能原因”（拍摄角度、样本不是同一株、时期差异），再给验证步骤。\n\n' +
      '格式禁令（必须遵守）：\n' +
      '- 禁止使用 Markdown 强调：*, **, #。\n' +
      '- 全文使用纯文本，不要加粗。\n\n' +
      '各部分要求：\n' +
      '【🍃现有观察】\n' +
      '- 合并“观察确认+判断思路”，但要有层次：先列关键观察，再给分类方向与理由。\n' +
      '- 允许信息充足时展开到 5-9 个短段，像“逐步复核证据”而不是一句话结论。\n' +
      '- 重点写清：哪些证据支持判断、哪些证据排除其他方向、哪些地方仍不确定。\n' +
      '- 可以加入“之前误判的可能原因”与“本轮修正点”，帮助用户建立稳定识别框架。\n' +
      '- 本节结尾必须单独给出一行：当前最可能名称：中文名（拉丁名）｜置信度：XX%。\n' +
      '- 严格去重：不要机械复述用户原句，不要同一特征来回重复。\n\n' +
      '【👀下一步观察】\n' +
      '- 给 3-6 条可立即执行的观察建议，优先能最快缩小鉴定范围的项目。\n' +
      '- 建议必须具体到“看哪里、怎么看、看到了代表什么”。\n' +
      '- 必须使用阿拉伯数字编号格式：1. 2. 3. ...（每条单独一行）。\n' +
      '- 当把握度较高时，最后加 1 个“确认问题”，用于快速坐实或推翻当前判断。\n\n' +
      '【✨探索边界】\n' +
      '- 放在最后，补充与当前判断直接相关的知识点（形态学、分类学、生态位或野外经验）。\n' +
      '- 给用户“可迁移的识别规则”，例如简化口诀、对照要点、常见混淆项。\n' +
      '- 只写新增信息，不重复前文事实描述。\n' +
      '- 若信息不足，明确不确定性和缺失证据。\n\n' +
      '长对话规则：\n' +
      '- 必须回看前文，主动指出与过往记录的“相似点/不同点”。\n' +
      '- 若涉及多株植物，做简明对比，只保留高鉴别价值差异。\n\n' +
      '排版规则（面向手机阅读）：\n' +
      '- 段落要短，每段尽量 1-3 句。\n' +
      '- 信息要足，但避免单段过长；需要长解释时拆成多个短段。\n\n' +
      '内容边界：\n' +
      '- 除非用户明确要求直接鉴定，否则先给分类方向与补充观察路径。\n' +
      '- 用户明确要求“直接告诉我”时，可给候选物种，并标注依据与不确定点。\n' +
      '- 即便不完全确定，也必须给出“当前最佳候选名称”，不能只停留在科/属层级。';
  }

  // (buildInitialParts 已合并到 addPlantToChat)

  // 渲染聊天界面
  function renderChatUI() {
    var html = '<div class="chat-container">';
    html += '<div class="chat-provider-status">当前 AI：' + getProviderLabel() + ' · ' + getModel() + '</div>';
    html += '<div class="chat-messages" id="chat-messages"></div>';
    html += '<div class="chat-bottom-bar">';
    html += '<button class="chat-extract-btn" id="chat-extract-btn" onclick="Chat.extractAndApply()">✨ 确认整理</button>';
    html += '<button class="chat-new-btn" onclick="Chat.newJourney()">🌱 新旅程</button>';
    html += '</div>';
    html += '<div class="chat-input-bar">';
    html += '<button class="chat-image-btn" onclick="Chat.pickImage()" title="发送图片">🖼️</button>';
    html += '<input type="file" id="chat-image-input" accept="image/*" style="display:none" onchange="Chat.sendImage(this.files); this.value=\'\';">';
    html += '<input class="chat-input" id="chat-input" placeholder="继续聊聊..." onkeydown="if(event.key===\'Enter\')Chat.send()">';
    html += '<button class="chat-send-btn" id="chat-send-btn" onclick="Chat.send()">发送</button>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  // 渲染单条消息
  function appendMessage(role, text) {
    var container = document.getElementById('chat-messages');
    if (!container) return null;
    var bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + (role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai');
    bubble.textContent = text;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
    return bubble;
  }

  // 打开聊天
  function openChat(recordId) {
    if (!hasKey()) {
      App.openSyncModal ? App.openSyncModal() : alert('请先在设置中填写 Gemini API Key');
      setTimeout(function() {
        var keyInput = document.getElementById('gemini-key-input');
        if (keyInput) { keyInput.focus(); keyInput.scrollIntoView({ behavior: 'smooth' }); }
      }, 300);
      return;
    }

    currentRecordId = recordId;
    var record = Storage.getById(recordId);
    if (!record) { alert('找不到记录'); return; }

    isStreaming = false;
    systemPrompt = buildSystemPrompt();

    // 加载持久化对话
    loadChat();

    // 渲染 UI
    document.getElementById('modal-body').innerHTML = renderChatUI();
    document.getElementById('modal-title').textContent = '📋 植物观察之旅';

    var overlay = document.getElementById('modal-overlay');
    if (!overlay.classList.contains('show')) {
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    }

    // 如果已有对话历史，先恢复显示
    if (displayMessages.length > 0) {
      displayMessages.forEach(function(dm) {
        appendMessage(dm.role, dm.text);
      });
    }

    // 同一株植物再次进入时仅续聊，不重复投喂观察与图片
    var alreadySeeded = chatPlantIds.indexOf(record.id) !== -1;
    if (alreadySeeded && messages.length > 0) {
      return;
    }

    // 首次进入该植物，加载照片并投喂
    var photoIds = record.photoIds || [];
    if (photoIds.length > 0) {
      PhotoDB.getMultiple(photoIds).then(function(results) {
        var photos = results.map(function(r) { return r && r.data; }).filter(Boolean);
        addPlantToChat(record, photos);
      });
    } else {
      addPlantToChat(record, []);
    }
  }

  // 追加一株新植物到对话（而非重置）
  function addPlantToChat(record, photos) {
    var name = record.name || '这株植物';
    var obs = formatObservation(record);
    var plantNum = chatPlantIds.length + 1;

    // 记录植物 ID（避免重复计数）
    if (chatPlantIds.indexOf(record.id) === -1) {
      chatPlantIds.push(record.id);
      plantNum = chatPlantIds.length;
    } else {
      // 已在对话中讨论过的植物，补充说明
      plantNum = chatPlantIds.indexOf(record.id) + 1;
    }

    // 构建用户消息
    var text = messages.length === 0
      ? '我刚观察了' + name + '，请看看我的观察记录。\n\n' + obs
      : '现在来看第 ' + plantNum + ' 株植物：' + name + '\n\n' + obs;

    var parts = [{ text: text }];

    // 添加照片
    if (photos && photos.length > 0) {
      var maxPhotos = Math.min(photos.length, MAX_INLINE_PHOTOS);
      for (var i = 0; i < maxPhotos; i++) {
        if (photos[i]) {
          var match = photos[i].match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
          }
        }
      }
    }

    messages.push({ role: 'user', parts: parts });

    var displayText = messages.length <= 1
      ? '我刚观察了' + name + '，请看看我的观察记录。' + (photos.length > 0 ? ' [附 ' + photos.length + ' 张照片]' : '')
      : '🌿 第 ' + plantNum + ' 株：' + name + (photos.length > 0 ? ' [附 ' + photos.length + ' 张照片]' : '');

    displayMessages.push({ role: 'user', text: displayText });
    appendMessage('user', displayText);
    saveChat();

    // 如果对话太长，先精简再请求
    if (messages.length > MAX_MESSAGES) {
      autoSummarize(function() { streamResponse(); });
    } else {
      streamResponse();
    }
  }

  // 新旅程（手动重置）
  function newJourney() {
    if (isStreaming) return;
    clearChat();
    var container = document.getElementById('chat-messages');
    if (container) container.innerHTML = '<div style="text-align:center; color:var(--gray-400); padding:20px; font-size:13px;">🌱 新旅程开始！去拍一株植物吧</div>';
  }

  // 自动精简对话
  function autoSummarize(callback) {
    var summarizePrompt = '请将以上所有植物的观察和讨论，精简为一段总结（200字以内）。\n' +
      '保留每株植物的：关键观察特征、初步分类方向、待观察要点。\n' +
      '严格只输出总结文本，不要输出其他内容。';

    var isSF = getProvider() === 'siliconflow';
    var url = isSF ? SILICONFLOW_URL : (GEMINI_BASE_URL + getModel() + ':generateContent?key=' + getKey());
    var requestMessages = messages.concat([{ role: 'user', parts: [{ text: summarizePrompt }] }]);
    var body = buildRequestBody(requestMessages, false);

    requestWithRetry(url, body, null, null, getProviderHeaders()).then(function(res) {
      return res.json();
    }).then(function(data) {
      var summary = extractResponseText(data);
      if (summary) {
        // 用精简后的内容替换旧消息
        messages = [
          { role: 'user', parts: [{ text: '以下是之前观察的总结：\n\n' + summary }] },
          { role: 'model', parts: [{ text: '好的，我已了解之前的观察记录。请继续！' }] }
        ];
        displayMessages.push({ role: 'model', text: '📝 [对话已自动精简，保留了关键信息]' });
        appendMessage('model', '📝 [对话已自动精简，保留了关键信息]');
        saveChat();
      }
      callback();
    }).catch(function() {
      // 精简失败就直接继续
      callback();
    });
  }

  // 构建 Gemini 请求体
  function buildRequestBody(msgs, includePhotos) {
    var recentMsgs = msgs.length > 10 ? msgs.slice(msgs.length - 10) : msgs;
    var latestPhotoMsgIndex = -1;
    if (includePhotos) {
      for (var i = recentMsgs.length - 1; i >= 0; i--) {
        var m = recentMsgs[i];
        if (m.role === 'user' && m.parts && m.parts.some(function(p) { return !!p.inline_data; })) {
          latestPhotoMsgIndex = i;
          break;
        }
      }
    }

    var contents = recentMsgs.map(function(msg, idx) {
      var parts = msg.parts || [];
      if (!includePhotos || idx !== latestPhotoMsgIndex) {
        parts = parts.filter(function(p) { return p.text !== undefined; });
      }
      return { role: msg.role, parts: parts };
    }).filter(function(msg) {
      return msg.parts && msg.parts.length > 0;
    });

    var knowledgeContext = buildKnowledgeContext(recentMsgs);
    if (getProvider() === 'siliconflow') {
      var sysText = systemPrompt + (knowledgeContext ? '\n\n' + knowledgeContext : '');
      var sfMessages = [{ role: 'system', content: sysText }];
      contents.forEach(function(msg, idx) {
        var role = msg.role === 'model' ? 'assistant' : msg.role;
        var openaiContent = [];
        (msg.parts || []).forEach(function(p) {
          if (p.text !== undefined) {
            openaiContent.push({ type: 'text', text: p.text });
          } else if (includePhotos && idx === latestPhotoMsgIndex && p.inline_data && p.inline_data.data) {
            openaiContent.push({
              type: 'image_url',
              image_url: { url: 'data:' + p.inline_data.mime_type + ';base64,' + p.inline_data.data }
            });
          }
        });
        if (openaiContent.length > 0) sfMessages.push({ role: role, content: openaiContent });
      });
      return {
        model: getModel(),
        temperature: 0.2,
        max_tokens: 900,
        messages: sfMessages
      };
    }

    var systemParts = [{ text: systemPrompt }];
    if (knowledgeContext) systemParts.push({ text: knowledgeContext });
    return {
      systemInstruction: { parts: systemParts },
      contents: contents
    };
  }

  // 流式请求 AI 响应
  function streamResponse() {
    if (isStreaming) return;
    isStreaming = true;

    var sendBtn = document.getElementById('chat-send-btn');
    if (sendBtn) sendBtn.disabled = true;

    // 创建 AI 气泡
    var bubble = appendMessage('model', '');
    if (bubble) {
      var cursor = document.createElement('span');
      cursor.className = 'chat-typing-cursor';
      bubble.appendChild(cursor);
    }

    abortController = new AbortController();
    var fullText = '';

    var usingSF = getProvider() === 'siliconflow';
    var url = usingSF
      ? SILICONFLOW_URL
      : (GEMINI_BASE_URL + getModel() + ':streamGenerateContent?alt=sse&key=' + getKey());

    requestWithRetry(
      url,
      buildRequestBody(messages, true),
      abortController.signal,
      function(info) {
        if (bubble) {
          bubble.textContent = '请求较多，' + Math.ceil(info.delayMs / 1000) + ' 秒后重试（' + info.attempt + '/' + info.max + '）...';
        }
      },
      getProviderHeaders()
    ).then(function(response) {
      if (!response.ok) {
        return response.json().then(function(err) {
          var errMsg = (err.error && err.error.message) || err.message || 'API 请求失败 (' + response.status + ')';
          throw new Error(errMsg);
        });
      }

      if (usingSF) {
        return response.json().then(function(data) {
          var text = extractResponseText(data);
          if (!text) throw new Error('AI 返回为空');
          if (bubble) bubble.textContent = text;
          finishStream(text, bubble);
        });
      }

      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';

      function readChunk() {
        reader.read().then(function(result) {
          if (result.done) {
            finishStream(fullText, bubble);
            return;
          }

          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line.startsWith('data: ')) continue;
            var data = line.slice(6);
            if (data === '[DONE]') {
              finishStream(fullText, bubble);
              return;
            }
            try {
              var parsed = JSON.parse(data);
              // Gemini SSE 格式: candidates[0].content.parts[0].text
              var parts = parsed.candidates && parsed.candidates[0] &&
                parsed.candidates[0].content && parsed.candidates[0].content.parts;
              if (parts) {
                for (var j = 0; j < parts.length; j++) {
                  if (parts[j].text) {
                    fullText += parts[j].text;
                  }
                }
              }
              if (bubble) {
                var cursorEl = bubble.querySelector('.chat-typing-cursor');
                bubble.textContent = fullText;
                if (cursorEl) bubble.appendChild(cursorEl);
              }
              // 保持当前位置，避免长回复时自动跳到末尾，便于从顶部阅读
            } catch (e) { /* skip parse errors */ }
          }

          readChunk();
        }).catch(function(err) {
          if (err.name !== 'AbortError') {
            finishStream(fullText, bubble);
          }
        });
      }

      readChunk();
    }).catch(function(err) {
      isStreaming = false;
      var sendBtn2 = document.getElementById('chat-send-btn');
      if (sendBtn2) sendBtn2.disabled = false;

      if (err.name === 'AbortError') return;

      // 显示错误
      if (bubble) bubble.textContent = '';
      var container = document.getElementById('chat-messages');
      if (container) {
        var errDiv = document.createElement('div');
        errDiv.className = 'chat-error';
        errDiv.textContent = err.message || '请求失败，请检查网络和 API Key';
        container.appendChild(errDiv);
        container.scrollTop = container.scrollHeight;
      }
    });
  }

  function finishStream(text, bubble) {
    isStreaming = false;
    var sendBtn = document.getElementById('chat-send-btn');
    if (sendBtn) sendBtn.disabled = false;

    // 移除光标
    if (bubble) {
      var cursor = bubble.querySelector('.chat-typing-cursor');
      if (cursor) cursor.remove();
    }

    // 保存 AI 消息（内部统一仍用 "model" 角色）
    if (text) {
      messages.push({ role: 'model', parts: [{ text: text }] });
      displayMessages.push({ role: 'model', text: text });
      saveChat();
    }
  }

  // 用户发送消息
  function send() {
    if (isStreaming) return;
    var input = document.getElementById('chat-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;

    input.value = '';
    messages.push({ role: 'user', parts: [{ text: text }] });
    displayMessages.push({ role: 'user', text: text });
    appendMessage('user', text);
    saveChat();
    streamResponse();
  }

  function pickImage() {
    if (isStreaming) return;
    var input = document.getElementById('chat-image-input');
    if (input) input.click();
  }

  function sendImage(files) {
    if (isStreaming) return;
    if (!files || !files[0]) return;

    var file = files[0];
    var input = document.getElementById('chat-input');
    var caption = (input && input.value || '').trim();
    if (input) input.value = '';

    Storage.compressImage(file, 1280, 0.82).then(function(dataUrl) {
      var match = dataUrl && dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error('图片格式不支持');

      var text = caption || '请识别这张图片中的植物，并结合我们之前的对话继续判断。';
      var parts = [
        { text: text },
        { inline_data: { mime_type: match[1], data: match[2] } }
      ];

      messages.push({ role: 'user', parts: parts });

      var displayText = '🖼️ 已发送图片' + (caption ? '：' + caption : '');
      displayMessages.push({ role: 'user', text: displayText });
      appendMessage('user', displayText);
      saveChat();
      streamResponse();
    }).catch(function(err) {
      var container = document.getElementById('chat-messages');
      if (container) {
        var errDiv = document.createElement('div');
        errDiv.className = 'chat-error';
        errDiv.textContent = err.message || '发送图片失败';
        container.appendChild(errDiv);
      }
    });
  }

  function setExtractBusy(busy) {
    var btn = document.getElementById('chat-extract-btn');
    if (!btn) return;
    btn.disabled = !!busy;
    btn.textContent = busy ? '⏳ 整理中...' : '✨ 确认整理';
  }

  function showExtractLoading(text) {
    var container = document.getElementById('chat-messages');
    if (!container) return;
    var existing = document.getElementById('chat-extract-loading');
    if (existing) {
      existing.textContent = text || '正在整理本轮对话，请稍候...';
      return;
    }
    var div = document.createElement('div');
    div.id = 'chat-extract-loading';
    div.className = 'chat-loading';
    div.textContent = text || '正在整理本轮对话，请稍候...';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function hideExtractLoading() {
    var el = document.getElementById('chat-extract-loading');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // 确认整理 - 提取结构化数据
  function extractAndApply() {
    if (isStreaming) return;
    if (messages.length < 2) {
      alert('请先和 AI 聊几轮再整理');
      return;
    }

    var extractPrompt = '根据我们的对话，整理这株植物的鉴定结果。\n' +
      '严格输出 JSON，不要输出任何其他文字。\n' +
      'name 字段必须填写：即使不完全确定，也填当前最可能候选中文名；并在 notes 里写清不确定性与依据。\n' +
      '不确定的其他字段可留空字符串。\n' +
      '{"name": "中文正式名或当前最可能候选名", "latinName": "完整拉丁学名（未知可空）", "family": "中文科名+拉丁科名（未知可空）", "genus": "中文属名+拉丁属名（未知可空）", "features": "2-3个核心鉴别特征，用植物学术语", "notes": "1-2句相关知识，并说明置信度与不确定点"}';

    isStreaming = true;
    var sendBtn = document.getElementById('chat-send-btn');
    if (sendBtn) sendBtn.disabled = true;
    setExtractBusy(true);
    showExtractLoading('正在整理本轮对话，请稍候...');
    abortController = new AbortController();
    var isSF = getProvider() === 'siliconflow';
    var url = isSF ? SILICONFLOW_URL : (GEMINI_BASE_URL + getModel() + ':generateContent?key=' + getKey());
    var requestMessages = messages.concat([{ role: 'user', parts: [{ text: extractPrompt }] }]);

    requestWithRetry(
      url,
      buildRequestBody(requestMessages, false),
      abortController.signal,
      function(info) {
        showExtractLoading('请求较多，' + Math.ceil(info.delayMs / 1000) + ' 秒后重试（' + info.attempt + '/' + info.max + '）...');
      },
      getProviderHeaders()
    ).then(function(response) {
      if (!response.ok) {
        return response.json().then(function(err) {
          throw new Error((err.error && err.error.message) || 'API 请求失败');
        });
      }
      return response.json();
    }).then(function(data) {
      if (!data) return;
      isStreaming = false;
      if (sendBtn) sendBtn.disabled = false;
      setExtractBusy(false);
      hideExtractLoading();

      var text = extractResponseText(data);
      var extracted = parseExtractedData(text);
      if (!extracted) throw new Error('AI 返回的格式无法解析，请再试一次');
      var normalized = normalizeExtractedData(extracted);
      if (!normalized) throw new Error('AI 返回的结构不正确，请再试一次');
      showExtractConfirmation(normalized);
    }).catch(function(err) {
      isStreaming = false;
      if (sendBtn) sendBtn.disabled = false;
      setExtractBusy(false);
      hideExtractLoading();
      if (err.name === 'AbortError') return;
      var container = document.getElementById('chat-messages');
      if (container) {
        var errDiv = document.createElement('div');
        errDiv.className = 'chat-error';
        errDiv.textContent = err.message || '整理失败';
        container.appendChild(errDiv);
      }
    });
  }

  function parseExtractedData(text) {
    var jsonStr = text;
    var match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1].trim();

    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      var match2 = text.match(/\{[\s\S]*\}/);
      if (match2) {
        try {
          return JSON.parse(match2[0]);
        } catch (e2) {}
      }
      return null;
    }
  }

  function pickField(obj, keys) {
    if (!obj) return '';
    for (var i = 0; i < keys.length; i++) {
      var v = obj[keys[i]];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  }

  function normalizeExtractedData(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      name: pickField(raw, ['name', '名称', '中文名', '植物名']),
      latinName: pickField(raw, ['latinName', '学名', '拉丁名', '拉丁学名']),
      family: pickField(raw, ['family', '科', '科名']),
      genus: pickField(raw, ['genus', '属', '属名']),
      features: pickField(raw, ['features', '特征', '关键特征', '鉴别特征']),
      notes: pickField(raw, ['notes', '知识', '补充', '说明'])
    };
  }

  function showExtractConfirmation(data) {
    var container = document.getElementById('chat-messages');
    if (!container) return;

    var fields = [
      { key: 'name', label: '名称' },
      { key: 'latinName', label: '学名' },
      { key: 'family', label: '科' },
      { key: 'genus', label: '属' },
      { key: 'features', label: '特征' },
      { key: 'notes', label: '知识' }
    ];

    var html = '<div class="chat-extract-preview">';
    html += '<div style="font-weight:600; margin-bottom:8px; font-size:14px;">AI 整理的信息：</div>';
    for (var i = 0; i < fields.length; i++) {
      var val = data[fields[i].key] || '';
      if (val) {
        html += '<div class="chat-extract-field">';
        html += '<span class="chat-extract-label">' + fields[i].label + '</span>';
        html += '<span class="chat-extract-value">' + escapeHtml(val) + '</span>';
        html += '</div>';
      }
    }
    html += '<div style="display:flex; gap:8px; margin-top:12px;">';
    html += '<button class="btn btn-primary btn-block" onclick="Chat.applyExtracted()">确认补全</button>';
    html += '<button class="btn btn-block" onclick="this.parentElement.parentElement.remove()">取消</button>';
    html += '</div>';
    html += '</div>';

    Chat._pendingExtract = data;

    var div = document.createElement('div');
    div.innerHTML = html;
    container.appendChild(div.firstChild);
    container.scrollTop = container.scrollHeight;
  }

  var celebrationTags = []; // 庆祝界面的标签

  function applyExtracted() {
    var data = Chat._pendingExtract;
    if (!data || !currentRecordId) return;
    var current = Storage.getById(currentRecordId);
    if (!current) return;

    var updates = {};
    if (data.name) updates.name = data.name;
    if (data.latinName) updates.latinName = data.latinName;
    if (data.family) updates.family = data.family;
    if (data.genus) updates.genus = data.genus;
    if (data.features) updates.features = data.features;
    if (data.notes) updates.notes = data.notes;

    var hasCoreData = !!(data.name || data.family || data.genus || data.features || data.latinName);
    if (current.type === 'plant' && hasCoreData) {
      updates.status = 'complete';
    }

    if (Object.keys(updates).length === 0) {
      alert('这次整理没有提取到可写入字段，请继续聊几轮再试。');
      return;
    }

    Storage.update(currentRecordId, updates);
    Chat._pendingExtract = null;
    clearChat();

    // 显示庆祝界面
    var record = Storage.getById(currentRecordId);
    celebrationTags = (record.tags || []).slice();
    showChatCelebration(record);
    App.refreshView();
  }

  function showChatCelebration(record) {
    var name = record.name || '未命名';

    // 彩纸
    var confettiHtml = '';
    var colors = ['#7ba862', '#d4a0a0', '#e0b85c', '#8bb4c7', '#d4a373', '#b8d4a0', '#f0c8c8'];
    for (var i = 0; i < 30; i++) {
      var c = colors[i % colors.length];
      confettiHtml += '<div class="confetti-piece" style="left:' + (Math.random() * 100) + '%;animation-delay:' + (Math.random() * 2) + 's;background:' + c + ';width:' + (6 + Math.random() * 8) + 'px;height:' + (6 + Math.random() * 8) + 'px;"></div>';
    }

    var html = '<div class="celebration-wrap">';
    html += '<div class="confetti-container">' + confettiHtml + '</div>';
    html += '<div class="celebration-content" style="padding-top:8px;">';
    html += '<div style="font-size:36px; margin-bottom:4px;">🎉</div>';
    html += '<div class="celebration-title">收录完成！</div>';
    html += '<div class="celebration-subtitle">' + escapeHtml(name) + '</div>';
    html += '</div>';

    // 摘要卡片
    html += '<div class="chat-celebration-summary">';
    if (record.family) html += '<div class="chat-celebration-field"><span style="color:var(--gray-400);min-width:36px;">科</span><span>' + escapeHtml(record.family) + '</span></div>';
    if (record.genus) html += '<div class="chat-celebration-field"><span style="color:var(--gray-400);min-width:36px;">属</span><span>' + escapeHtml(record.genus) + '</span></div>';
    if (record.features) html += '<div class="chat-celebration-field"><span style="color:var(--gray-400);min-width:36px;">特征</span><span>' + escapeHtml(record.features) + '</span></div>';
    html += '</div>';

    // 标签输入区
    html += '<div class="chat-celebration-tags">';
    html += '<div style="font-size:14px; font-weight:600; margin-bottom:8px;">给它贴个标签</div>';
    html += '<div class="tags-container" id="celebration-tags-container">';
    html += buildCelebrationTagsContent();
    html += '</div>';
    var allTags = Storage.getAllTags();
    var tagNames = Object.keys(allTags);
    if (tagNames.length > 0) {
      html += '<div class="batch-tag-suggestions" style="margin-top:8px;">';
      tagNames.forEach(function(t) {
        if (celebrationTags.indexOf(t) === -1) {
          html += '<button class="filter-chip" onclick="Chat.addCelebrationTag(\'' + t.replace(/'/g, "\\'") + '\')">' + escapeHtml(t) + '</button>';
        }
      });
      html += '</div>';
    }
    html += '</div>';

    // 分享卡片
    html += '<canvas id="share-card-canvas" width="540" height="720" style="display:none;"></canvas>';
    html += '<div class="share-card-preview" id="share-card-preview" style="margin-top:12px;"></div>';

    // 按钮
    html += '<div style="display:flex; gap:10px; margin-top:14px;">';
    html += '<button class="btn btn-primary btn-block" onclick="Chat.finishCelebration()">完成</button>';
    html += '<button class="btn btn-block" onclick="Form.downloadCard()">📷 保存卡片</button>';
    html += '</div>';
    html += '</div>';

    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-title').textContent = '';
    setTimeout(function() { if (Form.drawShareCard) Form.drawShareCard(record); }, 100);
  }

  function buildCelebrationTagsContent() {
    var html = '';
    celebrationTags.forEach(function(tag, i) {
      html += '<span class="tag">' + escapeHtml(tag) + '<button class="tag-remove" onclick="Chat.removeCelebrationTag(' + i + ')">×</button></span>';
    });
    html += '<input type="text" class="tag-input" id="celebration-tag-input" placeholder="输入标签后按回车" onkeydown="Chat.handleCelebrationTagKey(event)">';
    return html;
  }

  function updateCelebrationTags() {
    var container = document.getElementById('celebration-tags-container');
    if (container) {
      container.innerHTML = buildCelebrationTagsContent();
      var input = document.getElementById('celebration-tag-input');
      if (input) input.focus();
    }
  }

  function handleCelebrationTagKey(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      var input = document.getElementById('celebration-tag-input');
      var tag = input.value.trim();
      if (tag && celebrationTags.indexOf(tag) === -1) {
        celebrationTags.push(tag);
        updateCelebrationTags();
      }
    }
  }

  function addCelebrationTag(tag) {
    if (celebrationTags.indexOf(tag) === -1) {
      celebrationTags.push(tag);
      updateCelebrationTags();
    }
  }

  function removeCelebrationTag(index) {
    celebrationTags.splice(index, 1);
    updateCelebrationTags();
  }

  function finishCelebration() {
    if (currentRecordId && celebrationTags.length > 0) {
      Storage.update(currentRecordId, { tags: celebrationTags });
    }
    celebrationTags = [];
    App.closeModal();
    App.refreshView();
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function stopStream() {
    if (abortController) abortController.abort();
    isStreaming = false;
  }

  return {
    openChat: openChat,
    send: send,
    pickImage: pickImage,
    sendImage: sendImage,
    extractAndApply: extractAndApply,
    applyExtracted: applyExtracted,
    stopStream: stopStream,
    hasKey: hasKey,
    newJourney: newJourney,
    handleCelebrationTagKey: handleCelebrationTagKey,
    addCelebrationTag: addCelebrationTag,
    removeCelebrationTag: removeCelebrationTag,
    finishCelebration: finishCelebration,
    _pendingExtract: null
  };
})();
