/* ========== 笔记本视图（块编辑器 + 图片编辑 + 水彩主题 + 庆祝分享） ========== */
var Knowledge = (function() {

  // ===== 主题定义 =====
  var THEMES = [
    { id: 'green',  label: '浅草绿', accent: '#7ba862', confetti: ['#b8d4a0','#c8dec4','#d4e8c0','#e0f0d4','#a8c890'] },
    { id: 'pink',   label: '樱花粉', accent: '#d4a0a0', confetti: ['#f0c8c8','#e8b8c0','#f4dcd8','#fce8e4','#d4a0a0'] },
    { id: 'blue',   label: '天空蓝', accent: '#8bb4c7', confetti: ['#c8d8ec','#b0cce0','#d0e4f0','#e0ecf4','#8bb4c7'] },
    { id: 'orange', label: '暖阳橙', accent: '#d4a373', confetti: ['#f0deb8','#e8ccb0','#f4e4cc','#fce8d0','#d4a373'] },
    { id: 'purple', label: '星光紫', accent: '#b8a9d4', confetti: ['#d8ccec','#c4b8d8','#e4dcf0','#ecd8e8','#b8a9d4'] },
    { id: 'wood',   label: '原木色', accent: '#9e9890', confetti: ['#ddd8cc','#d0cab8','#e0dcd0','#e8e4d8','#c0bab0'] }
  ];

  function getTheme(id) {
    for (var i = 0; i < THEMES.length; i++) { if (THEMES[i].id === id) return THEMES[i]; }
    return THEMES[0];
  }

  // ===== 工具函数 =====
  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function normalizeBlocks(note) {
    if (note.blocks && note.blocks.length > 0) return note.blocks;
    var blocks = [];
    var text = note.content || note.observation || note.source || '';
    if (text) blocks.push({ type: 'text', value: text });
    if (note.photoIds && note.photoIds.length > 0) {
      note.photoIds.forEach(function(pid) { blocks.push({ type: 'image', photoId: pid, size: 'full' }); });
    }
    if (blocks.length === 0 || blocks[0].type !== 'text') {
      blocks.unshift({ type: 'text', value: '' });
    }
    return blocks;
  }

  function blocksToPlainText(blocks) {
    return blocks.filter(function(b) { return b.type === 'text' && b.value; })
      .map(function(b) { return b.value; }).join('\n\n');
  }

  // ===== 编辑器状态 =====
  var editorState = {
    blocks: [],
    photoCache: {},
    lastFocusedIndex: 0,
    editingNoteId: null,
    theme: 'green'
  };

  // ===== 图片编辑器状态 =====
  var imgEditor = {
    blockIndex: -1,
    photoId: null,
    originalData: null,
    canvas: null, ctx: null,
    imgEl: null,
    tool: 'pen',       // 'pen' | 'highlight' | 'crop'
    strokes: [],       // [{tool, points:[{x,y}]}]
    currentStroke: null,
    cropBox: null,      // {x,y,w,h} in image coords
    scale: 1, offsetX: 0, offsetY: 0
  };

  // ===== 列表渲染 =====
  function render() {
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

    var html = '<div class="search-bar">' +
      '<input class="search-input" placeholder="搜索笔记..." id="knowledge-search" oninput="Knowledge.filter()">' +
      '</div>';
    html += '<div id="knowledge-list">' + renderList(allItems) + '</div>';
    html += '<div style="margin-top:16px;">' +
      '<button class="btn btn-primary btn-block" onclick="Knowledge.openNoteEditor()">+ 写笔记</button></div>';
    return html;
  }

  function renderList(items) {
    var html = '';
    items.forEach(function(item) {
      var title = item.title || item.name || '未命名笔记';
      var content = item.content || item.observation || item.source || '';
      var excerpt = content.length > 80 ? content.substring(0, 80) + '...' : content;
      if (!excerpt && item.blocks && item.blocks.length > 0) {
        var imgCount = item.blocks.filter(function(b) { return b.type === 'image'; }).length;
        if (imgCount > 0) excerpt = '📷 ' + imgCount + ' 张图片';
      }
      var dateStr = item.date || (item.createdAt ? item.createdAt.split('T')[0] : '');
      var hasPhotos = (item.photoIds && item.photoIds.length > 0) ||
        (item.blocks && item.blocks.some(function(b) { return b.type === 'image'; }));
      var theme = getTheme(item.theme || 'green');

      var linkedNames = '';
      if (item.linkedPlantIds && item.linkedPlantIds.length > 0) {
        var names = item.linkedPlantIds.map(function(pid) {
          var p = Storage.getById(pid); return p ? p.name : null;
        }).filter(Boolean);
        if (names.length > 0) linkedNames = names.join('、');
      }
      if (!linkedNames && item.relatedObjects) linkedNames = item.relatedObjects;

      html += '<div class="note-card note-card-with-theme" onclick="Knowledge.openNoteDetail(\'' + item.id + '\')">';
      html += '<div class="note-card-accent" style="background:' + theme.accent + ';"></div>';
      html += '<div class="note-card-body">';
      html += '<div class="note-card-title">' + escapeHtml(title) + '</div>';
      if (linkedNames) html += '<div class="note-card-linked">🌿 ' + escapeHtml(linkedNames) + '</div>';
      if (excerpt) html += '<div class="note-card-excerpt">' + escapeHtml(excerpt) + '</div>';
      html += '<div class="note-card-meta"><span>' + dateStr + '</span>';
      if (hasPhotos) {
        var pCount = item.photoIds ? item.photoIds.length :
          (item.blocks ? item.blocks.filter(function(b){return b.type==='image';}).length : 0);
        if (pCount > 0) html += '<span>📷 ' + pCount + '</span>';
      }
      html += '</div></div></div>';
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

  // ===== 笔记编辑器 =====
  function openNoteEditor(noteId, preLinkedPlantId) {
    var note = noteId ? Storage.getById(noteId) : null;

    editorState.editingNoteId = noteId || null;
    editorState.theme = (note && note.theme) || 'green';
    editorState.blocks = note ? normalizeBlocks(note).map(function(b) {
      return { type: b.type, value: b.value, photoId: b.photoId, size: b.size || 'full' };
    }) : [{ type: 'text', value: '' }];
    editorState.photoCache = {};
    editorState.lastFocusedIndex = 0;

    var html = '<div class="note-editor">';

    // 标题
    html += '<input type="text" class="note-title-input" id="note-title" placeholder="笔记标题..." value="' +
      escapeHtml((note && note.title) || '') + '">';

    // 主题选择器
    html += '<div class="theme-picker" id="theme-picker">';
    THEMES.forEach(function(t) {
      html += '<div class="theme-dot theme-dot-' + t.id +
        (t.id === editorState.theme ? ' active' : '') +
        '" data-theme="' + t.id + '" onclick="Knowledge.selectTheme(\'' + t.id + '\')" title="' + t.label + '"></div>';
    });
    html += '</div>';

    // 块编辑器容器
    html += '<div class="block-editor theme-' + editorState.theme + '" id="block-editor"></div>';

    // 底部工具栏
    html += '<div class="block-toolbar">';
    html += '<label class="block-toolbar-btn"><input type="file" accept="image/*" multiple style="display:none" ' +
      'onchange="Knowledge.onToolbarPhotos(this.files)">📷 插入图片</label>';
    html += '</div>';

    // 关联植物
    var plants = Storage.getByType('plant').filter(function(r) { return r.status !== 'pending'; });
    if (plants.length > 0) {
      html += '<div class="form-group" style="margin-top:14px;">';
      html += '<label class="form-label">关联植物（选填）</label>';
      html += '<select class="form-input" id="note-linked-plant" style="font-size:14px;">';
      html += '<option value="">不关联</option>';
      plants.forEach(function(p) {
        var selected = '';
        if (note && note.linkedPlantIds && note.linkedPlantIds.indexOf(p.id) !== -1) selected = ' selected';
        else if (!note && preLinkedPlantId && p.id === preLinkedPlantId) selected = ' selected';
        html += '<option value="' + p.id + '"' + selected + '>' + escapeHtml(p.name || '未命名') + '</option>';
      });
      html += '</select></div>';
    }

    // 保存按钮
    html += '<button class="btn btn-primary btn-block" style="margin-top:20px;" ' +
      'onclick="Knowledge.saveNote(\'' + (noteId || '') + '\')">保存笔记</button>';
    html += '</div>';

    document.getElementById('modal-title').textContent = noteId ? '编辑笔记' : '写笔记';
    document.getElementById('modal-body').innerHTML = html;

    var overlay = document.getElementById('modal-overlay');
    if (!overlay.classList.contains('show')) {
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    }

    // 加载已有照片到 cache
    if (note) {
      var photoIds = editorState.blocks
        .filter(function(b) { return b.type === 'image' && b.photoId; })
        .map(function(b) { return b.photoId; });
      if (photoIds.length > 0) {
        PhotoDB.getMultiple(photoIds).then(function(results) {
          results.forEach(function(r) {
            if (r && r.data) editorState.photoCache[r.id] = r.data;
          });
          renderBlockEditor();
        });
      } else {
        renderBlockEditor();
      }
    } else {
      renderBlockEditor();
    }
  }

  // ===== 块编辑器渲染 =====
  function renderBlockEditor() {
    var container = document.getElementById('block-editor');
    if (!container) return;

    // 保存当前焦点和光标位置
    var activeEl = document.activeElement;
    var cursorPos = -1;
    var focusIndex = -1;
    if (activeEl && activeEl.classList && activeEl.classList.contains('block-textarea')) {
      focusIndex = parseInt(activeEl.closest('.block').getAttribute('data-block-index'));
      cursorPos = activeEl.selectionStart;
    }

    var html = '';
    editorState.blocks.forEach(function(block, index) {
      if (block.type === 'text') {
        html += '<div class="block block-text" data-block-index="' + index + '">';
        html += '<textarea class="block-textarea" ' +
          'placeholder="' + (index === 0 ? '写下你的观察、想法、发现...' : '继续写...') + '" ' +
          'oninput="Knowledge.onBlockInput(this,' + index + ')" ' +
          'onfocus="Knowledge.onBlockFocus(' + index + ')" ' +
          'onkeydown="Knowledge.onBlockKeydown(event,' + index + ')" ' +
          'rows="1">' + escapeHtml(block.value) + '</textarea>';
        html += '</div>';
      } else if (block.type === 'image') {
        var src = editorState.photoCache[block.photoId] || '';
        var sizeClass = 'size-' + (block.size || 'full');
        html += '<div class="block block-image" data-block-index="' + index + '">';
        html += '<div class="block-image-wrapper ' + sizeClass + '" onclick="Knowledge.toggleImageActions(' + index + ')">';
        if (src) {
          html += '<img src="' + src + '" class="block-image-img">';
        } else {
          html += '<div style="height:120px;background:var(--gray-100);display:flex;align-items:center;justify-content:center;border-radius:var(--radius-sm);color:var(--gray-400);">加载中...</div>';
        }
        html += '<div class="block-image-actions" id="img-actions-' + index + '">';
        html += '<div class="block-image-size-btns">';
        ['small','medium','full'].forEach(function(s) {
          var label = s === 'small' ? '小' : s === 'medium' ? '中' : '大';
          html += '<button class="block-image-size-btn' + (block.size === s || (!block.size && s === 'full') ? ' active' : '') +
            '" onclick="event.stopPropagation();Knowledge.setImageSize(' + index + ',\'' + s + '\')">' + label + '</button>';
        });
        html += '</div><div class="block-image-tool-btns">';
        html += '<button class="block-image-tool-btn" onclick="event.stopPropagation();Knowledge.openImageEditor(' + index + ')" title="编辑">✏️</button>';
        html += '<button class="block-image-tool-btn" onclick="event.stopPropagation();Knowledge.removeBlock(' + index + ')" title="删除">✕</button>';
        html += '</div></div></div></div>';
      }

      // 插入点
      html += '<div class="block-inserter" data-insert-index="' + (index + 1) + '">';
      html += '<label class="block-inserter-btn">';
      html += '<input type="file" accept="image/*" multiple style="display:none" ' +
        'onchange="Knowledge.onInserterPhotos(this.files,' + (index + 1) + ')">';
      html += '<span class="block-inserter-line"></span>';
      html += '<span class="block-inserter-icon">＋</span>';
      html += '<span class="block-inserter-line"></span>';
      html += '</label></div>';
    });

    container.innerHTML = html;

    // Auto-resize textareas
    var textareas = container.querySelectorAll('.block-textarea');
    for (var i = 0; i < textareas.length; i++) { autoResize(textareas[i]); }

    // Restore focus
    if (focusIndex >= 0 && focusIndex < editorState.blocks.length && editorState.blocks[focusIndex].type === 'text') {
      var ta = container.querySelector('.block[data-block-index="' + focusIndex + '"] .block-textarea');
      if (ta) {
        ta.focus();
        if (cursorPos >= 0 && cursorPos <= ta.value.length) {
          ta.selectionStart = ta.selectionEnd = cursorPos;
        }
      }
    }

    // Load unloaded photos
    var imgs = container.querySelectorAll('.block-image-img[src=""]');
    for (var j = 0; j < imgs.length; j++) {
      // These will be loaded when photoCache is populated
    }
  }

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.max(28, el.scrollHeight) + 'px';
  }

  // ===== 块交互 =====
  function onBlockInput(el, index) {
    editorState.blocks[index].value = el.value;
    autoResize(el);
  }

  function onBlockFocus(index) {
    editorState.lastFocusedIndex = index;
  }

  function onBlockKeydown(event, index) {
    if (event.key === 'Backspace') {
      var el = event.target;
      if (el.value === '' && editorState.blocks.length > 1) {
        event.preventDefault();
        editorState.blocks.splice(index, 1);
        // Focus previous text block
        var prevIndex = -1;
        for (var i = index - 1; i >= 0; i--) {
          if (editorState.blocks[i].type === 'text') { prevIndex = i; break; }
        }
        renderBlockEditor();
        if (prevIndex >= 0) {
          var container = document.getElementById('block-editor');
          var ta = container && container.querySelector('.block[data-block-index="' + prevIndex + '"] .block-textarea');
          if (ta) {
            ta.focus();
            ta.selectionStart = ta.selectionEnd = ta.value.length;
          }
        }
      }
    }
  }

  function toggleImageActions(index) {
    var el = document.getElementById('img-actions-' + index);
    if (el) el.classList.toggle('visible');
  }

  function setImageSize(index, size) {
    editorState.blocks[index].size = size;
    renderBlockEditor();
  }

  function removeBlock(index) {
    editorState.blocks.splice(index, 1);
    if (editorState.blocks.length === 0) {
      editorState.blocks.push({ type: 'text', value: '' });
    }
    renderBlockEditor();
  }

  // ===== 主题选择 =====
  function selectTheme(themeId) {
    editorState.theme = themeId;
    // Update picker dots
    var dots = document.querySelectorAll('.theme-dot');
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('active', dots[i].getAttribute('data-theme') === themeId);
    }
    // Update editor background
    var editor = document.getElementById('block-editor');
    if (editor) {
      THEMES.forEach(function(t) { editor.classList.remove('theme-' + t.id); });
      editor.classList.add('theme-' + themeId);
    }
  }

  // ===== 图片插入 =====
  function insertPhotos(files, insertIndex) {
    if (!files || files.length === 0) return;
    var promises = [];
    for (var i = 0; i < files.length; i++) {
      promises.push(Storage.compressImage(files[i]));
    }
    Promise.all(promises).then(function(dataUrls) {
      var newBlocks = [];
      dataUrls.forEach(function(dataUrl) {
        var photoId = 'photo_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        editorState.photoCache[photoId] = dataUrl;
        newBlocks.push({ type: 'image', photoId: photoId, size: 'full' });
      });
      // Add trailing text block
      newBlocks.push({ type: 'text', value: '' });

      // Insert at position
      var args = [insertIndex, 0].concat(newBlocks);
      Array.prototype.splice.apply(editorState.blocks, args);
      renderBlockEditor();

      // Focus the new trailing text block
      var newTextIndex = insertIndex + newBlocks.length - 1;
      setTimeout(function() {
        var container = document.getElementById('block-editor');
        var ta = container && container.querySelector('.block[data-block-index="' + newTextIndex + '"] .block-textarea');
        if (ta) ta.focus();
      }, 50);
    });
  }

  function onToolbarPhotos(files) {
    var insertIndex = editorState.lastFocusedIndex + 1;
    if (insertIndex > editorState.blocks.length) insertIndex = editorState.blocks.length;
    insertPhotos(files, insertIndex);
  }

  function onInserterPhotos(files, insertIndex) {
    insertPhotos(files, insertIndex);
  }

  // ===== 图片编辑器 =====
  function openImageEditor(blockIndex) {
    var block = editorState.blocks[blockIndex];
    if (!block || block.type !== 'image') return;
    var dataUrl = editorState.photoCache[block.photoId];
    if (!dataUrl) return;

    imgEditor.blockIndex = blockIndex;
    imgEditor.photoId = block.photoId;
    imgEditor.originalData = dataUrl;
    imgEditor.tool = 'pen';
    imgEditor.strokes = [];
    imgEditor.currentStroke = null;
    imgEditor.cropBox = null;

    var overlay = document.createElement('div');
    overlay.className = 'image-editor-overlay';
    overlay.id = 'image-editor-overlay';

    overlay.innerHTML =
      '<div class="image-editor-header">' +
        '<button class="image-editor-cancel" onclick="Knowledge.cancelImageEditor()">取消</button>' +
        '<button class="image-editor-done" onclick="Knowledge.doneImageEditor()">✓ 完成</button>' +
      '</div>' +
      '<div class="image-editor-canvas-area" id="ie-canvas-area">' +
        '<canvas id="ie-canvas"></canvas>' +
        '<div class="crop-overlay" id="ie-crop-overlay" style="display:none;"></div>' +
      '</div>' +
      '<div class="image-editor-toolbar">' +
        '<button class="image-editor-tool active" data-tool="pen" onclick="Knowledge.setEditorTool(\'pen\')">' +
          '<span class="image-editor-tool-icon">🔴</span>画笔</button>' +
        '<button class="image-editor-tool" data-tool="highlight" onclick="Knowledge.setEditorTool(\'highlight\')">' +
          '<span class="image-editor-tool-icon">🟡</span>高亮</button>' +
        '<button class="image-editor-tool" data-tool="crop" onclick="Knowledge.setEditorTool(\'crop\')">' +
          '<span class="image-editor-tool-icon">✂️</span>裁切</button>' +
        '<button class="image-editor-tool" onclick="Knowledge.undoStroke()">' +
          '<span class="image-editor-tool-icon">↩️</span>撤销</button>' +
      '</div>';

    document.body.appendChild(overlay);

    // Load image onto canvas
    var img = new Image();
    img.onload = function() {
      imgEditor.imgEl = img;
      var canvas = document.getElementById('ie-canvas');
      var area = document.getElementById('ie-canvas-area');
      var maxW = area.clientWidth - 20;
      var maxH = area.clientHeight - 20;
      var scale = Math.min(maxW / img.width, maxH / img.height, 1);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      imgEditor.canvas = canvas;
      imgEditor.ctx = canvas.getContext('2d');
      imgEditor.scale = scale;
      redrawEditor();
      setupEditorTouch(canvas);
    };
    img.src = dataUrl;
  }

  function redrawEditor() {
    var ctx = imgEditor.ctx;
    var canvas = imgEditor.canvas;
    var img = imgEditor.imgEl;
    if (!ctx || !img) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw all strokes
    imgEditor.strokes.forEach(function(stroke) { drawStroke(ctx, stroke); });
    if (imgEditor.currentStroke) drawStroke(ctx, imgEditor.currentStroke);
  }

  function drawStroke(ctx, stroke) {
    if (!stroke.points || stroke.points.length < 2) return;
    ctx.save();
    if (stroke.tool === 'pen') {
      ctx.strokeStyle = 'rgba(220,50,50,0.85)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    } else if (stroke.tool === 'highlight') {
      ctx.strokeStyle = 'rgba(255,220,50,0.4)';
      ctx.lineWidth = 20;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'multiply';
    }
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (var i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function setupEditorTouch(canvas) {
    function getPos(e) {
      var rect = canvas.getBoundingClientRect();
      var t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }

    canvas.addEventListener('touchstart', function(e) {
      if (imgEditor.tool === 'crop') return;
      e.preventDefault();
      var pos = getPos(e);
      imgEditor.currentStroke = { tool: imgEditor.tool, points: [pos] };
    }, { passive: false });

    canvas.addEventListener('touchmove', function(e) {
      if (!imgEditor.currentStroke) return;
      e.preventDefault();
      var pos = getPos(e);
      imgEditor.currentStroke.points.push(pos);
      redrawEditor();
    }, { passive: false });

    canvas.addEventListener('touchend', function(e) {
      if (imgEditor.currentStroke && imgEditor.currentStroke.points.length >= 2) {
        imgEditor.strokes.push(imgEditor.currentStroke);
      }
      imgEditor.currentStroke = null;
      redrawEditor();
    });

    // Mouse fallback for desktop
    canvas.addEventListener('mousedown', function(e) {
      if (imgEditor.tool === 'crop') return;
      var pos = getPos(e);
      imgEditor.currentStroke = { tool: imgEditor.tool, points: [pos] };
    });
    canvas.addEventListener('mousemove', function(e) {
      if (!imgEditor.currentStroke) return;
      var pos = getPos(e);
      imgEditor.currentStroke.points.push(pos);
      redrawEditor();
    });
    canvas.addEventListener('mouseup', function() {
      if (imgEditor.currentStroke && imgEditor.currentStroke.points.length >= 2) {
        imgEditor.strokes.push(imgEditor.currentStroke);
      }
      imgEditor.currentStroke = null;
      redrawEditor();
    });
  }

  function setEditorTool(tool) {
    imgEditor.tool = tool;
    var btns = document.querySelectorAll('.image-editor-tool[data-tool]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-tool') === tool);
    }

    // Show/hide crop overlay
    var cropOverlay = document.getElementById('ie-crop-overlay');
    if (tool === 'crop') {
      if (!imgEditor.cropBox) {
        var canvas = imgEditor.canvas;
        var pad = 30;
        imgEditor.cropBox = { x: pad, y: pad, w: canvas.width - pad * 2, h: canvas.height - pad * 2 };
      }
      renderCropUI();
      if (cropOverlay) cropOverlay.style.display = '';
    } else {
      if (cropOverlay) cropOverlay.style.display = 'none';
    }
  }

  function renderCropUI() {
    var overlay = document.getElementById('ie-crop-overlay');
    var canvas = imgEditor.canvas;
    if (!overlay || !canvas || !imgEditor.cropBox) return;

    var box = imgEditor.cropBox;
    var rect = canvas.getBoundingClientRect();
    var area = document.getElementById('ie-canvas-area');
    var areaRect = area.getBoundingClientRect();

    // Position overlay over canvas
    overlay.style.left = (rect.left - areaRect.left) + 'px';
    overlay.style.top = (rect.top - areaRect.top) + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    overlay.innerHTML = '<div class="crop-box" id="ie-crop-box" style="' +
      'left:' + box.x + 'px;top:' + box.y + 'px;width:' + box.w + 'px;height:' + box.h + 'px;">' +
      '<div class="crop-handle crop-handle-tl" data-handle="tl"></div>' +
      '<div class="crop-handle crop-handle-tr" data-handle="tr"></div>' +
      '<div class="crop-handle crop-handle-bl" data-handle="bl"></div>' +
      '<div class="crop-handle crop-handle-br" data-handle="br"></div></div>';

    // Setup drag on handles
    var handles = overlay.querySelectorAll('.crop-handle');
    for (var i = 0; i < handles.length; i++) {
      setupCropHandle(handles[i]);
    }
    // Setup drag on box itself (move)
    setupCropBoxDrag(document.getElementById('ie-crop-box'));
  }

  function setupCropHandle(handle) {
    var type = handle.getAttribute('data-handle');
    function onStart(e) {
      e.preventDefault(); e.stopPropagation();
      var startT = e.touches ? e.touches[0] : e;
      var startX = startT.clientX, startY = startT.clientY;
      var startBox = { x: imgEditor.cropBox.x, y: imgEditor.cropBox.y,
        w: imgEditor.cropBox.w, h: imgEditor.cropBox.h };

      function onMove(e2) {
        var t2 = e2.touches ? e2.touches[0] : e2;
        var dx = t2.clientX - startX, dy = t2.clientY - startY;
        var b = imgEditor.cropBox;
        if (type === 'br') { b.w = Math.max(40, startBox.w + dx); b.h = Math.max(40, startBox.h + dy); }
        else if (type === 'bl') { b.x = startBox.x + dx; b.w = Math.max(40, startBox.w - dx); b.h = Math.max(40, startBox.h + dy); }
        else if (type === 'tr') { b.w = Math.max(40, startBox.w + dx); b.y = startBox.y + dy; b.h = Math.max(40, startBox.h - dy); }
        else if (type === 'tl') { b.x = startBox.x + dx; b.y = startBox.y + dy; b.w = Math.max(40, startBox.w - dx); b.h = Math.max(40, startBox.h - dy); }
        renderCropUI();
      }
      function onEnd() {
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
      }
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
    }
    handle.addEventListener('touchstart', onStart, { passive: false });
    handle.addEventListener('mousedown', onStart);
  }

  function setupCropBoxDrag(box) {
    function onStart(e) {
      if (e.target !== box) return;
      e.preventDefault();
      var startT = e.touches ? e.touches[0] : e;
      var startX = startT.clientX, startY = startT.clientY;
      var startBX = imgEditor.cropBox.x, startBY = imgEditor.cropBox.y;

      function onMove(e2) {
        var t2 = e2.touches ? e2.touches[0] : e2;
        imgEditor.cropBox.x = startBX + (t2.clientX - startX);
        imgEditor.cropBox.y = startBY + (t2.clientY - startY);
        renderCropUI();
      }
      function onEnd() {
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
      }
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
    }
    box.addEventListener('touchstart', onStart, { passive: false });
    box.addEventListener('mousedown', onStart);
  }

  function undoStroke() {
    if (imgEditor.strokes.length > 0) {
      imgEditor.strokes.pop();
      redrawEditor();
    }
  }

  function cancelImageEditor() {
    var overlay = document.getElementById('image-editor-overlay');
    if (overlay) overlay.remove();
  }

  function doneImageEditor() {
    var canvas = imgEditor.canvas;
    var img = imgEditor.imgEl;
    if (!canvas || !img) { cancelImageEditor(); return; }

    // If crop mode and we have a crop box, apply crop
    if (imgEditor.tool === 'crop' && imgEditor.cropBox) {
      var box = imgEditor.cropBox;
      // First, draw strokes onto a temp canvas at full image resolution
      var fullCanvas = document.createElement('canvas');
      fullCanvas.width = img.width;
      fullCanvas.height = img.height;
      var fctx = fullCanvas.getContext('2d');
      var invScale = 1 / imgEditor.scale;
      fctx.drawImage(img, 0, 0);
      // Draw strokes at full resolution
      imgEditor.strokes.forEach(function(stroke) {
        var scaled = { tool: stroke.tool, points: stroke.points.map(function(p) {
          return { x: p.x * invScale, y: p.y * invScale };
        })};
        drawStrokeOnCtx(fctx, scaled, invScale);
      });
      // Crop
      var cx = Math.round(box.x * invScale);
      var cy = Math.round(box.y * invScale);
      var cw = Math.round(box.w * invScale);
      var ch = Math.round(box.h * invScale);
      cx = Math.max(0, cx); cy = Math.max(0, cy);
      cw = Math.min(cw, img.width - cx);
      ch = Math.min(ch, img.height - cy);
      var cropCanvas = document.createElement('canvas');
      cropCanvas.width = cw; cropCanvas.height = ch;
      cropCanvas.getContext('2d').drawImage(fullCanvas, cx, cy, cw, ch, 0, 0, cw, ch);
      var newData = cropCanvas.toDataURL('image/jpeg', 0.85);
      editorState.photoCache[imgEditor.photoId] = newData;
    } else if (imgEditor.strokes.length > 0) {
      // Apply strokes at full resolution
      var fullCanvas2 = document.createElement('canvas');
      fullCanvas2.width = img.width;
      fullCanvas2.height = img.height;
      var fctx2 = fullCanvas2.getContext('2d');
      var invScale2 = 1 / imgEditor.scale;
      fctx2.drawImage(img, 0, 0);
      imgEditor.strokes.forEach(function(stroke) {
        var scaled = { tool: stroke.tool, points: stroke.points.map(function(p) {
          return { x: p.x * invScale2, y: p.y * invScale2 };
        })};
        drawStrokeOnCtx(fctx2, scaled, invScale2);
      });
      var newData2 = fullCanvas2.toDataURL('image/jpeg', 0.85);
      editorState.photoCache[imgEditor.photoId] = newData2;
    }

    cancelImageEditor();
    renderBlockEditor();
  }

  function drawStrokeOnCtx(ctx, stroke, invScale) {
    if (!stroke.points || stroke.points.length < 2) return;
    ctx.save();
    if (stroke.tool === 'pen') {
      ctx.strokeStyle = 'rgba(220,50,50,0.85)';
      ctx.lineWidth = 3 * invScale;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    } else if (stroke.tool === 'highlight') {
      ctx.strokeStyle = 'rgba(255,220,50,0.4)';
      ctx.lineWidth = 20 * invScale;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'multiply';
    }
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (var i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ===== 保存笔记 =====
  function saveNote(existingId) {
    var title = (document.getElementById('note-title').value || '').trim();
    var blocks = editorState.blocks.filter(function(b) {
      return (b.type === 'text' && b.value.trim()) || b.type === 'image';
    });
    var content = blocksToPlainText(blocks);
    var photoIds = blocks.filter(function(b) { return b.type === 'image'; })
      .map(function(b) { return b.photoId; });

    if (!title && !content && photoIds.length === 0) {
      alert('请至少填写标题或内容');
      return;
    }

    function doSave(finalPhotoIds) {
      var linkedPlant = document.getElementById('note-linked-plant');
      var linkedPlantIds = (linkedPlant && linkedPlant.value) ? [linkedPlant.value] : [];

      if (existingId) {
        Storage.update(existingId, {
          title: title || '未命名笔记',
          content: content,
          blocks: blocks,
          theme: editorState.theme,
          photoIds: finalPhotoIds,
          linkedPlantIds: linkedPlantIds
        });
      } else {
        Storage.create({
          type: 'note', status: 'complete',
          title: title || '未命名笔记',
          content: content,
          blocks: blocks,
          theme: editorState.theme,
          photoIds: finalPhotoIds,
          linkedPlantIds: linkedPlantIds,
          tags: [], links: [],
          date: new Date().toISOString().split('T')[0]
        });
      }

      // Show celebration
      showNoteCelebration(title || '未命名笔记', content, photoIds, editorState.theme);
    }

    // Save photos to PhotoDB
    if (photoIds.length > 0) {
      var saves = photoIds.map(function(pid) {
        var data = editorState.photoCache[pid];
        return data ? PhotoDB.save(pid, data) : Promise.resolve();
      });
      Promise.all(saves).then(function() { doSave(photoIds); });
    } else {
      doSave([]);
    }
  }

  // ===== 庆祝界面 =====
  function showNoteCelebration(title, content, photoIds, themeId) {
    var theme = getTheme(themeId);
    var excerpt = content.length > 120 ? content.substring(0, 120) + '...' : content;

    var html = '<div class="note-celebration">';

    // 彩纸动画（花瓣飘落）
    html += '<div style="position:absolute;top:0;left:0;right:0;height:300px;overflow:hidden;pointer-events:none;">';
    for (var i = 0; i < 20; i++) {
      var color = theme.confetti[i % theme.confetti.length];
      var left = Math.random() * 100;
      var delay = Math.random() * 2;
      var size = 6 + Math.random() * 8;
      html += '<div class="note-confetti-piece" style="left:' + left + '%;animation-delay:' + delay +
        's;width:' + size + 'px;height:' + size + 'px;background:' + color + ';"></div>';
    }
    html += '</div>';

    html += '<div style="font-size:42px;margin-bottom:12px;position:relative;z-index:1;">✨</div>';
    html += '<div class="note-celebration-title">笔记已保存</div>';
    html += '<div class="note-celebration-subtitle">记录每一刻灵感与发现</div>';

    // 笔记预览卡片
    html += '<div class="note-celebration-preview">';
    html += '<div class="note-celebration-preview-bar" style="background:' + theme.accent + ';"></div>';
    html += '<h3>' + escapeHtml(title) + '</h3>';
    if (excerpt) html += '<p>' + escapeHtml(excerpt) + '</p>';
    if (photoIds.length > 0) {
      html += '<div id="celebration-photo" style="margin-top:10px;"></div>';
    }
    html += '</div>';

    // 分享卡片 canvas
    html += '<canvas id="note-share-canvas" width="540" height="720" style="width:100%;border-radius:12px;margin-bottom:16px;position:relative;z-index:1;"></canvas>';

    // 按钮
    html += '<div style="display:flex;gap:12px;position:relative;z-index:1;">';
    html += '<button class="btn btn-primary" style="flex:1;" onclick="Knowledge.closeCelebration()">完成</button>';
    html += '<button class="btn" style="flex:1;" onclick="Knowledge.downloadNoteCard()">📷 保存卡片</button>';
    html += '</div></div>';

    document.getElementById('modal-title').textContent = '✨ 笔记已保存';
    document.getElementById('modal-body').innerHTML = html;

    // Load first photo into preview
    if (photoIds.length > 0) {
      var firstPhotoData = editorState.photoCache[photoIds[0]];
      if (firstPhotoData) {
        var container = document.getElementById('celebration-photo');
        if (container) container.innerHTML = '<img src="' + firstPhotoData + '" style="width:100%;border-radius:var(--radius-sm);max-height:160px;object-fit:cover;">';
      }
    }

    // Draw share card
    setTimeout(function() { drawNoteShareCard(title, content, photoIds, theme); }, 100);
  }

  function drawNoteShareCard(title, content, photoIds, theme) {
    var canvas = document.getElementById('note-share-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = 540, H = 720;

    // Background
    ctx.fillStyle = '#fffef9';
    ctx.fillRect(0, 0, W, H);

    // Watercolor border with theme colors
    drawThemeBorder(ctx, W, H, theme);

    // Theme color bar at top
    ctx.fillStyle = theme.accent;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(30, 30, W - 60, 5);
    ctx.globalAlpha = 1;

    // Title
    ctx.font = 'bold 24px "Smiley Sans", "PingFang SC", sans-serif';
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'center';
    var displayTitle = title.length > 16 ? title.substring(0, 16) + '...' : title;
    ctx.fillText(displayTitle, W / 2, 80);

    // Date
    ctx.font = '13px "PingFang SC", sans-serif';
    ctx.fillStyle = '#9e9890';
    ctx.fillText(new Date().toISOString().split('T')[0], W / 2, 105);

    // Divider
    ctx.strokeStyle = theme.accent;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(60, 120); ctx.lineTo(W - 60, 120); ctx.stroke();
    ctx.globalAlpha = 1;

    // Content area
    var contentY = 145;
    var maxContentH = 380;

    // If there's a first photo, try to load and draw it
    if (photoIds.length > 0 && editorState.photoCache[photoIds[0]]) {
      var img = new Image();
      img.onload = function() {
        // Draw photo
        var photoH = 200;
        var photoW = W - 80;
        var photoX = 40;
        ctx.save();
        roundRectPath(ctx, photoX, contentY, photoW, photoH, 10);
        ctx.clip();
        var imgRatio = img.width / img.height;
        var drawW, drawH;
        if (imgRatio > photoW / photoH) {
          drawH = photoH; drawW = photoH * imgRatio;
        } else {
          drawW = photoW; drawH = photoW / imgRatio;
        }
        ctx.drawImage(img, photoX + (photoW - drawW) / 2, contentY + (photoH - drawH) / 2, drawW, drawH);
        ctx.restore();

        // Draw text excerpt below photo
        drawExcerptText(ctx, content, W, contentY + photoH + 20, maxContentH - photoH - 20, theme);
        drawCardFooter(ctx, W, H, theme);
      };
      img.src = editorState.photoCache[photoIds[0]];
    } else {
      drawExcerptText(ctx, content, W, contentY, maxContentH, theme);
      drawCardFooter(ctx, W, H, theme);
    }
  }

  function drawExcerptText(ctx, content, W, startY, maxH, theme) {
    if (!content) return;
    ctx.font = '15px "Smiley Sans", "PingFang SC", sans-serif';
    ctx.fillStyle = '#46433e';
    ctx.textAlign = 'left';

    var maxWidth = W - 100;
    var lineHeight = 24;
    var lines = [];
    var paragraphs = content.split('\n');
    for (var p = 0; p < paragraphs.length && lines.length < 12; p++) {
      var words = paragraphs[p];
      var line = '';
      for (var c = 0; c < words.length; c++) {
        var testLine = line + words[c];
        if (ctx.measureText(testLine).width > maxWidth && line) {
          lines.push(line);
          line = words[c];
        } else {
          line = testLine;
        }
      }
      if (line) lines.push(line);
      if (p < paragraphs.length - 1) lines.push('');
    }

    var y = startY;
    for (var i = 0; i < lines.length && (y - startY) < maxH; i++) {
      if (lines[i]) ctx.fillText(lines[i], 50, y);
      y += lineHeight;
    }
    if (lines.length > 12) {
      ctx.fillStyle = '#9e9890';
      ctx.fillText('...', 50, y);
    }
  }

  function drawThemeBorder(ctx, W, H, theme) {
    var spots = [
      { cx: 40, cy: 40, r: 120 },
      { cx: W - 40, cy: 40, r: 100 },
      { cx: 40, cy: H - 40, r: 100 },
      { cx: W - 40, cy: H - 40, r: 120 },
      { cx: W / 2, cy: 30, r: 80 },
      { cx: W / 2, cy: H - 30, r: 80 }
    ];
    spots.forEach(function(s, i) {
      var c = theme.confetti[i % theme.confetti.length];
      var g = ctx.createRadialGradient(s.cx, s.cy, 0, s.cx, s.cy, s.r);
      g.addColorStop(0, c);
      g.addColorStop(1, 'transparent');
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
    ctx.globalAlpha = 1;

    // Border stroke
    ctx.strokeStyle = theme.accent;
    ctx.globalAlpha = 0.15;
    ctx.lineWidth = 1.5;
    roundRectPath(ctx, 15, 15, W - 30, H - 30, 14);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawCardFooter(ctx, W, H, theme) {
    ctx.font = '13px "PingFang SC", sans-serif';
    ctx.fillStyle = '#9e9890';
    ctx.textAlign = 'center';
    ctx.fillText('🌿 野径手记', W / 2, H - 35);
  }

  function roundRectPath(ctx, x, y, w, h, r) {
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

  function closeCelebration() {
    var overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';
    App.refreshView();
  }

  function downloadNoteCard() {
    var canvas = document.getElementById('note-share-canvas');
    if (!canvas) return;
    var link = document.createElement('a');
    link.download = '野径手记-笔记-' + new Date().toISOString().split('T')[0] + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  // ===== 笔记详情 =====
  function openNoteDetail(noteId) {
    var note = Storage.getById(noteId);
    if (!note) return;

    var blocks = normalizeBlocks(note);
    var theme = getTheme(note.theme || 'green');
    var themeClass = 'theme-' + (note.theme || 'green');

    var html = '<div class="note-detail-themed ' + themeClass + '">';

    // 标题
    html += '<div class="note-detail-title">' + escapeHtml(note.title || '未命名笔记') + '</div>';

    // 元信息
    html += '<div class="note-detail-meta">';
    html += (note.date || '');
    if (note.linkedPlantIds && note.linkedPlantIds.length > 0) {
      var names = note.linkedPlantIds.map(function(pid) {
        var p = Storage.getById(pid); return p ? p.name : null;
      }).filter(Boolean);
      if (names.length > 0) html += ' · 🌿 ' + escapeHtml(names.join('、'));
    }
    if (note.relatedObjects) html += ' · 🌿 ' + escapeHtml(note.relatedObjects);
    html += '</div>';

    // 按 blocks 渲染
    blocks.forEach(function(block) {
      if (block.type === 'text' && block.value) {
        html += '<div class="note-detail-text">' + escapeHtml(block.value) + '</div>';
      } else if (block.type === 'image') {
        var sizeClass = block.size && block.size !== 'full' ? ' size-' + block.size : '';
        html += '<div class="note-detail-image' + sizeClass + '">';
        html += '<img data-photo-id="' + block.photoId + '" src="" class="note-detail-img">';
        html += '</div>';
      }
    });

    // 编辑/删除按钮
    html += '<div style="margin-top:20px;display:flex;gap:10px;">';
    html += '<button class="btn btn-primary btn-block" onclick="Knowledge.openNoteEditor(\'' + noteId + '\')">编辑</button>';
    html += '<button class="btn btn-secondary" onclick="Knowledge.deleteNote(\'' + noteId + '\')" style="color:#c44;">删除</button>';
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
    var allPhotoIds = blocks.filter(function(b) { return b.type === 'image'; })
      .map(function(b) { return b.photoId; });
    if (allPhotoIds.length > 0) {
      PhotoDB.getMultiple(allPhotoIds).then(function(results) {
        results.forEach(function(r) {
          if (r && r.data) {
            var imgs = document.querySelectorAll('img[data-photo-id="' + r.id + '"]');
            for (var i = 0; i < imgs.length; i++) { imgs[i].src = r.data; }
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

  // ===== 公开 API =====
  return {
    render: render,
    filter: filter,
    openNoteEditor: openNoteEditor,
    openNoteDetail: openNoteDetail,
    saveNote: saveNote,
    deleteNote: deleteNote,
    onBlockInput: onBlockInput,
    onBlockFocus: onBlockFocus,
    onBlockKeydown: onBlockKeydown,
    onToolbarPhotos: onToolbarPhotos,
    onInserterPhotos: onInserterPhotos,
    removeBlock: removeBlock,
    setImageSize: setImageSize,
    toggleImageActions: toggleImageActions,
    selectTheme: selectTheme,
    openImageEditor: openImageEditor,
    setEditorTool: setEditorTool,
    undoStroke: undoStroke,
    cancelImageEditor: cancelImageEditor,
    doneImageEditor: doneImageEditor,
    closeCelebration: closeCelebration,
    downloadNoteCard: downloadNoteCard
  };
})();
