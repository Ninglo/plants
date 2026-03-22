/* ========== 快速拍照 & 待处理队列 ========== */
var Inbox = (function() {

  var quickPhotos = []; // [{id, data}]

  function quickShoot() {
    var input = document.getElementById('global-quick-camera');
    if (input) {
      input.click();
      return;
    }
    openQuickPhoto();
  }

  // 打开快速拍照
  function openQuickPhoto() {
    quickPhotos = [];

    var html = '';
    html += '<div id="quick-action-bar" class="quick-action-bar">';
    html += '<button class="btn btn-primary btn-block" id="quick-save-btn" onclick="Inbox.saveQuick()" disabled>保存速记</button>';
    html += '</div>';

    html += '<div id="quick-photo-initial" style="text-align:center; margin-bottom:12px;">';
    html += '<label style="cursor:pointer; display:block;">';
    html += '<input type="file" accept="image/*" capture="environment" style="display:none" id="quick-photo-input" onchange="Inbox.onPhotoSelected(this.files)">';
    html += '<div class="photo-add quick-photo-primary" style="width:100%; height:172px; font-size:16px; flex-direction:column; gap:8px; display:flex; align-items:center; justify-content:center;">';
    html += '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>';
    html += '<span style="color:var(--gray-600)">拍照</span>';
    html += '</div>';
    html += '</label>';
    html += '</div>';
    html += '<div id="quick-photo-list" style="display:none; margin-bottom:12px;">';
    html += '<div id="quick-photo-thumbs" class="quick-photo-thumbs"></div>';
    html += '<label style="cursor:pointer; display:inline-block; margin-top:8px;">';
    html += '<input type="file" accept="image/*" multiple style="display:none" onchange="Inbox.onPhotoSelected(this.files)">';
    html += '<div class="quick-upload-link">从相册添加</div>';
    html += '</label>';
    html += '</div>';

    html += '<div id="quick-obs-section" style="display:none;">';
    html += renderObsSection();
    html += '</div>';

    document.getElementById('modal-body').innerHTML = html;
    App.openModal('速记速拍');
  }

  function handleDirectCapture(files) {
    if (!files || files.length === 0) return;
    openQuickPhoto();
    setTimeout(function() {
      onPhotoSelected(files);
    }, 60);
  }

  // 渲染速记字段
  function renderObsSection() {
    var html = '';
    var today = new Date();
    var dateStr = today.getFullYear() + '/' + (today.getMonth() + 1) + '/' + today.getDate();
    html += '<div class="quick-meta-row">';
    html += '<div class="quick-meta-pill">时间 ' + dateStr + '</div>';
    html += '<div class="quick-location-wrap">';
    html += '<input type="text" class="form-input" id="quick-location" placeholder="定位中..." style="flex:1; font-size:13px; padding:8px 12px;">';
    html += '<button type="button" class="btn-icon" onclick="Inbox.getLocation()" title="重新定位" style="flex-shrink:0; width:32px; height:32px;">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>';
    html += '</button>';
    html += '</div>';
    html += '</div>';

    html += '<div class="form-section quick-note-section" style="margin-top:12px;">';
    html += '<textarea id="quick-note" class="form-textarea form-textarea-large quick-note-input" placeholder="写下现场观察。" rows="8"></textarea>';
    html += '</div>';
    return html;
  }

  function onPhotoSelected(files) {
    if (!files || files.length === 0) return;
    var promises = [];
    for (var i = 0; i < files.length; i++) {
      promises.push(Storage.compressImage(files[i]));
    }
    Promise.all(promises).then(function(dataUrls) {
      dataUrls.forEach(function(dataUrl) {
        var photoId = 'photo_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
        quickPhotos.push({ id: photoId, data: dataUrl });

        // 添加缩略图
        var thumbs = document.getElementById('quick-photo-thumbs');
        if (thumbs) {
          var thumb = document.createElement('div');
          thumb.style.cssText = 'position:relative; width:88px; height:88px; border-radius:12px; overflow:hidden; flex-shrink:0;';
          thumb.innerHTML = '<img src="' + dataUrl + '" style="width:100%; height:100%; object-fit:cover;">' +
            '<button type="button" onclick="Inbox.removePhoto(' + (quickPhotos.length - 1) + ')" style="position:absolute; top:2px; right:2px; width:20px; height:20px; border-radius:50%; background:rgba(0,0,0,0.5); color:#fff; border:none; font-size:12px; line-height:20px; text-align:center; cursor:pointer;">✕</button>';
          thumbs.appendChild(thumb);
        }
      });

      // 隐藏大按钮，显示缩略图列表
      var initial = document.getElementById('quick-photo-initial');
      if (initial) initial.style.display = 'none';
      var list = document.getElementById('quick-photo-list');
      if (list) list.style.display = 'block';

      // 显示观察区 + 首次自动定位
      var obsSection = document.getElementById('quick-obs-section');
      if (obsSection && obsSection.style.display === 'none') {
        obsSection.style.display = 'block';
        getLocation(); // 首次显示时自动定位
      }
      // 更新按钮
      var btn = document.getElementById('quick-save-btn');
      btn.disabled = false;
      btn.textContent = '保存速记';
    });
  }

  // GPS 定位
  function getLocation() {
    var locInput = document.getElementById('quick-location');
    if (!locInput) return;
    if (!navigator.geolocation) {
      locInput.value = '';
      locInput.placeholder = '浏览器不支持定位';
      locInput.removeAttribute('readonly');
      return;
    }
    locInput.value = '';
    locInput.placeholder = '定位中...';
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        var lat = pos.coords.latitude.toFixed(5);
        var lng = pos.coords.longitude.toFixed(5);
        // 尝试反向地理编码（用免费的 Nominatim）
        fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng + '&zoom=16&accept-language=zh')
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data && data.display_name) {
              // 简化地址：取最后几级
              var parts = data.display_name.split(',').map(function(s) { return s.trim(); });
              // 取有意义的部分（去掉国家、邮编等）
              var short = parts.slice(0, 3).reverse().join(' ');
              locInput.value = short;
            } else {
              locInput.value = lat + ', ' + lng;
            }
            // 位置已获取
          })
          .catch(function() {
            locInput.value = lat + ', ' + lng;
            // 位置已获取
          });
      },
      function(err) {
        locInput.placeholder = '定位失败，可手动输入';
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  function removePhoto(index) {
    quickPhotos.splice(index, 1);
    // 重建缩略图
    var thumbs = document.getElementById('quick-photo-thumbs');
    if (thumbs) {
      thumbs.innerHTML = '';
      quickPhotos.forEach(function(p, i) {
        var thumb = document.createElement('div');
        thumb.style.cssText = 'position:relative; width:88px; height:88px; border-radius:12px; overflow:hidden; flex-shrink:0;';
        thumb.innerHTML = '<img src="' + p.data + '" style="width:100%; height:100%; object-fit:cover;">' +
          '<button type="button" onclick="Inbox.removePhoto(' + i + ')" style="position:absolute; top:2px; right:2px; width:20px; height:20px; border-radius:50%; background:rgba(0,0,0,0.5); color:#fff; border:none; font-size:12px; line-height:20px; text-align:center; cursor:pointer;">✕</button>';
        thumbs.appendChild(thumb);
      });
    }
    // 如果删光了，恢复大按钮
    if (quickPhotos.length === 0) {
      var initial = document.getElementById('quick-photo-initial');
      if (initial) initial.style.display = 'block';
      var list = document.getElementById('quick-photo-list');
      if (list) list.style.display = 'none';
      var btn = document.getElementById('quick-save-btn');
      btn.disabled = true;
      btn.textContent = '保存速记';
    }
  }

  function saveQuick() {
    var note = (document.getElementById('quick-note').value || '').trim();
    if (!note) { alert('请先写下观察内容'); return; }

    var obsData = {};

    var locInput = document.getElementById('quick-location');
    if (locInput && locInput.value.trim()) {
      obsData.location = locInput.value.trim();
    }

    obsData.detailedObservation = note;
    obsData.quickSummary = summarizeText(note);

    function doCreate(photoIds) {
      var record = {
        type: 'plant',
        status: 'observed',
        photoIds: photoIds,
        tags: [],
        links: [],
        date: new Date().toISOString().split('T')[0]
      };
      // 合并观察数据
      Object.keys(obsData).forEach(function(k) { record[k] = obsData[k]; });

      var created = Storage.create(record);
      quickPhotos = [];
      App.refreshView();

      // 有照片且已设置 API Key → 直接进入 AI 聊天
      if (created.photoIds && created.photoIds.length > 0 && Chat.hasKey()) {
        Chat.openChat(created.id);
      } else {
        Form.showCelebration(created);
      }
    }

    // 保存所有照片到 PhotoDB
    if (quickPhotos.length > 0) {
      var saves = quickPhotos.map(function(p) {
        return PhotoDB.save(p.id, p.data);
      });
      Promise.all(saves).then(function() {
        doCreate(quickPhotos.map(function(p) { return p.id; }));
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

  function summarizeText(text) {
    var clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    return clean.length > 24 ? clean.slice(0, 24) + '…' : clean;
  }

  return {
    quickShoot: quickShoot,
    openQuickPhoto: openQuickPhoto,
    handleDirectCapture: handleDirectCapture,
    onPhotoSelected: onPhotoSelected,
    removePhoto: removePhoto,
    getLocation: getLocation,
    saveQuick: saveQuick,
    renderPendingList: renderPendingList
  };
})();
