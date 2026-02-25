/* ========== 快速拍照 & 待处理队列 ========== */
var Inbox = (function() {

  // 打开快速拍照
  function openQuickPhoto() {
    var html = '';
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
    html += '<div class="form-group">';
    html += '<label class="form-label">简单备注</label>';
    html += '<div class="input-with-voice">';
    html += '<input type="text" class="form-input" id="quick-note" placeholder="随便写两个字提醒自己...">';
    html += '<button type="button" class="btn-voice" onclick="Form.handleVoice(this)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></button>';
    html += '</div>';
    html += '</div>';
    html += '<button class="btn btn-primary btn-block" id="quick-save-btn" onclick="Inbox.saveQuick()" disabled>保存到待处理</button>';

    document.getElementById('modal-body').innerHTML = html;
    App.openModal('快速记录');
  }

  var quickPhotoData = null;

  function onPhotoSelected(files) {
    if (!files || !files[0]) return;
    Storage.compressImage(files[0]).then(function(dataUrl) {
      quickPhotoData = dataUrl;
      var preview = document.getElementById('quick-photo-preview');
      preview.src = dataUrl;
      preview.style.display = 'block';
      document.getElementById('quick-save-btn').disabled = false;
    });
  }

  function saveQuick() {
    var note = document.getElementById('quick-note').value.trim();

    function doCreate(photoIds) {
      var record = {
        type: 'plant',
        status: 'pending',
        name: note || '待整理',
        photoIds: photoIds,
        tags: [],
        links: [],
        date: new Date().toISOString().split('T')[0],
        note: note
      };
      Storage.create(record);
      quickPhotoData = null;
      App.closeModal();
      App.refreshView();
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
    renderPendingList: renderPendingList
  };
})();
