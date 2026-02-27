var Chat = (function() {
  'use strict';

  var MODEL = 'gemini-2.5-flash';
  var BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
  var KEY_STORAGE = 'plants_gemini_key';

  var messages = []; // Gemini contents 格式
  var systemPrompt = '';
  var currentRecordId = null;
  var isStreaming = false;
  var abortController = null;

  function getKey() { return localStorage.getItem(KEY_STORAGE) || ''; }
  function hasKey() { return !!getKey(); }

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
    return lines.join('\n');
  }

  // 构建系统提示词
  function buildSystemPrompt(record) {
    var obs = formatObservation(record);
    var hasPhotos = record.photoIds && record.photoIds.length > 0;
    return '你是一位经验丰富的植物学导师，正在带学生做野外植物观察。\n' +
      '你的背景是植物分类学，擅长通过形态特征鉴定物种。\n\n' +
      '学生刚观察了一株植物' + (hasPhotos ? '并拍了照片' : '') + '，记录如下：\n' + obs + '\n\n' +
      '你的回复包含三个部分：\n\n' +
      '「鉴定」\n' +
      '给出最可能的 1-2 个候选，格式：中文名（拉丁学名）。\n' +
      '说明判断依据，引用观察到的具体特征。如有近似种，指出区分要点。\n' +
      '标注把握程度：很确定 / 比较确定 / 不太确定。\n\n' +
      '「引导观察」\n' +
      '根据当前信息的不足，引导再看看 1-2 个细节。\n' +
      '比如：叶子背面有没有毛？花蕊什么颜色？树皮什么纹路？\n\n' +
      '「知识延伸」\n' +
      '围绕这株植物或所在的科/属，分享一个植物学知识点（分类趣事、进化适应、民间用途等），2-3 句话。\n\n' +
      '格式要求：\n' +
      '- 用「」标注每个部分标题，不要用 # 号或星号\n' +
      '- 全程不使用 * 号、# 号等 markdown 符号\n' +
      '- 语气专业但亲切，像一位耐心的老师\n' +
      '- 总字数控制在 300 字以内';
  }

  // 构建 Gemini 格式的初始用户消息 parts
  function buildInitialParts(record, photos) {
    var parts = [];
    var name = record.name || '这株植物';
    parts.push({ text: '我刚观察了' + name + '，帮我看看这是什么植物？' });

    // 添加照片（最多3张）
    if (photos && photos.length > 0) {
      var maxPhotos = Math.min(photos.length, 3);
      for (var i = 0; i < maxPhotos; i++) {
        if (photos[i]) {
          // 从 data URL 提取 mime_type 和 base64 数据
          var match = photos[i].match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            parts.push({
              inline_data: {
                mime_type: match[1],
                data: match[2]
              }
            });
          }
        }
      }
    }

    return parts;
  }

  // 渲染聊天界面
  function renderChatUI() {
    var html = '<div class="chat-container">';
    html += '<div class="chat-messages" id="chat-messages"></div>';
    html += '<div class="chat-bottom-bar">';
    html += '<button class="chat-extract-btn" onclick="Chat.extractAndApply()">✨ 确认整理</button>';
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
      // 直接打开设置页面让用户填写 Key
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

    // 重置状态
    messages = [];
    systemPrompt = '';
    isStreaming = false;

    // 渲染 UI
    document.getElementById('modal-body').innerHTML = renderChatUI();
    document.getElementById('modal-title').textContent = '📋 关于「' + (record.name || '这株植物') + '」';

    // 确保 modal 打开
    var overlay = document.getElementById('modal-overlay');
    if (!overlay.classList.contains('show')) {
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    }

    // 加载照片并开始对话
    var photoIds = record.photoIds || [];
    if (photoIds.length > 0) {
      PhotoDB.getMultiple(photoIds).then(function(results) {
        // getMultiple 返回 [{id, data}] 数组，提取 data
        var photos = results.map(function(r) { return r && r.data; }).filter(Boolean);
        startChat(record, photos);
      });
    } else {
      startChat(record, []);
    }
  }

  function startChat(record, photos) {
    systemPrompt = buildSystemPrompt(record);
    var initialParts = buildInitialParts(record, photos);

    // Gemini contents 格式
    messages = [
      { role: 'user', parts: initialParts }
    ];

    // 显示用户消息
    var name = record.name || '这株植物';
    appendMessage('user', '我刚观察了' + name + '，帮我看看这是什么植物？' +
      (photos.length > 0 ? ' [附 ' + photos.length + ' 张照片]' : ''));

    // 发送到 AI
    streamResponse();
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
    appendMessage('user', text);
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
    _pendingExtract: null
  };
})();
