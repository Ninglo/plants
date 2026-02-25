/* ========== 录入表单 ========== */
var Form = (function() {
  var currentType = 'plant';
  var currentPhotos = []; // [{id: string|null, data: string}]
  var currentTags = [];
  var currentLinks = [];
  var editingId = null;

  // 语音识别
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function startVoiceInput(targetInput) {
    if (!SpeechRecognition) {
      alert('你的浏览器不支持语音输入，请使用 Safari 或 Chrome');
      return;
    }
    var recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;

    var btn = targetInput.parentElement.querySelector('.btn-voice');
    btn.classList.add('recording');

    recognition.onresult = function(event) {
      var text = event.results[0][0].transcript;
      if (targetInput.tagName === 'TEXTAREA') {
        targetInput.value += (targetInput.value ? '\n' : '') + text;
      } else {
        targetInput.value = text;
      }
      btn.classList.remove('recording');
    };
    recognition.onerror = function() { btn.classList.remove('recording'); };
    recognition.onend = function() { btn.classList.remove('recording'); };
    recognition.start();
  }

  function createVoiceBtn() {
    return '<button type="button" class="btn-voice" onclick="Form.handleVoice(this)">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>' +
      '<path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>' +
      '<line x1="8" y1="23" x2="16" y2="23"/></svg></button>';
  }

  // 打开新建表单
  function openNew(type) {
    editingId = null;
    currentType = type || 'plant';
    currentPhotos = [];
    currentTags = [];
    currentLinks = [];
    render();
    App.openModal(getTitle());
  }

  // 打开编辑表单
  function openEdit(id) {
    var record = Storage.getById(id);
    if (!record) return;
    editingId = id;
    currentType = record.type;
    currentTags = record.tags || [];
    currentLinks = record.links || [];

    var photoIds = record.photoIds || [];
    if (photoIds.length > 0) {
      PhotoDB.getMultiple(photoIds).then(function(results) {
        currentPhotos = results.map(function(r) { return { id: r.id, data: r.data }; });
        render();
        App.openModal(getTitle());
        setTimeout(function() { fillForm(record); }, 50);
      });
    } else {
      currentPhotos = [];
      render();
      App.openModal(getTitle());
      setTimeout(function() { fillForm(record); }, 50);
    }
  }

  // 从待处理转为正式记录
  function openFromPending(id) {
    var record = Storage.getById(id);
    if (!record) return;
    editingId = id;
    currentType = record.type || 'plant';
    currentTags = record.tags || [];
    currentLinks = record.links || [];

    var photoIds = record.photoIds || [];
    if (photoIds.length > 0) {
      PhotoDB.getMultiple(photoIds).then(function(results) {
        currentPhotos = results.map(function(r) { return { id: r.id, data: r.data }; });
        render();
        App.openModal('完善记录');
        setTimeout(function() { fillForm(record); }, 50);
      });
    } else {
      currentPhotos = [];
      render();
      App.openModal('完善记录');
      setTimeout(function() { fillForm(record); }, 50);
    }
  }

  function getTitle() {
    if (editingId) return '编辑记录';
    var titles = { plant: '记录新植物', knowledge: '记录植物学知识', ecology: '记录新发现' };
    return titles[currentType] || '新记录';
  }

  function render() {
    var html = '';

    // 类型选择器
    html += '<div class="type-selector">';
    html += '<button class="type-btn ' + (currentType === 'plant' ? 'active-plant' : '') + '" onclick="Form.setType(\'plant\')">🌿 植物</button>';
    html += '<button class="type-btn ' + (currentType === 'knowledge' ? 'active-knowledge' : '') + '" onclick="Form.setType(\'knowledge\')">📖 知识</button>';
    html += '<button class="type-btn ' + (currentType === 'ecology' ? 'active-ecology' : '') + '" onclick="Form.setType(\'ecology\')">🔍 发现</button>';
    html += '</div>';

    // 粘贴识别
    html += '<button class="btn-paste" onclick="Form.togglePasteArea()">📋 粘贴识别 — 从剪贴板导入文字</button>';
    html += '<div id="paste-area" style="display:none; margin-bottom:16px;">';
    html += '<textarea id="paste-text" class="form-textarea" rows="6" placeholder="把整理好的文字粘贴到这里...\n支持格式如：\n中文名：xxx\n科：xxx\n关键特征：xxx"></textarea>';
    html += '<div style="display:flex; gap:8px; margin-top:8px;">';
    html += '<button class="btn btn-primary btn-sm" style="flex:1;" onclick="Form.applyPaste()">识别填入</button>';
    html += '<button class="btn btn-sm" style="flex:1;" onclick="Form.togglePasteArea()">取消</button>';
    html += '</div></div>';

    // 根据类型显示不同表单
    if (currentType === 'plant') {
      html += renderPlantForm();
    } else if (currentType === 'knowledge') {
      html += renderKnowledgeForm();
    } else {
      html += renderEcologyForm();
    }

    // 标签
    html += renderTagsInput();

    // 智能推荐关联
    html += '<div id="recommend-section"></div>';

    // 手动关联记录
    html += renderLinksSelector();

    // 操作按钮
    html += '<div style="margin-top:20px; display:flex; gap:10px;">';
    html += '<button class="btn btn-primary btn-block" onclick="Form.save()">保存</button>';
    if (editingId) {
      html += '<button class="btn btn-danger" onclick="Form.deleteRecord()">删除</button>';
    }
    html += '</div>';

    document.getElementById('modal-body').innerHTML = html;

    // 绑定推荐触发事件（防抖，字段失焦时刷新推荐）
    setTimeout(function() {
      var watchFields = ['f-name', 'f-family', 'f-genus', 'f-category', 'f-relatedObjects'];
      watchFields.forEach(function(fieldId) {
        var el = document.getElementById(fieldId);
        if (el) el.addEventListener('blur', scheduleRecommendUpdate);
      });
      // 初始渲染推荐（编辑模式下已有数据）
      updateRecommendations();
    }, 100);
  }

  function renderPlantForm() {
    var html = '';
    html += '<div class="form-group">';
    html += '<label class="form-label">中文名 *</label>';
    html += '<div class="input-with-voice"><input type="text" class="form-input" id="f-name" placeholder="如：银杏">' + createVoiceBtn() + '</div>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label class="form-label">学名（拉丁名）</label>';
    html += '<input type="text" class="form-input" id="f-latinName" placeholder="选填，如：Ginkgo biloba">';
    html += '</div>';

    html += '<div class="form-row">';
    html += '<div class="form-group"><label class="form-label">科</label><input type="text" class="form-input" id="f-family" placeholder="选填"></div>';
    html += '<div class="form-group"><label class="form-label">属</label><input type="text" class="form-input" id="f-genus" placeholder="选填"></div>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label class="form-label">关键特征</label>';
    html += '<div class="input-with-voice"><textarea class="form-textarea" id="f-features" rows="3" placeholder="如：叶扇形，秋季变黄">' + '</textarea>' + createVoiceBtn() + '</div>';
    html += '</div>';

    // 照片
    html += renderPhotoUpload();

    html += '<div class="form-row">';
    html += '<div class="form-group"><label class="form-label">发现日期</label><input type="date" class="form-input" id="f-date" value="' + new Date().toISOString().split('T')[0] + '"></div>';
    html += '<div class="form-group"><label class="form-label">发现地点</label><div class="input-with-voice"><input type="text" class="form-input" id="f-location" placeholder="选填">' + createVoiceBtn() + '</div></div>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label class="form-label">是什么吸引了我</label>';
    html += '<div class="input-with-voice"><textarea class="form-textarea" id="f-attraction" placeholder="记录你最初注意到它的原因...">' + '</textarea>' + createVoiceBtn() + '</div>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label class="form-label">学习笔记</label>';
    html += '<div class="input-with-voice"><textarea class="form-textarea" id="f-notes" placeholder="深入了解后记录在这里...">' + '</textarea>' + createVoiceBtn() + '</div>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label class="form-label">我的思考</label>';
    html += '<div class="input-with-voice"><textarea class="form-textarea" id="f-thoughts" placeholder="你的感悟和联想...">' + '</textarea>' + createVoiceBtn() + '</div>';
    html += '</div>';

    return html;
  }

  function renderKnowledgeForm() {
    var html = '';
    html += '<div class="form-group">';
    html += '<label class="form-label">主题名称 *</label>';
    html += '<div class="input-with-voice"><input type="text" class="form-input" id="f-title" placeholder="如：落叶策略">' + createVoiceBtn() + '</div>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label class="form-label">知识分类</label>';
    html += '<input type="text" class="form-input" id="f-category" placeholder="如：叶片、繁殖、生理">';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label class="form-label">内容</label>';
    html += '<div class="input-with-voice"><textarea class="form-textarea" id="f-content" rows="6" placeholder="记录学到的知识...">' + '</textarea>' + createVoiceBtn() + '</div>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label class="form-label">引发思考的来源</label>';
    html += '<div class="input-with-voice"><textarea class="form-textarea" id="f-source" placeholder="什么观察让你想了解这个主题...">' + '</textarea>' + createVoiceBtn() + '</div>';
    html += '</div>';

    // 照片
    html += renderPhotoUpload();

    html += '<div class="form-group">';
    html += '<label class="form-label">日期</label>';
    html += '<input type="date" class="form-input" id="f-date" value="' + new Date().toISOString().split('T')[0] + '">';
    html += '</div>';

    return html;
  }

  function renderEcologyForm() {
    var html = '';
    html += '<div class="form-group">';
    html += '<label class="form-label">主题名称 *</label>';
    html += '<div class="input-with-voice"><input type="text" class="form-input" id="f-title" placeholder="如：鸟与树的伴生关系">' + createVoiceBtn() + '</div>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label class="form-label">涉及对象</label>';
    html += '<div class="input-with-voice"><input type="text" class="form-input" id="f-relatedObjects" placeholder="涉及的物种或因素">' + createVoiceBtn() + '</div>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label class="form-label">内容</label>';
    html += '<div class="input-with-voice"><textarea class="form-textarea" id="f-content" rows="6" placeholder="记录你的发现...">' + '</textarea>' + createVoiceBtn() + '</div>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label class="form-label">我的观察</label>';
    html += '<div class="input-with-voice"><textarea class="form-textarea" id="f-observation" placeholder="我自己看到的现象...">' + '</textarea>' + createVoiceBtn() + '</div>';
    html += '</div>';

    // 照片
    html += renderPhotoUpload();

    html += '<div class="form-group">';
    html += '<label class="form-label">日期</label>';
    html += '<input type="date" class="form-input" id="f-date" value="' + new Date().toISOString().split('T')[0] + '">';
    html += '</div>';

    return html;
  }

  function renderPhotoUpload() {
    var html = '<div class="form-group">';
    html += '<label class="form-label">照片</label>';
    html += '<div class="photo-grid" id="photo-grid">';
    html += buildPhotoGridContent();
    html += '</div></div>';
    return html;
  }

  function buildPhotoGridContent() {
    var html = '';
    currentPhotos.forEach(function(photo, i) {
      html += '<div class="photo-item"><img src="' + photo.data + '"><button class="photo-remove" onclick="Form.removePhoto(' + i + ')">×</button></div>';
    });
    html += '<label class="photo-add"><input type="file" accept="image/*" multiple style="display:none" onchange="Form.addPhotos(this.files)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></label>';
    return html;
  }

  function renderTagsInput() {
    var html = '<div class="form-group">';
    html += '<label class="form-label">标签</label>';
    html += '<div class="tags-container" id="tags-container">';
    html += buildTagsContent();
    html += '</div></div>';
    return html;
  }

  function buildTagsContent() {
    var html = '';
    currentTags.forEach(function(tag, i) {
      html += '<span class="tag">' + tag + '<button class="tag-remove" onclick="Form.removeTag(' + i + ')">×</button></span>';
    });
    html += '<input type="text" class="tag-input" id="tag-input" placeholder="输入标签后按回车" onkeydown="Form.handleTagKey(event)">';
    return html;
  }

  // 只刷新照片区域，不影响其他表单值
  function updatePhotoGrid() {
    var grid = document.getElementById('photo-grid');
    if (grid) grid.innerHTML = buildPhotoGridContent();
  }

  // 只刷新标签区域，不影响其他表单值
  function updateTagsContainer() {
    var container = document.getElementById('tags-container');
    if (container) {
      container.innerHTML = buildTagsContent();
      var input = document.getElementById('tag-input');
      if (input) input.focus();
    }
  }

  function renderLinksSelector() {
    var allRecords = Storage.getCompleted().filter(function(r) { return r.id !== editingId; });
    if (allRecords.length === 0) return '';

    var html = '<div class="form-group">';
    html += '<label class="form-label">关联记录</label>';
    html += '<div class="link-selector">';
    allRecords.forEach(function(r) {
      var isSelected = currentLinks.indexOf(r.id) !== -1;
      var name = r.name || r.title || '未命名';
      var badgeClass = r.type === 'plant' ? 'badge-plant' : r.type === 'knowledge' ? 'badge-knowledge' : 'badge-ecology';
      var typeLabel = r.type === 'plant' ? '🌿' : r.type === 'knowledge' ? '📖' : '🔗';
      html += '<div class="link-option ' + (isSelected ? 'selected' : '') + '" data-link-id="' + r.id + '" onclick="Form.toggleLink(\'' + r.id + '\', this)">';
      html += '<span class="link-check">' + (isSelected ? '✓' : '') + '</span>';
      html += '<span class="card-type-badge ' + badgeClass + '">' + typeLabel + '</span>';
      html += '<span>' + name + '</span>';
      html += '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function fillForm(record) {
    if (currentType === 'plant') {
      setVal('f-name', record.name);
      setVal('f-latinName', record.latinName);
      setVal('f-family', record.family);
      setVal('f-genus', record.genus);
      setVal('f-features', record.features);
      setVal('f-date', record.date);
      setVal('f-location', record.location);
      setVal('f-attraction', record.attraction);
      setVal('f-notes', record.notes);
      setVal('f-thoughts', record.thoughts);
    } else if (currentType === 'knowledge') {
      setVal('f-title', record.title);
      setVal('f-category', record.category);
      setVal('f-content', record.content);
      setVal('f-source', record.source);
      setVal('f-date', record.date);
    } else {
      setVal('f-title', record.title);
      setVal('f-relatedObjects', record.relatedObjects);
      setVal('f-content', record.content);
      setVal('f-observation', record.observation);
      setVal('f-date', record.date);
    }
  }

  function setVal(id, value) {
    var el = document.getElementById(id);
    if (el && value) el.value = value;
  }

  function getVal(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  // 保存记录
  function save() {
    var record = {
      type: currentType,
      status: 'complete',
      tags: currentTags,
      links: currentLinks,
      date: getVal('f-date')
    };

    if (currentType === 'plant') {
      record.name = getVal('f-name');
      if (!record.name) { alert('请输入植物名称'); return; }
      record.latinName = getVal('f-latinName');
      record.family = getVal('f-family');
      record.genus = getVal('f-genus');
      record.features = getVal('f-features');
      record.location = getVal('f-location');
      record.attraction = getVal('f-attraction');
      record.notes = getVal('f-notes');
      record.thoughts = getVal('f-thoughts');
    } else if (currentType === 'knowledge') {
      record.title = getVal('f-title');
      if (!record.title) { alert('请输入主题名称'); return; }
      record.category = getVal('f-category');
      record.content = getVal('f-content');
      record.source = getVal('f-source');
    } else {
      record.title = getVal('f-title');
      if (!record.title) { alert('请输入主题名称'); return; }
      record.relatedObjects = getVal('f-relatedObjects');
      record.content = getVal('f-content');
      record.observation = getVal('f-observation');
    }

    // 先保存新照片到 IndexedDB，再保存记录
    var savePromises = [];
    var allPhotoIds = [];

    currentPhotos.forEach(function(photo) {
      if (photo.id) {
        allPhotoIds.push(photo.id);
      } else {
        var newId = 'photo_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
        allPhotoIds.push(newId);
        savePromises.push(PhotoDB.save(newId, photo.data));
      }
    });

    record.photoIds = allPhotoIds;

    Promise.all(savePromises).then(function() {
      if (editingId) {
        Storage.update(editingId, record);
        currentLinks.forEach(function(linkId) {
          var linked = Storage.getById(linkId);
          if (linked && (!linked.links || linked.links.indexOf(editingId) === -1)) {
            var newLinks = (linked.links || []).concat(editingId);
            Storage.update(linkId, { links: newLinks });
          }
        });
      } else {
        var created = Storage.create(record);
        currentLinks.forEach(function(linkId) {
          var linked = Storage.getById(linkId);
          if (linked && (!linked.links || linked.links.indexOf(created.id) === -1)) {
            var newLinks = (linked.links || []).concat(created.id);
            Storage.update(linkId, { links: newLinks });
          }
        });
      }

      App.refreshView();
      showCelebration(record);
    });
  }

  function deleteRecord() {
    if (confirm('确定要删除这条记录吗？')) {
      Storage.remove(editingId);
      App.closeModal();
      App.refreshView();
    }
  }

  // 照片操作 — 只刷新照片区域，不丢失表单数据
  function addPhotos(files) {
    var promises = [];
    for (var i = 0; i < files.length; i++) {
      promises.push(Storage.compressImage(files[i]));
    }
    Promise.all(promises).then(function(results) {
      results.forEach(function(data) {
        currentPhotos.push({ id: null, data: data });
      });
      updatePhotoGrid();
    });
  }

  function removePhoto(index) {
    currentPhotos.splice(index, 1);
    updatePhotoGrid();
  }

  // 标签操作 — 只刷新标签区域
  function handleTagKey(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      var input = document.getElementById('tag-input');
      var tag = input.value.trim();
      if (tag && currentTags.indexOf(tag) === -1) {
        currentTags.push(tag);
        updateTagsContainer();
        scheduleRecommendUpdate();
      }
    }
  }

  function removeTag(index) {
    currentTags.splice(index, 1);
    updateTagsContainer();
    scheduleRecommendUpdate();
  }

  // 链接操作
  function toggleLink(id, el) {
    var index = currentLinks.indexOf(id);
    if (index === -1) {
      currentLinks.push(id);
      el.classList.add('selected');
      el.querySelector('.link-check').textContent = '✓';
    } else {
      currentLinks.splice(index, 1);
      el.classList.remove('selected');
      el.querySelector('.link-check').textContent = '';
    }
  }

  // 语音
  function handleVoice(btn) {
    var container = btn.parentElement;
    var input = container.querySelector('input, textarea');
    if (input) startVoiceInput(input);
  }

  function setType(type) {
    currentType = type;
    render();
    document.getElementById('modal-title').textContent = getTitle();
  }

  // ========== 粘贴识别功能 ==========

  function togglePasteArea() {
    var area = document.getElementById('paste-area');
    if (area) {
      var visible = area.style.display !== 'none';
      area.style.display = visible ? 'none' : 'block';
      if (!visible) {
        var ta = document.getElementById('paste-text');
        if (ta) ta.focus();
      }
    }
  }

  function applyPaste() {
    var ta = document.getElementById('paste-text');
    var text = ta ? ta.value : '';
    if (!text.trim()) {
      alert('请先粘贴文字');
      return;
    }
    var parsed = parseClipboardText(text, currentType);
    fillParsed(parsed);
    // 收起粘贴区域
    var area = document.getElementById('paste-area');
    if (area) area.style.display = 'none';
  }

  function parseClipboardText(text, type) {
    var result = {};
    var lines = text.split('\n');

    // 各类型的字段定义（按优先级排列，长key在前避免短key误匹配）
    var fieldDefs;
    if (type === 'plant') {
      fieldDefs = [
        { keys: ['中文名'], field: 'name' },
        { keys: ['学名（拉丁名）', '学名', '拉丁名'], field: 'latinName' },
        { keys: ['科'], field: 'family' },
        { keys: ['属'], field: 'genus' },
        { keys: ['关键特征', '特征'], field: 'features' },
        { keys: ['发现日期', '日期'], field: 'date' },
        { keys: ['发现地点', '地点', '位置'], field: 'location' },
        { keys: ['是什么吸引了我', '吸引'], field: 'attraction' },
        { keys: ['学习笔记', '笔记'], field: 'notes' },
        { keys: ['我的思考', '思考'], field: 'thoughts' },
      ];
    } else if (type === 'knowledge') {
      fieldDefs = [
        { keys: ['主题名称', '主题', '名称'], field: 'title' },
        { keys: ['知识分类', '分类'], field: 'category' },
        { keys: ['内容'], field: 'content' },
        { keys: ['引发思考的来源', '来源', '引发思考'], field: 'source' },
        { keys: ['日期'], field: 'date' },
      ];
    } else {
      fieldDefs = [
        { keys: ['主题名称', '主题', '名称'], field: 'title' },
        { keys: ['关联对象'], field: 'relatedObjects' },
        { keys: ['内容'], field: 'content' },
        { keys: ['我的观察', '观察'], field: 'observation' },
        { keys: ['日期'], field: 'date' },
      ];
    }

    var skipKeys = ['照片', '建议补充'];
    var currentField = null;
    var currentValue = [];

    function saveCurrent() {
      if (currentField && currentValue.length > 0) {
        result[currentField] = currentValue.join('\n').trim();
      }
      currentField = null;
      currentValue = [];
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      // 检查是否是需要跳过的行（照片、建议补充等）
      var shouldSkip = false;
      for (var s = 0; s < skipKeys.length; s++) {
        if (line.indexOf(skipKeys[s]) === 0) {
          saveCurrent();
          shouldSkip = true;
          break;
        }
      }
      if (shouldSkip) continue;

      // 匹配字段标签
      var matched = false;
      for (var j = 0; j < fieldDefs.length; j++) {
        var def = fieldDefs[j];
        for (var k = 0; k < def.keys.length; k++) {
          var key = def.keys[k];
          if (line.indexOf(key) === 0) {
            // 确认 key 后面紧跟的是分隔符，而不是其他汉字
            var charAfterKey = line.charAt(key.length);
            if (charAfterKey === '' || charAfterKey === ':' || charAfterKey === '：' ||
                charAfterKey === ' ' || charAfterKey === '\t') {
              var rest = line.substring(key.length).trim();
              if (rest.charAt(0) === ':' || rest.charAt(0) === '：') {
                rest = rest.substring(1).trim();
              }
              saveCurrent();
              currentField = def.field;
              if (rest) currentValue.push(rest);
              matched = true;
              break;
            }
          }
        }
        if (matched) break;
      }

      if (!matched && currentField) {
        currentValue.push(line);
      }
    }

    saveCurrent();
    return result;
  }

  function fillParsed(parsed) {
    var fieldMap;
    if (currentType === 'plant') {
      fieldMap = {
        name: 'f-name', latinName: 'f-latinName', family: 'f-family',
        genus: 'f-genus', features: 'f-features', date: 'f-date',
        location: 'f-location', attraction: 'f-attraction',
        notes: 'f-notes', thoughts: 'f-thoughts'
      };
    } else if (currentType === 'knowledge') {
      fieldMap = {
        title: 'f-title', category: 'f-category',
        content: 'f-content', source: 'f-source', date: 'f-date'
      };
    } else {
      fieldMap = {
        title: 'f-title', relatedObjects: 'f-relatedObjects',
        content: 'f-content', observation: 'f-observation', date: 'f-date'
      };
    }

    var keys = Object.keys(parsed);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var elId = fieldMap[key];
      if (!elId) continue;
      var el = document.getElementById(elId);
      if (!el) continue;
      var value = parsed[key];

      // 日期格式标准化
      if (key === 'date') {
        value = normalizeDate(value);
      } else if (el.tagName === 'INPUT') {
        // 单行输入框：多行内容用分号连接
        value = value.replace(/\n/g, '；');
      }
      // textarea 保持换行

      el.value = value;
    }
  }

  function normalizeDate(str) {
    var match = str.match(/(\d{4})\s*[\-\/\.年]\s*(\d{1,2})\s*[\-\/\.月]\s*(\d{1,2})/);
    if (match) {
      var m = parseInt(match[2]);
      var d = parseInt(match[3]);
      return match[1] + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
    }
    return str;
  }

  // ========== 智能推荐 ==========

  var recommendTimer = null;

  function scheduleRecommendUpdate() {
    clearTimeout(recommendTimer);
    recommendTimer = setTimeout(updateRecommendations, 300);
  }

  function gatherCurrentFormData() {
    var data = { type: currentType, tags: currentTags };
    if (currentType === 'plant') {
      data.name = getVal('f-name');
      data.family = getVal('f-family');
      data.genus = getVal('f-genus');
    } else if (currentType === 'knowledge') {
      data.title = getVal('f-title');
      data.category = getVal('f-category');
    } else {
      data.title = getVal('f-title');
      data.relatedObjects = getVal('f-relatedObjects');
    }
    return data;
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function updateRecommendations() {
    var section = document.getElementById('recommend-section');
    if (!section) return;

    var currentData = gatherCurrentFormData();
    var recs = Recommend.getRecommendations(currentData, editingId);

    if (recs.length === 0) {
      section.innerHTML = '';
      return;
    }

    var html = '<label class="form-label">💡 推荐关联</label>';
    html += '<div class="recommend-list">';

    recs.forEach(function(item) {
      var r = item.record;
      var name = r.name || r.title || '未命名';
      var isLinked = currentLinks.indexOf(r.id) !== -1;
      var typeIcon = r.type === 'plant' ? '🌿' : r.type === 'knowledge' ? '📖' : '🔗';
      var badgeClass = r.type === 'plant' ? 'badge-plant' : r.type === 'knowledge' ? 'badge-knowledge' : 'badge-ecology';

      html += '<div class="recommend-item' + (isLinked ? ' linked' : '') + '" onclick="Form.toggleRecommendLink(\'' + r.id + '\', this)">';
      html += '<div class="recommend-item-header">';
      html += '<span class="recommend-check">' + (isLinked ? '✓' : '+') + '</span>';
      html += '<span class="card-type-badge ' + badgeClass + '">' + typeIcon + '</span>';
      html += '<span class="recommend-name">' + escapeHtml(name) + '</span>';
      html += '</div>';
      html += '<div class="recommend-reasons">';
      item.reasons.forEach(function(reason) {
        html += '<span class="recommend-reason-chip">' + escapeHtml(reason) + '</span>';
      });
      html += '</div>';
      html += '</div>';
    });

    html += '</div>';
    section.innerHTML = html;
  }

  function toggleRecommendLink(id, el) {
    var index = currentLinks.indexOf(id);
    if (index === -1) {
      currentLinks.push(id);
      el.classList.add('linked');
      el.querySelector('.recommend-check').textContent = '✓';
    } else {
      currentLinks.splice(index, 1);
      el.classList.remove('linked');
      el.querySelector('.recommend-check').textContent = '+';
    }
    // 同步更新下方手动关联选择器
    var linkOptions = document.querySelectorAll('.link-option');
    linkOptions.forEach(function(opt) {
      if (opt.getAttribute('data-link-id') === id) {
        var isSelected = currentLinks.indexOf(id) !== -1;
        opt.classList.toggle('selected', isSelected);
        opt.querySelector('.link-check').textContent = isSelected ? '✓' : '';
      }
    });
  }

  // ========== 保存庆祝 + 可分享卡片 ==========

  function showCelebration(record) {
    var name = record.name || record.title || '未命名';
    var typeIcon = record.type === 'plant' ? '🌿' : record.type === 'knowledge' ? '📖' : '🔍';
    var typeText = record.type === 'plant' ? '植物档案' : record.type === 'knowledge' ? '植物学知识' : '野外发现';

    // 生成彩纸碎片
    var confettiHtml = '';
    var confettiColors = ['#7ba862', '#d4a0a0', '#e0b85c', '#8bb4c7', '#d4a373', '#b8d4a0', '#f0c8c8'];
    for (var i = 0; i < 30; i++) {
      var color = confettiColors[i % confettiColors.length];
      var left = Math.random() * 100;
      var delay = Math.random() * 2;
      var size = 6 + Math.random() * 8;
      confettiHtml += '<div class="confetti-piece" style="left:' + left + '%;animation-delay:' + delay + 's;background:' + color + ';width:' + size + 'px;height:' + size + 'px;"></div>';
    }

    var html = '<div class="celebration-wrap">';
    html += '<div class="confetti-container">' + confettiHtml + '</div>';
    html += '<div class="celebration-content">';
    html += '<div class="celebration-icon">' + typeIcon + '</div>';
    html += '<div class="celebration-title">记录完成！</div>';
    html += '<div class="celebration-subtitle">' + escapeHtml(name) + '</div>';
    html += '</div>';

    // 卡片预览（Canvas 绘制）
    html += '<canvas id="share-card-canvas" width="540" height="720" style="display:none;"></canvas>';
    html += '<div class="share-card-preview" id="share-card-preview"></div>';

    // 按钮
    html += '<div style="display:flex; gap:10px; margin-top:16px;">';
    html += '<button class="btn btn-primary btn-block" onclick="Form.downloadCard()">📷 保存卡片</button>';
    html += '<button class="btn btn-block" onclick="App.closeModal()">完成</button>';
    html += '</div>';
    html += '</div>';

    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-title').textContent = '🎉 太棒了！';

    // 绘制分享卡片
    setTimeout(function() { drawShareCard(record); }, 100);
  }

  function drawShareCard(record) {
    // 如果有照片，先加载照片再绘制
    var firstPhotoId = (record.photoIds && record.photoIds.length > 0) ? record.photoIds[0] : null;
    if (firstPhotoId) {
      PhotoDB.get(firstPhotoId).then(function(photoData) {
        if (photoData) {
          var img = new Image();
          img.onload = function() { renderCard(record, img); };
          img.onerror = function() { renderCard(record, null); };
          img.src = photoData;
        } else {
          renderCard(record, null);
        }
      }).catch(function() { renderCard(record, null); });
    } else {
      renderCard(record, null);
    }
  }

  function renderCard(record, photoImg) {
    var canvas = document.getElementById('share-card-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = 540, H = 720;
    var hasPhoto = !!photoImg;
    var photoH = hasPhoto ? 260 : 0;

    // 背景
    ctx.fillStyle = '#fffef9';
    ctx.fillRect(0, 0, W, H);

    // 水彩风格边框装饰
    drawWatercolorBorder(ctx, W, H);

    // 类型信息
    var typeIcon = record.type === 'plant' ? '🌿' : record.type === 'knowledge' ? '📖' : '🔍';
    var typeText = record.type === 'plant' ? '植物档案' : record.type === 'knowledge' ? '植物学知识' : '野外发现';
    var typeColor = record.type === 'plant' ? '#7ba862' : record.type === 'knowledge' ? '#8bb4c7' : '#d4a373';

    var yPos = 30;

    // 照片区域（如果有）
    if (hasPhoto) {
      ctx.save();
      var imgPad = 30;
      var imgW = W - imgPad * 2;
      var imgH = photoH;
      roundRect(ctx, imgPad, yPos, imgW, imgH, 14);
      ctx.clip();
      // 居中裁剪
      var scale = Math.max(imgW / photoImg.width, imgH / photoImg.height);
      var sw = imgW / scale, sh = imgH / scale;
      var sx = (photoImg.width - sw) / 2, sy = (photoImg.height - sh) / 2;
      ctx.drawImage(photoImg, sx, sy, sw, sh, imgPad, yPos, imgW, imgH);
      ctx.restore();
      yPos += photoH + 18;
    } else {
      yPos += 20;
    }

    // 顶部类型标签
    ctx.fillStyle = typeColor;
    ctx.globalAlpha = 0.15;
    roundRect(ctx, W / 2 - 60, yPos, 120, 32, 16);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = typeColor;
    ctx.font = '14px "Smiley Sans", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(typeIcon + ' ' + typeText, W / 2, yPos + 22);
    yPos += 48;

    // 主标题（名称）
    var name = record.name || record.title || '未命名';
    ctx.fillStyle = '#33312d';
    ctx.font = 'bold 26px "Smiley Sans", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(name.length > 12 ? name.substring(0, 12) + '…' : name, W / 2, yPos);
    yPos += 8;

    // 学名（如果有）
    if (record.latinName) {
      yPos += 22;
      ctx.fillStyle = '#9e9890';
      ctx.font = 'italic 15px Georgia, "Times New Roman", serif';
      ctx.fillText(record.latinName.length > 30 ? record.latinName.substring(0, 30) + '…' : record.latinName, W / 2, yPos);
      yPos += 10;
    }

    // 分隔线
    yPos += 14;
    ctx.strokeStyle = typeColor;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(80, yPos);
    ctx.lineTo(W - 80, yPos);
    ctx.stroke();
    ctx.globalAlpha = 1;
    yPos += 22;

    // 信息字段
    ctx.textAlign = 'left';
    var fields = [];
    if (record.type === 'plant') {
      if (record.family) fields.push({ label: '科', value: record.family });
      if (record.genus) fields.push({ label: '属', value: record.genus });
      if (record.features) fields.push({ label: '特征', value: record.features });
      if (record.location) fields.push({ label: '地点', value: record.location });
    } else if (record.type === 'knowledge') {
      if (record.category) fields.push({ label: '分类', value: record.category });
      if (record.content) fields.push({ label: '内容', value: record.content });
    } else {
      if (record.relatedObjects) fields.push({ label: '涉及', value: record.relatedObjects });
      if (record.content) fields.push({ label: '内容', value: record.content });
    }

    fields.forEach(function(f) {
      if (yPos > H - 100) return;
      ctx.fillStyle = '#9e9890';
      ctx.font = '13px "Smiley Sans", "PingFang SC", sans-serif';
      ctx.fillText(f.label, 60, yPos);
      ctx.fillStyle = '#46433e';
      ctx.font = '15px "Smiley Sans", "PingFang SC", sans-serif';
      var val = f.value.length > 40 ? f.value.substring(0, 40) + '…' : f.value;
      var lines = val.split('\n');
      lines.forEach(function(line, li) {
        if (li > 2 || yPos > H - 100) return;
        var displayLine = line.length > 25 ? line.substring(0, 25) + '…' : line;
        ctx.fillText(displayLine, 60, yPos + 22 + li * 22);
      });
      yPos += 22 + Math.min(lines.length, 3) * 22 + 12;
    });

    // 标签
    if (record.tags && record.tags.length > 0 && yPos < H - 80) {
      yPos += 4;
      var tagX = 60;
      ctx.font = '12px "Smiley Sans", "PingFang SC", sans-serif';
      record.tags.slice(0, 5).forEach(function(tag) {
        var tw = ctx.measureText('#' + tag).width + 16;
        if (tagX + tw > W - 60) return;
        ctx.fillStyle = typeColor;
        ctx.globalAlpha = 0.12;
        roundRect(ctx, tagX, yPos - 12, tw, 22, 11);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = typeColor;
        ctx.fillText('#' + tag, tagX + 8, yPos + 3);
        tagX += tw + 8;
      });
    }

    // 日期
    if (record.date) {
      ctx.fillStyle = '#c0bab0';
      ctx.font = '13px "Smiley Sans", "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(record.date, W / 2, H - 58);
    }

    // 底部品牌
    ctx.fillStyle = '#c0bab0';
    ctx.font = '12px "Smiley Sans", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🌱 植物笔记', W / 2, H - 32);

    // 显示预览
    var preview = document.getElementById('share-card-preview');
    if (preview) {
      var previewImg = new Image();
      previewImg.src = canvas.toDataURL('image/png');
      previewImg.style.cssText = 'width:100%;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);';
      preview.appendChild(previewImg);
    }
  }

  function drawWatercolorBorder(ctx, W, H) {
    var colors = [
      'rgba(123,168,98,0.08)',    // 绿
      'rgba(212,160,160,0.08)',   // 粉
      'rgba(224,184,92,0.06)',    // 黄
      'rgba(139,180,199,0.06)',   // 蓝
      'rgba(184,212,160,0.1)',    // 浅绿
    ];

    // 四角水彩晕染
    var spots = [
      { x: 0, y: 0 },
      { x: W, y: 0 },
      { x: 0, y: H },
      { x: W, y: H },
      { x: W / 2, y: 0 },
      { x: W / 2, y: H },
    ];

    spots.forEach(function(spot, i) {
      var color = colors[i % colors.length];
      var r = 120 + Math.random() * 60;
      var grad = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    });

    // 边框细线
    ctx.strokeStyle = 'rgba(123,168,98,0.15)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, 16, 16, W - 32, H - 32, 20);
    ctx.stroke();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function downloadCard() {
    var canvas = document.getElementById('share-card-canvas');
    if (!canvas) return;
    var link = document.createElement('a');
    link.download = 'plant-card-' + new Date().toISOString().split('T')[0] + '.png';
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return {
    openNew: openNew,
    openEdit: openEdit,
    openFromPending: openFromPending,
    save: save,
    deleteRecord: deleteRecord,
    addPhotos: addPhotos,
    removePhoto: removePhoto,
    handleTagKey: handleTagKey,
    removeTag: removeTag,
    toggleLink: toggleLink,
    toggleRecommendLink: toggleRecommendLink,
    handleVoice: handleVoice,
    setType: setType,
    togglePasteArea: togglePasteArea,
    applyPaste: applyPaste,
    downloadCard: downloadCard
  };
})();
