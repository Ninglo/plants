var Chat = (function() {
  'use strict';

  var API_URL = 'https://api.openai.com/v1/chat/completions';
  var MODEL = 'gpt-4o';
  var KEY_STORAGE = 'plants_openai_key';

  var messages = [];
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
    return '你是一位热心的植物学专家，正在帮助一位植物爱好者认识他们遇到的植物。\n\n' +
      '用户刚刚在野外观察了一株植物，以下是他们的观察记录：\n' + obs + '\n\n' +
      '请基于这些观察信息' + (record.photoIds && record.photoIds.length > 0 ? '和照片' : '') + '，帮助用户：\n' +
      '1. 识别这株植物可能是什么（给出最可能的1-3个候选）\n' +
      '2. 解释观察到的特征在植物学上的意义\n' +
      '3. 分享有趣的相关知识\n\n' +
      '用通俗易懂的语言，像朋友聊天一样自然。回答简洁，不要太长。';
  }

  // 构建包含照片的初始消息
  function buildInitialMessage(record, photos) {
    var content = [];
    var name = record.name || '这株植物';
    content.push({ type: 'text', text: '我刚观察了' + name + '，帮我看看这是什么植物？' });

    // 添加照片（最多3张）
    if (photos && photos.length > 0) {
      var maxPhotos = Math.min(photos.length, 3);
      for (var i = 0; i < maxPhotos; i++) {
        if (photos[i]) {
          content.push({
            type: 'image_url',
            image_url: { url: photos[i], detail: 'low' }
          });
        }
      }
    }

    return content;
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
      alert('请先在设置中填写 OpenAI API Key');
      return;
    }

    currentRecordId = recordId;
    var record = Storage.getById(recordId);
    if (!record) { alert('找不到记录'); return; }

    // 重置状态
    messages = [];
    isStreaming = false;

    // 渲染 UI
    document.getElementById('modal-body').innerHTML = renderChatUI();
    document.getElementById('modal-title').textContent = '🤖 聊聊 ' + (record.name || '这株植物');

    // 确保 modal 打开
    var overlay = document.getElementById('modal-overlay');
    if (!overlay.classList.contains('show')) {
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    }

    // 加载照片并开始对话
    var photoIds = record.photoIds || [];
    if (photoIds.length > 0) {
      PhotoDB.getMultiple(photoIds).then(function(photoMap) {
        var photos = photoIds.map(function(pid) { return photoMap[pid]; }).filter(Boolean);
        startChat(record, photos);
      });
    } else {
      startChat(record, []);
    }
  }

  function startChat(record, photos) {
    // 构建消息
    var systemPrompt = buildSystemPrompt(record);
    var initialContent = buildInitialMessage(record, photos);

    messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: initialContent }
    ];

    // 显示用户消息
    var name = record.name || '这株植物';
    appendMessage('user', '我刚观察了' + name + '，帮我看看这是什么植物？' +
      (photos.length > 0 ? ' [附 ' + photos.length + ' 张照片]' : ''));

    // 发送到 AI
    streamResponse();
  }

  // 流式请求 AI 响应
  function streamResponse() {
    if (isStreaming) return;
    isStreaming = true;

    var sendBtn = document.getElementById('chat-send-btn');
    if (sendBtn) sendBtn.disabled = true;

    // 创建 AI 气泡
    var bubble = appendMessage('assistant', '');
    if (bubble) {
      var cursor = document.createElement('span');
      cursor.className = 'chat-typing-cursor';
      bubble.appendChild(cursor);
    }

    abortController = new AbortController();
    var fullText = '';

    // 构建请求消息（后续消息不重复发图片）
    var apiMessages = messages.map(function(msg, idx) {
      if (idx === 1 && Array.isArray(msg.content)) {
        // 只保留第一次的图片
        return msg;
      }
      return msg;
    });

    fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + getKey(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: apiMessages,
        stream: true
      }),
      signal: abortController.signal
    }).then(function(response) {
      if (!response.ok) {
        return response.json().then(function(err) {
          throw new Error(err.error && err.error.message || 'API 请求失败 (' + response.status + ')');
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
              var delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
              if (delta && delta.content) {
                fullText += delta.content;
                if (bubble) {
                  // 移除光标，更新文本，重新添加光标
                  var cursorEl = bubble.querySelector('.chat-typing-cursor');
                  bubble.textContent = fullText;
                  if (cursorEl) bubble.appendChild(cursorEl);
                }
                var container = document.getElementById('chat-messages');
                if (container) container.scrollTop = container.scrollHeight;
              }
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
      var sendBtn = document.getElementById('chat-send-btn');
      if (sendBtn) sendBtn.disabled = false;

      if (err.name === 'AbortError') return;

      // 显示错误
      if (bubble) {
        bubble.textContent = '';
      }
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

    // 保存 AI 消息
    if (text) {
      messages.push({ role: 'assistant', content: text });
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
    messages.push({ role: 'user', content: text });
    appendMessage('user', text);
    streamResponse();
  }

  // 确认整理 - 提取结构化数据
  function extractAndApply() {
    if (isStreaming) return;
    if (messages.length < 3) {
      alert('请先和 AI 聊几轮再整理');
      return;
    }

    var extractPrompt = '请根据我们刚才的对话，帮我整理出这株植物的信息。\n' +
      '请严格以 JSON 格式回复，只输出 JSON，不要其他文字。字段如下（不确定的留空字符串）：\n' +
      '{"name": "中文名", "latinName": "拉丁学名", "family": "科名", "genus": "属名", "features": "主要特征（一两句话）", "notes": "有趣的知识点（一两句话）"}';

    messages.push({ role: 'user', content: extractPrompt });
    appendMessage('user', '✨ 请帮我整理植物信息...');

    // 流式请求但我们需要收集完整响应来解析 JSON
    isStreaming = true;
    var sendBtn = document.getElementById('chat-send-btn');
    if (sendBtn) sendBtn.disabled = true;

    var bubble = appendMessage('assistant', '');
    if (bubble) {
      var cursor = document.createElement('span');
      cursor.className = 'chat-typing-cursor';
      bubble.appendChild(cursor);
    }

    abortController = new AbortController();
    var fullText = '';

    fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + getKey(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: messages.map(function(msg) {
          // 去掉图片减少 token
          if (Array.isArray(msg.content)) {
            var textOnly = msg.content.filter(function(c) { return c.type === 'text'; });
            return { role: msg.role, content: textOnly.length === 1 ? textOnly[0].text : textOnly };
          }
          return msg;
        }),
        stream: true
      }),
      signal: abortController.signal
    }).then(function(response) {
      if (!response.ok) {
        return response.json().then(function(err) {
          throw new Error(err.error && err.error.message || 'API 请求失败');
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
              var delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
              if (delta && delta.content) {
                fullText += delta.content;
                if (bubble) {
                  var cursorEl = bubble.querySelector('.chat-typing-cursor');
                  bubble.textContent = fullText;
                  if (cursorEl) bubble.appendChild(cursorEl);
                }
                var container = document.getElementById('chat-messages');
                if (container) container.scrollTop = container.scrollHeight;
              }
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

    messages.push({ role: 'assistant', content: text });

    // 尝试解析 JSON
    var jsonStr = text;
    // 处理 markdown 代码块包裹
    var match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1].trim();

    try {
      var extracted = JSON.parse(jsonStr);
      showExtractConfirmation(extracted);
    } catch (e) {
      // JSON 解析失败，尝试提取
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

    // 保存提取数据供确认时使用
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

    // 显示成功
    var container = document.getElementById('chat-messages');
    if (container) {
      var msg = document.createElement('div');
      msg.className = 'chat-bubble chat-bubble-ai';
      msg.style.background = 'var(--green-light)';
      msg.textContent = '已补全！' + (updates.status === 'complete' ? '记录已升级为「已收录」状态。' : '');
      container.appendChild(msg);
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
