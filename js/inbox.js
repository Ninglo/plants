/* ========== 快速拍照 & 待处理队列 ========== */
var Inbox = (function() {

  var quickPhotoData = null;
  var quickObsParts = []; // 选中的观察部位

  // 打开快速拍照
  function openQuickPhoto() {
    quickPhotoData = null;
    quickObsParts = [];

    var html = '';
    // 拍照区
    html += '<div style="text-align:center; margin-bottom:16px;">';
    html += '<label style="cursor:pointer;">';
    html += '<input type="file" accept="image/*" capture="environment" style="display:none" id="quick-photo-input" onchange="Inbox.onPhotoSelected(this.files)">';
    html += '<div class="photo-add" style="width:100%; height:200px; font-size:16px; flex-direction:column; gap:8px; display:flex; align-items:center; justify-content:center;">';
    html += '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>';
    html += '<span style="color:var(--gray-500)">点击拍照或选择图片</span>';
    html += '</div>';
    html += '</label>';
    html += '</div>';
    html += '<img id="quick-photo-preview" class="quick-photo-preview" style="display:none">';

    // 名称
    html += '<div class="form-group">';
    html += '<label class="form-label">叫什么 *</label>';
    html += '<div class="input-with-voice">';
    html += '<input type="text" class="form-input" id="quick-name" placeholder="不确定也可以写暂定名">';
    html += '<button type="button" class="btn-voice" onclick="Form.handleVoice(this)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></button>';
    html += '</div>';
    html += '</div>';

    // 观察区（拍照后才显示）
    html += '<div id="quick-obs-section" style="display:none;">';
    html += renderObsSection();
    html += '</div>';

    // 保存按钮
    html += '<button class="btn btn-primary btn-block" id="quick-save-btn" onclick="Inbox.saveQuick()" disabled>拍照后开始观察</button>';

    document.getElementById('modal-body').innerHTML = html;
    App.openModal('快速记录');
  }

  // 渲染观察字段
  function renderObsSection() {
    var html = '';
    html += '<div class="form-section" style="margin-top:14px;">';
    html += '<div class="form-section-header"><span class="form-step-badge">观察</span> <b>我的观察</b></div>';
    html += '<div style="font-size:13px; color:var(--gray-400); margin-bottom:12px;">不需要专业知识，选一选就好</div>';

    // 基础字段（growthForm）
    Form.OBS_BASE.forEach(function(field) {
      html += renderChipField(field);
    });

    // 部位选择器
    html += '<div class="form-group">';
    html += '<label class="form-label">今天观察到了什么？</label>';
    html += '<div class="obs-part-group">';
    html += '<button type="button" class="obs-part-chip" data-part="leaf" onclick="Inbox.togglePart(\'leaf\')">🍃 叶子</button>';
    html += '<button type="button" class="obs-part-chip" data-part="flower" onclick="Inbox.togglePart(\'flower\')">🌸 花</button>';
    html += '<button type="button" class="obs-part-chip" data-part="fruit" onclick="Inbox.togglePart(\'fruit\')">🍎 果实</button>';
    html += '</div></div>';

    // 条件字段组
    html += '<div id="quick-obs-leaf" style="display:none;" class="obs-field-group">';
    html += '<div class="obs-group-header">🍃 叶片观察</div>';
    Form.OBS_LEAF.forEach(function(f) { html += renderChipField(f); });
    html += '</div>';

    html += '<div id="quick-obs-flower" style="display:none;" class="obs-field-group">';
    html += '<div class="obs-group-header">🌸 花朵观察</div>';
    Form.OBS_FLOWER.forEach(function(f) { html += renderChipField(f); });
    html += '</div>';

    html += '<div id="quick-obs-fruit" style="display:none;" class="obs-field-group">';
    html += '<div class="obs-group-header">🍎 果实观察</div>';
    Form.OBS_FRUIT.forEach(function(f) { html += renderChipField(f); });
    html += '</div>';

    html += '</div>';
    return html;
  }

  // 渲染单个 chip 选择字段
  function renderChipField(field) {
    var html = '<div class="form-group">';
    html += '<label class="form-label">' + field.label + '</label>';
    if (field.desc) {
      html += '<div style="font-size:12px; color:var(--gray-400); margin-bottom:6px;">' + field.desc + '</div>';
    }
    html += '<div class="chip-group" data-field="' + field.id + '">';
    var options = field.options || [];
    options.forEach(function(opt) {
      var val = typeof opt === 'string' ? opt : opt.value;
      var desc = typeof opt === 'string' ? '' : (opt.desc || '');
      html += '<button type="button" class="obs-chip" data-value="' + val + '" onclick="Form.selectChip(this, \'' + field.id + '\')">';
      html += val;
      if (desc) html += '<span class="obs-chip-desc">' + desc + '</span>';
      html += '</button>';
    });
    html += '</div></div>';
    return html;
  }

  // 切换观察部位
  function togglePart(part) {
    var idx = quickObsParts.indexOf(part);
    if (idx >= 0) {
      quickObsParts.splice(idx, 1);
    } else {
      quickObsParts.push(part);
    }
    // 更新按钮样式
    var chips = document.querySelectorAll('.obs-part-chip');
    for (var i = 0; i < chips.length; i++) {
      var p = chips[i].getAttribute('data-part');
      chips[i].classList.toggle('active', quickObsParts.indexOf(p) >= 0);
    }
    // 显示/隐藏对应字段组
    var map = { leaf: 'quick-obs-leaf', flower: 'quick-obs-flower', fruit: 'quick-obs-fruit' };
    Object.keys(map).forEach(function(key) {
      var el = document.getElementById(map[key]);
      if (el) el.style.display = quickObsParts.indexOf(key) >= 0 ? 'block' : 'none';
    });
  }

  function onPhotoSelected(files) {
    if (!files || !files[0]) return;
    Storage.compressImage(files[0]).then(function(dataUrl) {
      quickPhotoData = dataUrl;
      var preview = document.getElementById('quick-photo-preview');
      preview.src = dataUrl;
      preview.style.display = 'block';
      // 显示观察区
      var obsSection = document.getElementById('quick-obs-section');
      if (obsSection) obsSection.style.display = 'block';
      // 更新按钮
      var btn = document.getElementById('quick-save-btn');
      btn.disabled = false;
      btn.textContent = '保存观察';
    });
  }

  function saveQuick() {
    var name = (document.getElementById('quick-name').value || '').trim();
    if (!name) { alert('请输入植物名称'); return; }

    // 收集观察字段
    var obsData = {};
    obsData.observedParts = quickObsParts.slice();
    Form.getAllObsFields().forEach(function(field) {
      obsData[field.id] = Form.getChipVal(field.id);
    });

    function doCreate(photoIds) {
      var record = {
        type: 'plant',
        status: 'observed',
        name: name,
        photoIds: photoIds,
        tags: [],
        links: [],
        date: new Date().toISOString().split('T')[0]
      };
      // 合并观察数据
      Object.keys(obsData).forEach(function(k) { record[k] = obsData[k]; });

      var created = Storage.create(record);
      quickPhotoData = null;
      quickObsParts = [];
      App.refreshView();

      // 有照片且已设置 API Key → 直接进入 AI 聊天
      if (created.photoIds && created.photoIds.length > 0 && Chat.hasKey()) {
        Chat.openChat(created.id);
      } else {
        Form.showCelebration(created);
      }
    }

    if (quickPhotoData) {
      var photoId = 'photo_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
      PhotoDB.save(photoId, quickPhotoData).then(function() {
        doCreate([photoId]);
      });
    } else {
      doCreate([]);
    }
  }

  // 渲染待处理列表
  function renderPendingList() {
    var pending = Storage.getPending();
    if (pending.length === 0) return '';

    var html = '<div class="pending-list">';
    html += '<div class="section-title">待处理 <span class="count">' + pending.length + ' 条</span></div>';

    // 按创建时间倒序
    pending.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

    pending.forEach(function(item) {
      var thumb = item.photoIds && item.photoIds[0]
        ? '<img class="pending-thumb" data-photo-id="' + item.photoIds[0] + '" src="' + Storage.BLANK_IMG + '">'
        : '<div class="pending-thumb" style="display:flex;align-items:center;justify-content:center;font-size:24px;">📷</div>';

      html += '<div class="pending-item" onclick="Form.openFromPending(\'' + item.id + '\')">';
      html += thumb;
      html += '<div class="pending-info">';
      html += '<div class="pending-note">' + (item.name || item.note || '待整理') + '</div>';
      html += '<div class="pending-date">' + formatDate(item.createdAt) + '</div>';
      html += '</div>';
      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  function formatDate(isoString) {
    var d = new Date(isoString);
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }

  return {
    openQuickPhoto: openQuickPhoto,
    onPhotoSelected: onPhotoSelected,
    saveQuick: saveQuick,
    togglePart: togglePart,
    renderPendingList: renderPendingList
  };
})();
