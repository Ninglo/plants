/* ========== 笔记本视图（原知识库） ========== */
var Knowledge = (function() {

  function render() {
    // 获取所有笔记类型：note（新）+ knowledge/ecology（旧兼容）
    var notes = Storage.getByType('note').filter(function(r) { return r.status !== 'pending'; });
    var knowledgeItems = Storage.getByType('knowledge').filter(function(r) { return r.status !== 'pending'; });
    var ecologyItems = Storage.getByType('ecology').filter(function(r) { return r.status !== 'pending'; });

    var allItems = notes.concat(knowledgeItems).concat(ecologyItems);
    allItems.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

    if (allItems.length === 0) {
      return '<div class="empty-state">' +
        '<div class="empty-state-icon">📝</div>' +
        '<div class="empty-state-text">还没有笔记<br>记录你的植物学心得和发现</div>' +
        '<button class="btn btn-primary" onclick="Knowledge.openNoteEditor()">写一篇笔记</button>' +
        '</div>';
    }

    var html = '';

    // 搜索
    html += '<div class="search-bar">';
    html += '<input class="search-input" placeholder="搜索笔记..." id="knowledge-search" oninput="Knowledge.filter()">';
    html += '</div>';

    // 笔记卡片列表
    html += '<div id="knowledge-list">';
    html += renderList(allItems);
    html += '</div>';

    // 新建按钮
    html += '<div style="margin-top:16px;">';
    html += '<button class="btn btn-primary btn-block" onclick="Knowledge.openNoteEditor()">+ 写笔记</button>';
    html += '</div>';

    return html;
  }

  function renderList(items) {
    var html = '';
    items.forEach(function(item) {
      var title = item.title || item.name || '未命名笔记';
      var content = item.content || item.observation || item.source || '';
      var excerpt = content.length > 80 ? content.substring(0, 80) + '...' : content;
      var dateStr = item.date || (item.createdAt ? item.createdAt.split('T')[0] : '');
      var hasPhotos = item.photoIds && item.photoIds.length > 0;

      // 关联植物名称
      var linkedNames = '';
      if (item.linkedPlantIds && item.linkedPlantIds.length > 0) {
        var names = item.linkedPlantIds.map(function(pid) {
          var p = Storage.getById(pid);
          return p ? p.name : null;
        }).filter(Boolean);
        if (names.length > 0) linkedNames = names.join('、');
      }
      // 旧类型兼容
      if (!linkedNames && item.relatedObjects) linkedNames = item.relatedObjects;

      html += '<div class="note-card" onclick="Knowledge.openNoteDetail(\'' + item.id + '\')">';
      html += '<div class="note-card-body">';
      html += '<div class="note-card-title">' + escapeHtml(title) + '</div>';
      if (linkedNames) {
        html += '<div class="note-card-linked">🌿 ' + escapeHtml(linkedNames) + '</div>';
      }
      if (excerpt) {
        html += '<div class="note-card-excerpt">' + escapeHtml(excerpt) + '</div>';
      }
      html += '<div class="note-card-meta">';
      html += '<span>' + dateStr + '</span>';
      if (hasPhotos) html += '<span>📷 ' + item.photoIds.length + '</span>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
    });
    return html;
  }

  function filter() {
    var search = (document.getElementById('knowledge-search') || {}).value || '';
    search = search.toLowerCase();

    var notes = Storage.getByType('note').filter(function(r) { return r.status !== 'pending'; });
    var knowledgeItems = Storage.getByType('knowledge').filter(function(r) { return r.status !== 'pending'; });
    var ecologyItems = Storage.getByType('ecology').filter(function(r) { return r.status !== 'pending'; });
    var items = notes.concat(knowledgeItems).concat(ecologyItems);

    if (search) {
      items = items.filter(function(r) {
        var text = (r.title || '') + (r.content || '') + (r.observation || '') +
          (r.source || '') + (r.tags || []).join(' ') + (r.relatedObjects || '');
        return text.toLowerCase().indexOf(search) !== -1;
      });
    }

    items.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

    var list = document.getElementById('knowledge-list');
    if (list) {
      list.innerHTML = items.length > 0 ? renderList(items) :
        '<div class="empty-state"><div class="empty-state-text">没有匹配的笔记</div></div>';
    }
  }

  // 笔记编辑器（创建/编辑）
  var notePhotos = []; // 临时照片 [{id, data}]

  function openNoteEditor(noteId, preLinkedPlantId) {
    var note = noteId ? Storage.getById(noteId) : null;
    notePhotos = [];

    var html = '<div class="note-editor">';

    // 标题
    html += '<input type="text" class="note-title-input" id="note-title" placeholder="笔记标题..." value="' + escapeHtml((note && note.title) || '') + '">';

    // 内容
    html += '<textarea class="note-content-input" id="note-content" placeholder="写下你的观察、想法、发现..." rows="8">' + escapeHtml((note && (note.content || note.observation || '')) || '') + '</textarea>';

    // 照片区
    html += '<div class="note-photos-section">';
    html += '<label class="form-label">照片（选填）</label>';
    html += '<div id="note-photo-thumbs" style="display:flex; gap:10px; flex-wrap:wrap;"></div>';
    html += '<label style="cursor:pointer; display:inline-block; margin-top:8px;">';
    html += '<input type="file" accept="image/*" multiple style="display:none" onchange="Knowledge.onPhotosSelected(this.files)">';
    html += '<div class="photo-add" style="width:80px; height:80px; font-size:24px; display:flex; align-items:center; justify-content:center; border-radius:12px;">＋</div>';
    html += '</label>';
    html += '</div>';

    // 关联植物（选填）
    var plants = Storage.getByType('plant').filter(function(r) { return r.status !== 'pending'; });
    if (plants.length > 0) {
      html += '<div class="form-group" style="margin-top:14px;">';
      html += '<label class="form-label">关联植物（选填）</label>';
      html += '<select class="form-input" id="note-linked-plant" style="font-size:14px;">';
      html += '<option value="">不关联</option>';
      plants.forEach(function(p) {
        var selected = '';
        if (note && note.linkedPlantIds && note.linkedPlantIds.indexOf(p.id) !== -1) {
          selected = ' selected';
        } else if (!note && preLinkedPlantId && p.id === preLinkedPlantId) {
          selected = ' selected';
        }
        html += '<option value="' + p.id + '"' + selected + '>' + escapeHtml(p.name || '未命名') + '</option>';
      });
      html += '</select>';
      html += '</div>';
    }

    // 保存按钮
    html += '<button class="btn btn-primary btn-block" style="margin-top:20px;" onclick="Knowledge.saveNote(\'' + (noteId || '') + '\')">保存笔记</button>';

    html += '</div>';

    document.getElementById('modal-title').textContent = noteId ? '编辑笔记' : '写笔记';
    document.getElementById('modal-body').innerHTML = html;

    var overlay = document.getElementById('modal-overlay');
    if (!overlay.classList.contains('show')) {
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    }

    // 如果编辑已有笔记，加载已有照片
    if (note && note.photoIds && note.photoIds.length > 0) {
      PhotoDB.getMultiple(note.photoIds).then(function(results) {
        results.forEach(function(r) {
          if (r && r.data) {
            notePhotos.push({ id: r.id, data: r.data });
            addPhotoThumb(r.data, notePhotos.length - 1);
          }
        });
      });
    }
  }

  function onPhotosSelected(files) {
    for (var i = 0; i < files.length; i++) {
      (function(file) {
        var reader = new FileReader();
        reader.onload = function(e) {
          var id = 'photo_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
          notePhotos.push({ id: id, data: e.target.result });
          addPhotoThumb(e.target.result, notePhotos.length - 1);
        };
        reader.readAsDataURL(file);
      })(files[i]);
    }
  }

  function addPhotoThumb(dataUrl, index) {
    var thumbs = document.getElementById('note-photo-thumbs');
    if (!thumbs) return;
    var thumb = document.createElement('div');
    thumb.style.cssText = 'position:relative; width:80px; height:80px; border-radius:12px; overflow:hidden; flex-shrink:0;';
    thumb.innerHTML = '<img src="' + dataUrl + '" style="width:100%; height:100%; object-fit:cover;">' +
      '<button type="button" onclick="Knowledge.removePhoto(' + index + ')" style="position:absolute; top:2px; right:2px; width:20px; height:20px; border-radius:50%; background:rgba(0,0,0,0.5); color:#fff; border:none; font-size:12px; cursor:pointer;">✕</button>';
    thumbs.appendChild(thumb);
  }

  function removePhoto(index) {
    notePhotos.splice(index, 1);
    refreshPhotoThumbs();
  }

  function refreshPhotoThumbs() {
    var thumbs = document.getElementById('note-photo-thumbs');
    if (!thumbs) return;
    thumbs.innerHTML = '';
    notePhotos.forEach(function(p, i) {
      addPhotoThumb(p.data, i);
    });
  }

  function saveNote(existingId) {
    var title = (document.getElementById('note-title').value || '').trim();
    var content = (document.getElementById('note-content').value || '').trim();

    if (!title && !content) {
      alert('请至少填写标题或内容');
      return;
    }

    function doSave(photoIds) {
      if (existingId) {
        // 更新已有笔记
        var updates = {
          title: title || '未命名笔记',
          content: content,
          photoIds: photoIds
        };
        var linkedPlant = document.getElementById('note-linked-plant');
        if (linkedPlant && linkedPlant.value) {
          updates.linkedPlantIds = [linkedPlant.value];
        } else {
          updates.linkedPlantIds = [];
        }
        Storage.update(existingId, updates);
      } else {
        // 创建新笔记
        var record = {
          type: 'note',
          status: 'complete',
          title: title || '未命名笔记',
          content: content,
          photoIds: photoIds,
          linkedPlantIds: [],
          tags: [],
          links: [],
          date: new Date().toISOString().split('T')[0]
        };
        var linkedPlant = document.getElementById('note-linked-plant');
        if (linkedPlant && linkedPlant.value) {
          record.linkedPlantIds = [linkedPlant.value];
        }
        Storage.create(record);
      }

      // 关闭 modal，刷新视图
      var overlay = document.getElementById('modal-overlay');
      if (overlay) overlay.classList.remove('show');
      document.body.style.overflow = '';
      App.refreshView();
    }

    // 保存照片到 PhotoDB
    if (notePhotos.length > 0) {
      var saves = notePhotos.map(function(p) {
        return PhotoDB.save(p.id, p.data);
      });
      Promise.all(saves).then(function() {
        doSave(notePhotos.map(function(p) { return p.id; }));
      });
    } else {
      doSave([]);
    }
  }

  // 笔记详情
  function openNoteDetail(noteId) {
    var note = Storage.getById(noteId);
    if (!note) return;

    var html = '<div class="note-detail">';

    // 标题
    html += '<h2 style="font-size:20px; margin:0 0 12px;">' + escapeHtml(note.title || '未命名笔记') + '</h2>';

    // 元信息
    html += '<div style="font-size:13px; color:var(--gray-500); margin-bottom:16px;">';
    html += (note.date || '') ;
    if (note.linkedPlantIds && note.linkedPlantIds.length > 0) {
      var names = note.linkedPlantIds.map(function(pid) {
        var p = Storage.getById(pid);
        return p ? p.name : null;
      }).filter(Boolean);
      if (names.length > 0) html += ' · 🌿 ' + escapeHtml(names.join('、'));
    }
    if (note.relatedObjects) html += ' · 🌿 ' + escapeHtml(note.relatedObjects);
    html += '</div>';

    // 照片
    if (note.photoIds && note.photoIds.length > 0) {
      html += '<div id="note-detail-photos" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;"></div>';
    }

    // 内容
    var content = note.content || note.observation || note.source || '';
    if (content) {
      // 保留换行
      html += '<div style="font-size:15px; line-height:1.7; white-space:pre-wrap;">' + escapeHtml(content) + '</div>';
    }

    // 编辑按钮
    html += '<div style="margin-top:20px; display:flex; gap:10px;">';
    html += '<button class="btn btn-primary btn-block" onclick="Knowledge.openNoteEditor(\'' + noteId + '\')">编辑</button>';
    html += '<button class="btn btn-secondary" onclick="Knowledge.deleteNote(\'' + noteId + '\')" style="color:var(--red);">删除</button>';
    html += '</div>';

    html += '</div>';

    document.getElementById('modal-title').textContent = '笔记';
    document.getElementById('modal-body').innerHTML = html;

    var overlay = document.getElementById('modal-overlay');
    if (!overlay.classList.contains('show')) {
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    }

    // 加载照片
    if (note.photoIds && note.photoIds.length > 0) {
      PhotoDB.getMultiple(note.photoIds).then(function(results) {
        var container = document.getElementById('note-detail-photos');
        if (!container) return;
        results.forEach(function(r) {
          if (r && r.data) {
            var img = document.createElement('div');
            img.style.cssText = 'width:120px; height:120px; border-radius:12px; overflow:hidden; flex-shrink:0;';
            img.innerHTML = '<img src="' + r.data + '" style="width:100%; height:100%; object-fit:cover;">';
            container.appendChild(img);
          }
        });
      });
    }
  }

  function deleteNote(noteId) {
    if (!confirm('确定删除这篇笔记吗？')) return;
    Storage.remove(noteId);
    var overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';
    App.refreshView();
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return {
    render: render,
    filter: filter,
    openNoteEditor: openNoteEditor,
    openNoteDetail: openNoteDetail,
    saveNote: saveNote,
    deleteNote: deleteNote,
    onPhotosSelected: onPhotosSelected,
    removePhoto: removePhoto
  };
})();
