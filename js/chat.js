var Chat = (function() {
  'use strict';

  var MODEL = 'gemini-2.5-flash';
  var BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
  var KEY_STORAGE = 'plants_gemini_key';

  var CHAT_STORAGE = 'plants_chat_messages';
  var CHAT_DISPLAY = 'plants_chat_display'; // 显示用消息（纯文本）
  var CHAT_PLANTS = 'plants_chat_plant_ids';
  var MAX_MESSAGES = 15; // 超过此数自动精简

  var messages = []; // Gemini contents 格式
  var displayMessages = []; // 纯文本显示记录 [{role, text}]
  var systemPrompt = '';
  var currentRecordId = null;
  var isStreaming = false;
  var abortController = null;
  var chatPlantIds = []; // 本轮对话涉及的植物 ID

  function getKey() { return localStorage.getItem(KEY_STORAGE) || ''; }
  function hasKey() { return !!getKey(); }

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

  // 趣味称号池
  var TITLES = [
    '伟大的植物探险家', '了不起的自然观察者', '好奇的博物学家',
    '勇敢的田野调查员', '敏锐的植物猎人', '执着的绿色侦探',
    '未来的植物分类学家', '充满好奇心的自然旅人'
  ];

  function randomTitle() {
    return TITLES[Math.floor(Math.random() * TITLES.length)];
  }

  // 构建系统提示词（引导式，非鉴定式）
  function buildSystemPrompt() {
    var title = randomTitle();
    return '你是一位经验丰富的植物学导师，正在带一位' + title + '做野外观察训练。\n' +
      '你的目标不是直接告诉答案，而是通过提问和引导，帮助对方自己建立植物观察的逻辑和方法。\n\n' +
      '对话中可能出现多株植物，你要帮助对方发现不同植物之间的异同。\n\n' +
      '你的回复包含三个部分：\n\n' +
      '「观察确认」\n' +
      '基于提供的观察信息，指出哪些观察做得好、哪些细节很有价值。\n' +
      '给予正面反馈，让观察者知道自己在正确的方向上。\n\n' +
      '「引导深入」\n' +
      '提出 2-3 个高价值的结构性问题，引导进一步观察。\n' +
      '这些问题应该帮助缩小范围或发现关键鉴别特征。\n' +
      '如果对话中有多株植物，引导对比不同科属之间的相似和不同。\n\n' +
      '「知识线索」\n' +
      '不要直接给出物种名称，而是给出分类线索，比如"这些特征指向某个科/属的方向"。\n' +
      '分享相关的植物学思维方法，帮助对方构建自己的观察逻辑。\n\n' +
      '格式要求：\n' +
      '- 用「」标注每部分标题，不要用 # 号或星号\n' +
      '- 全程不使用 * 号、# 号等 markdown 符号\n' +
      '- 语气像一位有趣的导师，专业但偶尔幽默\n' +
      '- 总字数控制在 300 字以内\n' +
      '- 除非对方明确说"帮我鉴定"或"这到底是什么植物"，否则不要直接给出物种名';
  }

  // (buildInitialParts 已合并到 addPlantToChat)

  // 渲染聊天界面
  function renderChatUI() {
    var html = '<div class="chat-container">';
    html += '<div class="chat-messages" id="chat-messages"></div>';
    html += '<div class="chat-bottom-bar">';
    html += '<button class="chat-extract-btn" onclick="Chat.extractAndApply()">✨ 确认整理</button>';
    html += '<button class="chat-new-btn" onclick="Chat.newJourney()" style="background:none; border:1px solid var(--border); color:var(--gray-500); padding:8px 14px; border-radius:20px; font-size:13px; cursor:pointer;">🌱 新旅程</button>';
    html += '</div>';
    html += '<div class="chat-input-bar">';
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

    // 加载照片并追加这株植物
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
      var maxPhotos = Math.min(photos.length, 3);
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

    var url = BASE_URL + MODEL + ':generateContent?key=' + getKey();

    var body = buildRequestBody(messages, false);
    body.contents.push({ role: 'user', parts: [{ text: summarizePrompt }] });

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function(res) {
      return res.json();
    }).then(function(data) {
      var summary = '';
      try { summary = data.candidates[0].content.parts[0].text; } catch (e) {}
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
    var contents = msgs.map(function(msg, idx) {
      if (!includePhotos && idx === 0 && msg.parts) {
        // 去掉图片 parts，只保留 text
        var textParts = msg.parts.filter(function(p) { return p.text !== undefined; });
        return { role: msg.role, parts: textParts };
      }
      return msg;
    });

    return {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
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

    var url = BASE_URL + MODEL + ':streamGenerateContent?alt=sse&key=' + getKey();

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequestBody(messages, true)),
      signal: abortController.signal
    }).then(function(response) {
      if (response.status === 429) {
        // 频率限制 — 等 5 秒自动重试
        if (bubble) bubble.textContent = '请求太快了，5 秒后自动重试...';
        setTimeout(function() {
          if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
          isStreaming = false;
          streamResponse();
        }, 5000);
        return;
      }
      if (!response.ok) {
        return response.json().then(function(err) {
          var errMsg = (err.error && err.error.message) || 'API 请求失败 (' + response.status + ')';
          throw new Error(errMsg);
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
              var container = document.getElementById('chat-messages');
              if (container) container.scrollTop = container.scrollHeight;
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

    // 保存 AI 消息（Gemini 用 "model" 角色）
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

  // 确认整理 - 提取结构化数据
  function extractAndApply() {
    if (isStreaming) return;
    if (messages.length < 2) {
      alert('请先和 AI 聊几轮再整理');
      return;
    }

    var extractPrompt = '根据我们的对话，整理这株植物的鉴定结果。\n' +
      '严格输出 JSON，不要输出任何其他文字。不确定的字段留空字符串。\n' +
      '{"name": "中文正式名（如：山樱花）", "latinName": "完整拉丁学名（如：Cerasus serrulata）", "family": "中文科名+拉丁科名（如：蔷薇科 Rosaceae）", "genus": "中文属名+拉丁属名（如：樱属 Cerasus）", "features": "2-3个核心鉴别特征，用植物学术语", "notes": "1-2句相关知识（生态、文化或分类学意义）"}';

    messages.push({ role: 'user', parts: [{ text: extractPrompt }] });
    appendMessage('user', '✨ 请帮我整理植物信息...');

    // 流式请求
    isStreaming = true;
    var sendBtn = document.getElementById('chat-send-btn');
    if (sendBtn) sendBtn.disabled = true;

    var bubble = appendMessage('model', '');
    if (bubble) {
      var cursor = document.createElement('span');
      cursor.className = 'chat-typing-cursor';
      bubble.appendChild(cursor);
    }

    abortController = new AbortController();
    var fullText = '';

    var url = BASE_URL + MODEL + ':streamGenerateContent?alt=sse&key=' + getKey();

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequestBody(messages, false)),
      signal: abortController.signal
    }).then(function(response) {
      if (!response.ok) {
        return response.json().then(function(err) {
          throw new Error((err.error && err.error.message) || 'API 请求失败');
        });
      }

      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';

      function readChunk() {
        reader.read().then(function(result) {
          if (result.done) {
            finishExtraction(fullText, bubble);
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
              finishExtraction(fullText, bubble);
              return;
            }
            try {
              var parsed = JSON.parse(data);
              var parts = parsed.candidates && parsed.candidates[0] &&
                parsed.candidates[0].content && parsed.candidates[0].content.parts;
              if (parts) {
                for (var j = 0; j < parts.length; j++) {
                  if (parts[j].text) fullText += parts[j].text;
                }
              }
              if (bubble) {
                var cursorEl = bubble.querySelector('.chat-typing-cursor');
                bubble.textContent = fullText;
                if (cursorEl) bubble.appendChild(cursorEl);
              }
              var container = document.getElementById('chat-messages');
              if (container) container.scrollTop = container.scrollHeight;
            } catch (e) {}
          }
          readChunk();
        }).catch(function(err) {
          if (err.name !== 'AbortError') finishExtraction(fullText, bubble);
        });
      }

      readChunk();
    }).catch(function(err) {
      isStreaming = false;
      if (sendBtn) sendBtn.disabled = false;
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

  function finishExtraction(text, bubble) {
    isStreaming = false;
    var sendBtn = document.getElementById('chat-send-btn');
    if (sendBtn) sendBtn.disabled = false;

    if (bubble) {
      var cursor = bubble.querySelector('.chat-typing-cursor');
      if (cursor) cursor.remove();
    }

    messages.push({ role: 'model', parts: [{ text: text }] });

    // 尝试解析 JSON
    var jsonStr = text;
    var match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1].trim();

    try {
      var extracted = JSON.parse(jsonStr);
      showExtractConfirmation(extracted);
    } catch (e) {
      var match2 = text.match(/\{[\s\S]*\}/);
      if (match2) {
        try {
          var extracted2 = JSON.parse(match2[0]);
          showExtractConfirmation(extracted2);
          return;
        } catch (e2) {}
      }
      var container = document.getElementById('chat-messages');
      if (container) {
        var errDiv = document.createElement('div');
        errDiv.className = 'chat-error';
        errDiv.textContent = 'AI 返回的格式无法解析，请再试一次';
        container.appendChild(errDiv);
        container.scrollTop = container.scrollHeight;
      }
    }
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

  function applyExtracted() {
    var data = Chat._pendingExtract;
    if (!data || !currentRecordId) return;

    var updates = {};
    if (data.name) updates.name = data.name;
    if (data.latinName) updates.latinName = data.latinName;
    if (data.family) updates.family = data.family;
    if (data.genus) updates.genus = data.genus;
    if (data.features) updates.features = data.features;
    if (data.notes) updates.notes = data.notes;

    // 如果核心字段都有了，升级为 complete
    if (data.name && data.family) {
      updates.status = 'complete';
    }

    Storage.update(currentRecordId, updates);
    Chat._pendingExtract = null;

    // 显示成功 + 完成按钮
    var container = document.getElementById('chat-messages');
    if (container) {
      var successHtml = '<div style="text-align:center; padding:16px 0;">';
      successHtml += '<div style="font-size:32px; margin-bottom:8px;">✅</div>';
      successHtml += '<div style="font-weight:600; font-size:15px; color:var(--green);">信息已补全！</div>';
      if (updates.status === 'complete') {
        successHtml += '<div style="font-size:13px; color:var(--gray-400); margin-top:4px;">记录已升级为「已收录」状态</div>';
      }
      successHtml += '<button class="btn btn-primary btn-block" style="margin-top:14px;" onclick="App.closeModal()">完成</button>';
      successHtml += '</div>';
      var div = document.createElement('div');
      div.innerHTML = successHtml;
      container.appendChild(div.firstChild);
      container.scrollTop = container.scrollHeight;
    }

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
    extractAndApply: extractAndApply,
    applyExtracted: applyExtracted,
    stopStream: stopStream,
    hasKey: hasKey,
    newJourney: newJourney,
    _pendingExtract: null
  };
})();
