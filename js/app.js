/* ========== 主应用入口 ========== */
var App = (function() {
  var currentView = 'home';
  var viewportBound = false;
  var keyboardOpen = false;

  function init() {
    bindViewportMetrics();
    bindModalInputViewport();

    // 绑定底部导航
    document.querySelectorAll('.nav-item').forEach(function(btn) {
      btn.addEventListener('click', function() {
        switchView(btn.getAttribute('data-view'));
      });
    });

    // 快速拍照按钮
    document.getElementById('btn-quick-photo').addEventListener('click', function() {
      Inbox.quickShoot();
    });

    // 同步按钮 → 直接同步
    document.getElementById('btn-sync').addEventListener('click', function() {
      directSync();
    });

    // 设置按钮
    document.getElementById('btn-settings').addEventListener('click', function() {
      openSyncModal();
    });

    // 模态框关闭
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', function(e) {
      if (e.target === this) closeModal();
    });

    // 迁移旧版照片数据，种子植物，完成后渲染首页
    Storage.migratePhotos().then(function() {
      seedPlants();
      renderView('home');
    });
  }

  function switchView(view) {
    currentView = view;
    // 更新导航高亮
    document.querySelectorAll('.nav-item').forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-view') === view);
    });
    renderView(view);
    // 回到顶部
    window.scrollTo(0, 0);
  }

  function renderView(view) {
    var content = document.getElementById('main-content');
    switch (view) {
      case 'home':
        content.innerHTML = renderHome();
        break;
      case 'timeline':
        content.innerHTML = Timeline.render();
        break;
      case 'plants':
        content.innerHTML = Cards.render();
        break;
      case 'knowledge':
        content.innerHTML = Knowledge.render();
        break;
      case 'graph':
        content.innerHTML = Graph.render();
        setTimeout(function() { Graph.initVisual(); }, 50);
        break;
    }
    // 异步加载照片
    Storage.loadPhotosInDom();
  }

  function updateViewportMetrics() {
    var vv = window.visualViewport;
    var height = vv ? Math.round(vv.height) : window.innerHeight;
    var offsetTop = vv ? Math.round(vv.offsetTop) : 0;
    var bottomGap = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
    var isKeyboardOpen = bottomGap > 110;

    document.documentElement.style.setProperty('--app-vvh', height + 'px');
    document.documentElement.style.setProperty('--viewport-offset-top', offsetTop + 'px');
    document.documentElement.style.setProperty('--keyboard-inset', bottomGap + 'px');
    document.documentElement.style.setProperty('--safe-area-bottom-active', isKeyboardOpen ? '0px' : 'env(safe-area-inset-bottom, 0px)');

    keyboardOpen = isKeyboardOpen;
    document.body.classList.toggle('keyboard-open', keyboardOpen);
  }

  function bindViewportMetrics() {
    if (viewportBound) return;
    updateViewportMetrics();
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewportMetrics);
      window.visualViewport.addEventListener('scroll', updateViewportMetrics);
    }
    window.addEventListener('resize', updateViewportMetrics);
    window.addEventListener('orientationchange', updateViewportMetrics);
    viewportBound = true;
  }

  function bindModalInputViewport() {
    var overlay = document.getElementById('modal-overlay');
    if (!overlay) return;

    overlay.addEventListener('focusin', function(e) {
      var target = e.target;
      if (!target || !target.matches || !target.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (target.id === 'chat-input' || target.closest('.chat-container')) return;

      setTimeout(function() {
        updateViewportMetrics();
        keepModalFieldVisible(target);
      }, 140);
    });

    overlay.addEventListener('focusout', function() {
      setTimeout(updateViewportMetrics, 90);
    });
  }

  function keepModalFieldVisible(field) {
    var overlay = document.getElementById('modal-overlay');
    if (!overlay || !overlay.classList.contains('show')) return;
    var modalBody = document.getElementById('modal-body');
    if (!modalBody || !field || !modalBody.contains(field)) return;

    var rect = field.getBoundingClientRect();
    var visibleBottom = (window.visualViewport ? window.visualViewport.height : window.innerHeight) - 20;
    if (rect.bottom > visibleBottom || rect.top < 72) {
      field.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
  }

  function renderHome() {
    var stats = Storage.getStats();
    var records = Storage.getCompleted();
    var html = '';

    // 统计卡片
    // 引文
    html += '<div class="home-quote">Little by little, you come to know.</div>';

    html += '<div class="home-stats">';
    html += '<div class="stat-card"><div class="stat-number">' + stats.totalPlants + '</div><div class="stat-label">种植物</div></div>';
    html += '<div class="stat-card blue"><div class="stat-number">' + stats.totalNotes + '</div><div class="stat-label">篇笔记</div></div>';
    html += '<div class="stat-card orange"><div class="stat-number">' + stats.totalFamilies + '</div><div class="stat-label">个科</div></div>';
    html += '</div>';

    // 待处理队列
    html += Inbox.renderPendingList();

    // 待确认（数据已完整，等用户确认）
    html += renderReadyList();

    // 待补充（已观察未收录）
    html += renderObservedList();

    // 快捷操作（统一水彩风方块）
    html += '<div class="home-actions">';
    html += '<button class="home-action-btn act-record" onclick="Form.openNew(\'plant\')">';
    html += '<span class="home-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c-4-3-8-6-8-11a8 8 0 0116 0c0 5-4 8-8 11z"/><path d="M12 11V8"/><path d="M10 13h4"/></svg></span>';
    html += '<span>记录植物</span></button>';
    html += '<button class="home-action-btn act-snap" onclick="Inbox.openQuickPhoto()">';
    html += '<span class="home-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg></span>';
    html += '<span>速拍</span></button>';
    html += '<button class="home-action-btn act-note" onclick="Knowledge.openNoteEditor()">';
    html += '<span class="home-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>';
    html += '<span>写笔记</span></button>';
    html += '<button class="home-action-btn act-review" onclick="App.openReview()">';
    html += '<span class="home-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></span>';
    html += '<span>去复习</span></button>';
    html += '</div>';

    html += renderWeeklyProgress(records);
    html += renderReviewPreview();

    return html;
  }

  // 首页复习预览（展示最近几个植物缩略图）
  function renderReviewPreview() {
    var plants = Storage.getByType('plant').filter(function(r) { return r.status !== 'pending' && r.name; });
    if (plants.length === 0) return '';

    // 取最多6个有名字的植物预览
    var preview = plants.slice(0, 6);
    var html = '';
    html += '<div class="section-title">';
    html += '<span>植物复习</span>';
    html += '<span class="count" style="cursor:pointer;" onclick="App.openReview()">' + plants.length + ' 种 →</span>';
    html += '</div>';
    html += '<div class="review-preview-grid">';
    preview.forEach(function(p) {
      html += '<div class="review-preview-item" onclick="App.openReview()">';
      if (p.photoIds && p.photoIds[0]) {
        html += '<img class="review-preview-img" data-photo-id="' + p.photoIds[0] + '" src="' + Storage.BLANK_IMG + '">';
      } else {
        html += '<div class="review-preview-img review-preview-placeholder">🌿</div>';
      }
      html += '<div class="review-preview-name">' + escapeHtml(p.name) + '</div>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  // ===== 复习功能 =====
  function openReview() {
    var plants = Storage.getByType('plant').filter(function(r) { return r.status !== 'pending' && r.name; });
    if (plants.length === 0) {
      showSyncToast('还没有植物记录，先去记录几棵吧', 'info');
      setTimeout(function() {
        var t = document.getElementById('sync-toast');
        if (t) { t.classList.remove('show'); setTimeout(function() { t.remove(); }, 300); }
      }, 2000);
      return;
    }
    renderReviewModal(plants, 'browse');
  }

  function renderReviewModal(plants, mode) {
    var html = '';

    // 模式切换
    html += '<div class="review-mode-tabs">';
    html += '<button class="review-tab' + (mode === 'browse' ? ' active' : '') + '" onclick="App.switchReviewMode(\'browse\')">浏览</button>';
    html += '<button class="review-tab' + (mode === 'quiz-name' ? ' active' : '') + '" onclick="App.switchReviewMode(\'quiz-name\')">看图猜名</button>';
    html += '<button class="review-tab' + (mode === 'quiz-family' ? ' active' : '') + '" onclick="App.switchReviewMode(\'quiz-family\')">看图猜科属</button>';
    html += '</div>';

    if (mode === 'browse') {
      html += renderBrowseMode(plants);
    } else if (mode === 'quiz-name') {
      html += renderQuizMode(plants, 'name');
    } else if (mode === 'quiz-family') {
      html += renderQuizMode(plants, 'family');
    }

    document.getElementById('modal-body').innerHTML = html;
    openModal('植物复习');
    Storage.loadPhotosInDom(document.getElementById('modal-body'));
  }

  var _reviewPlants = [];

  function switchReviewMode(mode) {
    var plants = _reviewPlants.length > 0 ? _reviewPlants : Storage.getByType('plant').filter(function(r) { return r.status !== 'pending' && r.name; });
    _reviewPlants = plants;
    renderReviewModal(plants, mode);
  }

  function renderBrowseMode(plants) {
    _reviewPlants = plants;
    var html = '<div class="review-browse-grid">';
    plants.forEach(function(p) {
      html += '<div class="review-browse-card" onclick="App.showDetail(\'' + p.id + '\')">';
      if (p.photoIds && p.photoIds[0]) {
        html += '<img class="review-browse-img" data-photo-id="' + p.photoIds[0] + '" src="' + Storage.BLANK_IMG + '">';
      } else {
        html += '<div class="review-browse-img review-browse-placeholder">🌿</div>';
      }
      html += '<div class="review-browse-info">';
      html += '<div class="review-browse-name">' + escapeHtml(p.name) + '</div>';
      if (p.family || p.genus) {
        html += '<div class="review-browse-meta">' + escapeHtml([p.family, p.genus].filter(Boolean).join(' · ')) + '</div>';
      }
      if (p.features) {
        html += '<div class="review-browse-features">' + escapeHtml(p.features.length > 40 ? p.features.slice(0, 40) + '…' : p.features) + '</div>';
      }
      html += '</div></div>';
    });
    html += '</div>';
    return html;
  }

  var _quizState = { index: 0, score: 0, total: 0, answered: false, shuffled: [] };

  function renderQuizMode(plants, quizType) {
    _reviewPlants = plants;
    // 筛选有照片的植物
    var withPhotos = plants.filter(function(p) { return p.photoIds && p.photoIds.length > 0; });
    if (withPhotos.length < 2) {
      return '<div class="review-empty">需要至少2种有照片的植物才能练习</div>';
    }

    // 首次进入或重新开始
    if (_quizState.shuffled.length === 0 || _quizState.index >= _quizState.shuffled.length) {
      _quizState = { index: 0, score: 0, total: 0, answered: false, shuffled: shuffleArray(withPhotos.slice()) };
    }

    var current = _quizState.shuffled[_quizState.index];
    var questionLabel = quizType === 'name' ? '这是什么植物？' : '这棵植物属于哪个科/属？';
    var correctAnswer = quizType === 'name' ? current.name : [current.family, current.genus].filter(Boolean).join(' · ');

    // 生成选项（1个正确 + 3个干扰）
    var options = [correctAnswer];
    var others = withPhotos.filter(function(p) { return p.id !== current.id; });
    others = shuffleArray(others);
    for (var i = 0; i < Math.min(3, others.length); i++) {
      var opt = quizType === 'name' ? others[i].name : [others[i].family, others[i].genus].filter(Boolean).join(' · ');
      if (opt && options.indexOf(opt) === -1) options.push(opt);
    }
    options = shuffleArray(options);

    var html = '';
    html += '<div class="quiz-progress">' + (_quizState.index + 1) + ' / ' + _quizState.shuffled.length;
    if (_quizState.total > 0) html += '　正确 ' + _quizState.score + '/' + _quizState.total;
    html += '</div>';

    html += '<div class="quiz-photo-wrap">';
    html += '<img class="quiz-photo" data-photo-id="' + current.photoIds[0] + '" src="' + Storage.BLANK_IMG + '">';
    html += '</div>';

    html += '<div class="quiz-question">' + questionLabel + '</div>';
    html += '<div class="quiz-options" id="quiz-options">';
    options.forEach(function(opt) {
      html += '<button class="quiz-option" data-answer="' + escapeAttr(opt) + '" data-correct="' + escapeAttr(correctAnswer) + '" data-type="' + quizType + '" onclick="App.answerQuiz(this)">' + escapeHtml(opt) + '</button>';
    });
    html += '</div>';
    html += '<div class="quiz-extra" id="quiz-extra"></div>';

    return html;
  }

  function answerQuiz(btn) {
    if (_quizState.answered) return;
    _quizState.answered = true;
    _quizState.total++;

    var answer = btn.getAttribute('data-answer');
    var correct = btn.getAttribute('data-correct');
    var quizType = btn.getAttribute('data-type');
    var isCorrect = answer === correct;
    if (isCorrect) _quizState.score++;

    // 高亮结果
    var options = document.querySelectorAll('#quiz-options .quiz-option');
    options.forEach(function(o) {
      o.disabled = true;
      if (o.getAttribute('data-answer') === correct) {
        o.classList.add('quiz-correct');
      } else if (o === btn && !isCorrect) {
        o.classList.add('quiz-wrong');
      }
    });

    // 展示额外信息
    var current = _quizState.shuffled[_quizState.index];
    var extraHtml = '<div class="quiz-result ' + (isCorrect ? 'correct' : 'wrong') + '">' + (isCorrect ? '答对了！' : '答错了') + '</div>';
    if (current.features) {
      extraHtml += '<div class="quiz-detail"><b>特征：</b>' + escapeHtml(current.features) + '</div>';
    }
    if (quizType === 'name' && (current.family || current.genus)) {
      extraHtml += '<div class="quiz-detail"><b>科属：</b>' + escapeHtml([current.family, current.genus].filter(Boolean).join(' · ')) + '</div>';
    }
    if (current.quickID) {
      extraHtml += '<div class="quiz-detail"><b>快速辨认：</b>' + escapeHtml(current.quickID) + '</div>';
    }
    if (current.confusionSpecies) {
      extraHtml += '<div class="quiz-detail"><b>易混淆种：</b>' + escapeHtml(current.confusionSpecies) + '</div>';
    }
    if (current.funFact) {
      extraHtml += '<div class="quiz-detail quiz-funfact"><b>冷知识：</b>' + escapeHtml(current.funFact) + '</div>';
    }
    extraHtml += '<button class="btn btn-primary btn-sm" style="margin-top:12px; width:100%;" onclick="App.nextQuiz(\'' + quizType + '\')">下一题</button>';

    var extraEl = document.getElementById('quiz-extra');
    if (extraEl) extraEl.innerHTML = extraHtml;
  }

  function nextQuiz(quizType) {
    _quizState.index++;
    _quizState.answered = false;
    if (_quizState.index >= _quizState.shuffled.length) {
      // 完成一轮
      var html = '<div class="quiz-complete">';
      html += '<div class="quiz-complete-title">复习完成！</div>';
      html += '<div class="quiz-complete-score">正确率 ' + Math.round(_quizState.score / _quizState.total * 100) + '%（' + _quizState.score + '/' + _quizState.total + '）</div>';
      html += '<button class="btn btn-primary btn-block" style="margin-top:16px;" onclick="App.resetQuiz(\'' + quizType + '\')">再来一轮</button>';
      html += '</div>';
      document.getElementById('modal-body').innerHTML = html;
      return;
    }
    renderReviewModal(_reviewPlants, 'quiz-' + quizType);
  }

  function resetQuiz(quizType) {
    _quizState = { index: 0, score: 0, total: 0, answered: false, shuffled: [] };
    renderReviewModal(_reviewPlants, 'quiz-' + quizType);
  }

  function shuffleArray(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = arr[i]; arr[i] = arr[j]; arr[j] = temp;
    }
    return arr;
  }

  // 种子植物数据（一次性迁移）
  function seedPlants() {
    var records = Storage.getAll();
    var names = records.map(function(r) { return r.name; });
    var SEED_NAMES = ['山桂花', '木香花'];

    var seeds = [
      {
        type: 'plant',
        status: 'ready',
        name: '山桂花',
        latinName: '',
        family: '木犀科',
        genus: '木犀属',
        features: '叶腋簇生小黄花，花被4裂，单叶革质，有香气',
        notes: '先按桂花系看，不急着到具体种。别被"5瓣"口述带偏，若是芒果则常见枝顶大型圆锥花序。',
        tags: ['木犀科', '芳香']
      },
      {
        type: 'plant',
        status: 'ready',
        name: '木香花',
        latinName: 'Rosa banksiae',
        family: '蔷薇科',
        genus: '蔷薇属',
        features: '披垂蔓生攀援灌木，复叶常见3-5小叶，春季密开白色重瓣小花',
        notes: '先按蔷薇属攀援灌木收，不先抢具体园艺型。别只看"白花瀑布"就叫绣线菊，先看它是不是攀援、叶是不是复叶。',
        tags: ['蔷薇科', '攀援']
      }
    ];

    var seeded = false;
    seeds.forEach(function(seed) {
      if (names.indexOf(seed.name) === -1) {
        Storage.create(seed);
        seeded = true;
      }
    });

    // v63修复：之前seed时误设为complete，改回ready让用户走确认流程
    if (!localStorage.getItem('plants_seed_fix_v63')) {
      records.forEach(function(r) {
        if (SEED_NAMES.indexOf(r.name) !== -1 && r.status === 'complete' && !r.confirmedAt) {
          Storage.update(r.id, { status: 'ready' });
          seeded = true;
        }
      });
      localStorage.setItem('plants_seed_fix_v63', '1');
    }

    return seeded;
  }

  function renderWeeklyProgress(records) {
    var week = getWeeklyProgress(records || []);
    var html = '';

    html += '<div class="section-title">';
    html += '<span>本周进展</span>';
    html += '<span class="count">' + week.rangeLabel + '</span>';
    html += '</div>';

    if (week.totalRecords === 0) {
      html += '<div class="weekly-empty">';
      html += '<div class="weekly-empty-text">这周还没开始记录，今天拍一张植物照片开始吧</div>';
      html += '<div class="weekly-empty-actions">';
      html += '<button class="btn btn-primary btn-sm" style="flex:1;" onclick="Form.openNew(\'plant\')">🌿 正式记录</button>';
      html += '<button class="btn btn-orange btn-sm" style="flex:1;" onclick="Inbox.openQuickPhoto()">📷 速记速拍</button>';
      html += '</div>';
      html += '</div>';
      return html;
    }

    html += '<div class="weekly-grid">';
    html += renderWeeklyMetric('新增植物', '+' + week.thisWeekPlants, week.plantsDiff);
    html += renderWeeklyMetric('新增笔记', '+' + week.thisWeekNotes, week.notesDiff);
    html += renderWeeklyMetric('新增科数', '+' + week.thisWeekFamilies, week.familiesDiff);
    html += renderWeeklyMetric('连续记录', week.streak + ' 天', week.streakDiff);
    html += '</div>';

    return html;
  }

  function renderWeeklyMetric(label, value, diff) {
    var diffClass = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    var diffText = diff > 0 ? '较上周 +' + diff : diff < 0 ? '较上周 ' + diff : '与上周持平';
    return '<div class="weekly-metric">' +
      '<div class="weekly-metric-label">' + label + '</div>' +
      '<div class="weekly-metric-value">' + value + '</div>' +
      '<div class="weekly-metric-diff ' + diffClass + '">' + diffText + '</div>' +
      '</div>';
  }

  function getWeeklyProgress(records) {
    var now = new Date();
    var weekStart = startOfWeekMonday(now);
    var weekEnd = endOfWeek(weekStart);
    var prevWeekStart = addDays(weekStart, -7);

    var thisWeekRecords = filterRecordsByRange(records, weekStart, weekEnd);
    var prevWeekRecords = filterRecordsByRange(records, prevWeekStart, addDays(weekEnd, -7));

    var thisWeekPlants = thisWeekRecords.filter(function(r) { return r.type === 'plant'; });
    var prevWeekPlants = prevWeekRecords.filter(function(r) { return r.type === 'plant'; });
    var thisWeekNotes = thisWeekRecords.filter(isNoteRecord).length;
    var prevWeekNotes = prevWeekRecords.filter(isNoteRecord).length;

    return {
      totalRecords: thisWeekRecords.length,
      rangeLabel: dateToMonthDay(weekStart) + ' - ' + dateToMonthDay(weekEnd),
      thisWeekPlants: thisWeekPlants.length,
      plantsDiff: thisWeekPlants.length - prevWeekPlants.length,
      thisWeekNotes: thisWeekNotes,
      notesDiff: thisWeekNotes - prevWeekNotes,
      thisWeekFamilies: countUniqueFamilies(thisWeekPlants),
      familiesDiff: countUniqueFamilies(thisWeekPlants) - countUniqueFamilies(prevWeekPlants),
      streak: getCurrentStreak(records, now),
      streakDiff: getCurrentStreak(records, now) - getCurrentStreak(records, addDays(now, -7))
    };
  }

  function filterRecordsByRange(records, start, end) {
    return records.filter(function(r) {
      var d = new Date(r.createdAt);
      return !isNaN(d.getTime()) && d >= start && d <= end;
    });
  }

  function isNoteRecord(record) {
    return record.type === 'note' || record.type === 'knowledge' || record.type === 'ecology';
  }

  function countUniqueFamilies(plants) {
    var families = {};
    plants.forEach(function(p) {
      if (p.family) families[p.family] = true;
    });
    return Object.keys(families).length;
  }

  function getCurrentStreak(records, endDate) {
    var daySet = {};
    records.forEach(function(r) {
      if (!r.createdAt) return;
      var d = new Date(r.createdAt);
      if (!isNaN(d.getTime())) daySet[toDayKey(d)] = true;
    });

    var streak = 0;
    var cursor = startOfDay(endDate);
    while (daySet[toDayKey(cursor)]) {
      streak++;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  function startOfWeekMonday(date) {
    var d = startOfDay(date);
    var day = d.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function endOfWeek(weekStart) {
    var d = addDays(weekStart, 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function startOfDay(date) {
    var d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(date, days) {
    var d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function toDayKey(date) {
    var d = new Date(date);
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + month + '-' + day;
  }

  function dateToMonthDay(date) {
    return String(date.getMonth() + 1).padStart(2, '0') + '/' + String(date.getDate()).padStart(2, '0');
  }

  function renderReadyList() {
    var ready = Storage.getReady();
    if (ready.length === 0) return '';

    ready.sort(function(a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });

    var html = '<div class="section-title">待确认 <span style="font-size:12px; color:var(--gray-400); font-weight:400;">' + ready.length + ' 条已补全</span></div>';
    ready.forEach(function(item) {
      html += '<div class="knowledge-item observed-item" onclick="App.showDetail(\'' + item.id + '\')">';
      if (item.photoIds && item.photoIds[0]) {
        html += '<img style="width:44px; height:44px; border-radius:8px; object-fit:cover; flex-shrink:0;" data-photo-id="' + item.photoIds[0] + '" src="' + Storage.BLANK_IMG + '">';
      } else {
        html += '<div class="knowledge-icon" style="background:var(--green-light);">🌿</div>';
      }
      html += '<div style="flex:1; min-width:0;">';
      html += '<div style="font-size:14px; font-weight:500;">' + escapeHtml(item.name || '未命名') + '</div>';
      html += '<div style="font-size:12px; color:var(--gray-400);">' + escapeHtml([item.family, item.location].filter(Boolean).join(' · ')) + '</div>';
      html += '</div>';
      html += '<span class="badge-observed" style="flex-shrink:0; background:var(--green-light); color:var(--green);">待确认</span>';
      html += '</div>';
    });
    return html;
  }

  function renderObservedList() {
    var observed = Storage.getObserved();
    if (observed.length === 0) return '';

    observed.sort(function(a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });

    var html = '<div class="section-title">待补充 <span style="font-size:12px; color:var(--gray-400); font-weight:400;">' + observed.length + ' 条已观察</span></div>';
    observed.forEach(function(item) {
      html += '<div class="knowledge-item observed-item" onclick="App.showDetail(\'' + item.id + '\')">';
      if (item.photoIds && item.photoIds[0]) {
        html += '<img style="width:44px; height:44px; border-radius:8px; object-fit:cover; flex-shrink:0;" data-photo-id="' + item.photoIds[0] + '" src="' + Storage.BLANK_IMG + '">';
      } else {
        html += '<div class="knowledge-icon" style="background:var(--green-light);">🌿</div>';
      }
      html += '<div style="flex:1; min-width:0;">';
      html += '<div style="font-size:14px; font-weight:500;">' + escapeHtml(item.name || item.quickSummary || summarizeRecord(item) || '未命名') + '</div>';
      html += '<div style="font-size:12px; color:var(--gray-400);">' + formatDate(item.updatedAt) + '</div>';
      html += '</div>';
      // AI 识别按钮（有照片时直接进 AI）
      if (item.photoIds && item.photoIds.length > 0 && Chat.hasKey()) {
        html += '<button class="btn-ai-mini" onclick="event.stopPropagation(); Chat.openChat(\'' + item.id + '\')" title="AI识别">📋</button>';
      } else {
        html += '<span class="badge-observed" style="flex-shrink:0;">已观察</span>';
      }
      html += '</div>';
    });
    return html;
  }

  // 详情页
  function showDetail(id) {
    var record = Storage.getById(id);
    if (!record) return;

    var html = '';

    // 照片轮播
    if (record.photoIds && record.photoIds.length > 0) {
      html += '<div class="detail-photos">';
      record.photoIds.forEach(function(photoId) {
        html += '<img class="detail-photo" data-photo-id="' + photoId + '" src="' + Storage.BLANK_IMG + '">';
      });
      html += '</div>';
    }

    // 如果是 note 类型，直接跳转到笔记详情
    if (record.type === 'note') {
      Knowledge.openNoteDetail(id);
      return;
    }

    // 类型标记
    var badgeClass = record.type === 'plant' ? 'badge-plant' : record.type === 'knowledge' ? 'badge-knowledge' : 'badge-ecology';
    var typeLabel = record.type === 'plant' ? '🌿 植物档案' : record.type === 'knowledge' ? '📖 植物学知识' : '🔍 野外发现';
    html += '<span class="card-type-badge ' + badgeClass + '" style="margin-bottom:12px;">' + typeLabel + '</span>';
    if (record.type === 'plant' && record.status === 'observed') {
      html += ' <span class="badge-observed" style="margin-bottom:12px;">已观察</span>';
    } else if (record.type === 'plant' && record.status === 'ready') {
      html += ' <span class="badge-observed" style="margin-bottom:12px; background:var(--green-light); color:var(--green);">待确认</span>';
    } else if (record.type === 'plant' && record.status === 'complete') {
      html += ' <span class="badge-collected" style="margin-bottom:12px;">已收录</span>';
    }

    // 根据类型渲染字段
    if (record.type === 'plant') {
      html += renderField('中文名', record.name);

      // 观察记录区（分组展示）
      var obsGroups = [
        { title: '整体', icon: '🌳', fields: [
          { key: 'growthForm', label: '形态' }
        ]},
        { title: '叶片', icon: '🍃', fields: [
          { key: 'leafArrangement', label: '排列' },
          { key: 'leafType', label: '结构' },
          { key: 'leafEdge', label: '边缘' },
          { key: 'leafVein', label: '叶脉' },
          { key: 'leafTexture', label: '手感' }
        ]},
        { title: '花朵', icon: '🌸', fields: [
          { key: 'petalCount', label: '花瓣' },
          { key: 'flowerSymmetry', label: '对称' },
          { key: 'petalConnection', label: '连接' },
          { key: 'flowerCluster', label: '花序' }
        ]},
        { title: '果实', icon: '🍎', fields: [
          { key: 'fruitTexture', label: '质感' },
          { key: 'fruitDetail', label: '类型' }
        ]}
      ];
      // 旧版字段兼容
      var oldFields = [
        { key: 'lifeForm', label: '生活型' },
        { key: 'leafStructure', label: '叶结构' },
        { key: 'flowerForm', label: '花形态' },
        { key: 'fruitType', label: '果实' },
        { key: 'intuitionCategory', label: '直觉分类' }
      ];
      var hasNewObs = obsGroups.some(function(g) {
        return g.fields.some(function(f) { return record[f.key]; });
      });
      var hasOldObs = oldFields.some(function(f) { return record[f.key]; });
      if (record.detailedObservation) {
        html += '<div class="detail-obs-section detail-obs-longtext">';
        html += '<div class="detail-obs-title">详细观察</div>';
        html += '<div class="detail-obs-paragraph">' + escapeHtml(record.detailedObservation) + '</div>';
        html += '</div>';
      }
      if (hasNewObs || hasOldObs) {
        html += '<div class="detail-obs-section">';
        html += '<div class="detail-obs-title">我的观察</div>';
        if (hasNewObs) {
          obsGroups.forEach(function(g) {
            var groupHasData = g.fields.some(function(f) { return record[f.key]; });
            if (!groupHasData) return;
            html += '<div style="margin-bottom:8px;">';
            html += '<div style="font-size:12px;color:var(--gray-400);margin-bottom:4px;">' + g.icon + ' ' + g.title + '</div>';
            html += '<div class="detail-obs-chips">';
            g.fields.forEach(function(f) {
              if (record[f.key]) {
                html += '<div class="detail-obs-item">';
                html += '<span class="detail-obs-label">' + f.label + '</span>';
                html += '<span class="detail-obs-value">' + escapeHtml(record[f.key]) + '</span>';
                html += '</div>';
              }
            });
            html += '</div></div>';
          });
        }
        // 显示旧版字段（如果有且新版对应字段为空）
        if (hasOldObs && !hasNewObs) {
          html += '<div class="detail-obs-chips">';
          oldFields.forEach(function(f) {
            if (record[f.key]) {
              html += '<div class="detail-obs-item">';
              html += '<span class="detail-obs-label">' + f.label + '</span>';
              html += '<span class="detail-obs-value">' + escapeHtml(record[f.key]) + '</span>';
              html += '</div>';
            }
          });
          html += '</div>';
        }
        html += '</div>';
      }

      html += renderField('学名', record.latinName);
      html += renderField('科', record.family);
      html += renderField('属', record.genus);
      html += renderField('关键特征', record.features);
      html += renderField('发现日期', record.date);
      html += renderField('发现地点', record.location);
      html += renderField('是什么吸引了我', record.attraction);
      html += renderField('其他补充', record.obsNote);
      html += renderField('学习笔记', record.notes);
      html += renderField('我的思考', record.thoughts);

      // 百科信息（补充数据）
      html += renderEncyclopediaSection(record);
    } else if (record.type === 'knowledge') {
      html += renderField('主题', record.title);
      html += renderField('知识分类', record.category);
      html += renderField('内容', record.content);
      html += renderField('引发思考的来源', record.source);
      html += renderField('日期', record.date);
    } else {
      html += renderField('主题', record.title);
      html += renderField('涉及对象', record.relatedObjects);
      html += renderField('内容', record.content);
      html += renderField('我的观察', record.observation);
      html += renderField('日期', record.date);
    }

    // 标签
    if (record.tags && record.tags.length > 0) {
      html += '<div class="detail-tags">';
      record.tags.forEach(function(tag) {
        html += '<span class="tag" onclick="App.filterByTag(\'' + escapeAttr(tag) + '\')">' + escapeHtml(tag) + '</span>';
      });
      html += '</div>';
    }

    // 关联记录
    if (record.links && record.links.length > 0) {
      html += '<div class="detail-links">';
      html += '<div style="font-size:14px; font-weight:600; margin-bottom:8px;">相关记录</div>';
      record.links.forEach(function(linkId) {
        var linked = Storage.getById(linkId);
        if (linked) {
          var linkIcon = linked.type === 'plant' ? '🌿' : linked.type === 'knowledge' ? '📖' : '🔍';
          var linkName = linked.name || linked.title || '未命名';
          html += '<div class="detail-link-item" onclick="App.showDetail(\'' + linkId + '\')">';
          html += linkIcon + ' ' + escapeHtml(linkName);
          html += '</div>';
        }
      });
      html += '</div>';
    }

    // 植物绑定笔记
    if (record.type === 'plant') {
      var linkedNotes = Storage.getByType('note').filter(function(n) {
        return n.status !== 'pending' && n.linkedPlantIds && n.linkedPlantIds.indexOf(record.id) !== -1;
      });
      // 也检查旧类型
      var linkedKnowledge = Storage.getByType('knowledge').concat(Storage.getByType('ecology')).filter(function(n) {
        return n.status !== 'pending' && n.linkedPlantIds && n.linkedPlantIds.indexOf(record.id) !== -1;
      });
      var allLinkedNotes = linkedNotes.concat(linkedKnowledge);

      html += '<div class="plant-notes-section">';
      html += '<div class="plant-notes-title">';
      html += '<span>我的笔记</span>';
      html += '<button class="btn btn-sm" style="padding:4px 12px; font-size:12px;" onclick="event.stopPropagation(); Knowledge.openNoteEditor(null, \'' + record.id + '\')">+ 写笔记</button>';
      html += '</div>';
      if (allLinkedNotes.length > 0) {
        allLinkedNotes.forEach(function(n) {
          var noteTitle = n.title || '未命名笔记';
          var noteExcerpt = (n.content || n.observation || '').substring(0, 50);
          html += '<div class="plant-note-item" onclick="event.stopPropagation(); Knowledge.openNoteDetail(\'' + n.id + '\')">';
          html += '<div style="font-size:14px; font-weight:500;">' + escapeHtml(noteTitle) + '</div>';
          if (noteExcerpt) html += '<div style="font-size:13px; color:var(--gray-500); margin-top:2px;">' + escapeHtml(noteExcerpt) + (noteExcerpt.length >= 50 ? '...' : '') + '</div>';
          html += '</div>';
        });
      } else {
        html += '<div style="font-size:13px; color:var(--gray-400); padding:8px 0;">还没有笔记，点击上方按钮写一篇</div>';
      }
      html += '</div>';
    }

    // 操作按钮
    html += '<div class="detail-actions">';
    // 待确认 → 确认收录按钮
    if (record.type === 'plant' && record.status === 'ready') {
      html += '<button class="btn btn-primary btn-block" onclick="App.confirmReady(\'' + record.id + '\')">确认收录</button>';
      html += '<button class="btn btn-block" style="margin-top:8px;" onclick="Form.openEdit(\'' + record.id + '\')">修改信息</button>';
    // 已观察且有照片 → AI 按钮作为最醒目的主操作
    } else if (record.type === 'plant' && record.status === 'observed' && record.photoIds && record.photoIds.length > 0) {
      html += '<button class="btn btn-primary btn-block" style="background:linear-gradient(135deg, #e0a060, #d4883a); border:none;" onclick="Chat.openChat(\'' + record.id + '\')">📋 AI 识别补全</button>';
      html += '<button class="btn btn-block" style="margin-top:8px;" onclick="Form.openEdit(\'' + record.id + '\')">手动补充信息</button>';
    } else if (record.type === 'plant' && record.status === 'observed') {
      html += '<button class="btn btn-primary btn-block" onclick="Form.openEdit(\'' + record.id + '\')">补充专业信息</button>';
    } else {
      html += '<button class="btn btn-primary btn-block" onclick="Form.openEdit(\'' + record.id + '\')">编辑</button>';
      // 已完成的植物也可以再聊
      if (record.type === 'plant' && record.photoIds && record.photoIds.length > 0) {
        html += '<button class="btn btn-block" style="margin-top:8px; border-color:var(--orange); color:var(--orange);" onclick="Chat.openChat(\'' + record.id + '\')">📋 和AI聊聊</button>';
      }
    }
    html += '<button class="btn btn-danger" onclick="App.deleteFromDetail(\'' + record.id + '\')">删除</button>';
    html += '</div>';

    var title = record.name || record.title || record.quickSummary || summarizeRecord(record) || '详情';
    document.getElementById('modal-body').innerHTML = html;
    openModal(title);

    // 异步加载详情中的照片
    Storage.loadPhotosInDom(document.getElementById('modal-body'));
  }

  function renderField(label, value) {
    if (!value) return '';
    return '<div class="detail-field">' +
      '<div class="detail-field-label">' + label + '</div>' +
      '<div class="detail-field-value">' + escapeHtml(value) + '</div>' +
      '</div>';
  }

  function confirmReady(id) {
    var record = Storage.update(id, { status: 'complete', confirmedAt: new Date().toISOString() });
    if (record) {
      closeModal();
      refreshView();
      Form.showCelebration(record);
    }
  }

  function deleteFromDetail(id) {
    if (confirm('确定要删除这条记录吗？')) {
      Storage.remove(id);
      closeModal();
      refreshView();
    }
  }

  function filterByTag(tag) {
    closeModal();
    switchView('timeline');
    setTimeout(function() {
      var searchInput = document.getElementById('timeline-search');
      if (searchInput) {
        searchInput.value = tag;
        Timeline.filter();
      }
    }, 100);
  }

  function getAIProvider() {
    return localStorage.getItem('plants_ai_provider') || 'gemini';
  }

  function getAIModel(provider) {
    var p = provider || getAIProvider();
    if (p === 'siliconflow') {
      return localStorage.getItem('plants_siliconflow_model') || 'Qwen/Qwen3-VL-8B-Instruct';
    }
    return localStorage.getItem('plants_gemini_model') || 'gemini-2.5-flash';
  }

  function getAIKey(provider) {
    var p = provider || getAIProvider();
    if (p === 'siliconflow') return localStorage.getItem('plants_siliconflow_key') || '';
    return localStorage.getItem('plants_gemini_key') || '';
  }

  // 直接同步（不打开弹窗）
  function directSync() {
    if (!Sync.hasToken()) {
      openSyncModal();
      return;
    }
    var btn = document.getElementById('btn-sync');
    if (btn) btn.classList.add('syncing');
    showSyncToast('正在同步...', 'info');

    Sync.doSync(function(msg) {
      showSyncToast(msg, 'info');
    }).then(function(result) {
      if (btn) btn.classList.remove('syncing');
      showSyncToast(result.message || '同步完成', 'success');
      refreshView();
    }).catch(function(err) {
      if (btn) btn.classList.remove('syncing');
      showSyncToast(err.message || '同步失败', 'error');
    });
  }

  function showSyncToast(msg, type) {
    var existing = document.getElementById('sync-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = 'sync-toast';
    toast.className = 'sync-toast sync-toast-' + (type || 'info');
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(function() { toast.classList.add('show'); });
    if (type !== 'info') {
      setTimeout(function() {
        toast.classList.remove('show');
        setTimeout(function() { toast.remove(); }, 300);
      }, 2500);
    }
  }

  // 同步模态（设置页面）
  function openSyncModal() {
    var html = '';

    // ===== 云端同步区 =====
    html += '<div class="sync-section">';
    html += '<div class="sync-section-title">☁️ 云端同步</div>';
    if (Sync.hasToken()) {
      html += '<div class="sync-token-row">';
      html += '<span class="sync-token-masked">' + Sync.maskToken(Sync.getToken()) + '</span>';
      html += '<a href="javascript:void(0)" class="sync-clear-link" onclick="App.clearSyncToken()">清除</a>';
      html += '</div>';
      html += '<button class="btn btn-primary btn-block" style="margin-top:10px;" onclick="App.syncToCloud()">同步</button>';
      var lastSync = Sync.formatLastSync();
      if (lastSync) {
        html += '<div class="sync-last-time">上次同步：' + lastSync + '</div>';
      }
    } else {
      html += '<input type="text" class="sync-token-input" id="sync-token-input" placeholder="粘贴 GitHub Personal Access Token (gist scope)">';
      html += '<button class="btn btn-primary btn-block" style="margin-top:8px;" onclick="App.saveSyncToken()">验证并保存</button>';
      html += '<div style="font-size:12px; color:var(--gray-400); margin-top:6px;">需要一个有 gist 权限的 Token，两台设备用同一个</div>';
    }
    html += '<div class="sync-result" id="sync-cloud-result"></div>';
    html += '</div>';

    // ===== 分隔线 =====
    html += '<div class="sync-divider"></div>';

    // ===== 文件导入导出 =====
    html += '<div class="sync-section">';
    html += '<div class="sync-section-title">📁 文件传输</div>';
    html += '<div class="sync-btns">';

    html += '<button class="sync-btn" onclick="App.doExport()">';
    html += '<div class="sync-btn-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>';
    html += '<div><div class="sync-btn-title">导出</div>';
    html += '<div class="sync-btn-desc">下载 JSON，AirDrop 发送</div></div>';
    html += '</button>';

    html += '<label class="sync-btn" style="cursor:pointer;">';
    html += '<input type="file" accept=".json" style="display:none" onchange="App.doImport(this.files)">';
    html += '<div class="sync-btn-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>';
    html += '<div><div class="sync-btn-title">导入</div>';
    html += '<div class="sync-btn-desc">选择 JSON 文件合并</div></div>';
    html += '</label>';

    html += '</div>';
    html += '<div class="sync-result" id="sync-result"></div>';
    html += '</div>';

    // ===== AI 设置区 =====
    html += '<div class="sync-divider"></div>';
    html += '<div class="sync-section">';
    html += '<div class="sync-section-title">🔑 AI 植物识别（免费）</div>';
    html += '<div style="font-size:12px; color:var(--gray-400); margin-bottom:8px;">可切换 Gemini / SiliconFlow（大陆更稳）</div>';
    var provider = getAIProvider();
    var key = getAIKey(provider);

    html += '<label style="font-size:12px; color:var(--gray-500); display:block; margin-bottom:4px;">AI 通道</label>';
    html += '<select class="sync-token-input" id="ai-provider-select" onchange="App.setAIProvider(this.value)" style="height:42px;">';
    html += '<option value="gemini"' + (provider === 'gemini' ? ' selected' : '') + '>Google Gemini</option>';
    html += '<option value="siliconflow"' + (provider === 'siliconflow' ? ' selected' : '') + '>SiliconFlow（推荐）</option>';
    html += '</select>';

    html += '<label style="font-size:12px; color:var(--gray-500); display:block; margin:10px 0 4px;">模型</label>';
    if (provider === 'siliconflow') {
      var sfModel = getAIModel('siliconflow');
      html += '<select class="sync-token-input" id="ai-model-select" style="height:42px;">';
      html += '<option value="Qwen/Qwen3-VL-8B-Instruct"' + (sfModel === 'Qwen/Qwen3-VL-8B-Instruct' ? ' selected' : '') + '>Qwen3-VL-8B（均衡）</option>';
      html += '<option value="Qwen/Qwen2.5-VL-32B-Instruct"' + (sfModel === 'Qwen/Qwen2.5-VL-32B-Instruct' ? ' selected' : '') + '>Qwen2.5-VL-32B（更强）</option>';
      html += '<option value="deepseek-ai/deepseek-vl2"' + (sfModel === 'deepseek-ai/deepseek-vl2' ? ' selected' : '') + '>DeepSeek-VL2（更快）</option>';
      html += '</select>';
    } else {
      html += '<select class="sync-token-input" id="ai-model-select" style="height:42px;">';
      html += '<option value="gemini-2.5-flash"' + (getAIModel('gemini') === 'gemini-2.5-flash' ? ' selected' : '') + '>gemini-2.5-flash</option>';
      html += '</select>';
    }

    if (key) {
      html += '<div class="sync-token-row">';
      html += '<span class="sync-token-masked">AI****' + key.slice(-4) + '</span>';
      html += '<a href="javascript:void(0)" class="sync-clear-link" onclick="App.clearAIKey()">清除</a>';
      html += '</div>';
      html += '<button class="btn btn-block" style="margin-top:8px;" onclick="App.saveAIConfig()">保存模型设置</button>';
    } else {
      html += '<input type="text" class="sync-token-input" id="ai-key-input" placeholder="' + (provider === 'siliconflow' ? '粘贴 SiliconFlow API Key' : '粘贴 Gemini API Key') + '">';
      html += '<div style="font-size:12px; color:var(--gray-400); margin-top:4px;">';
      if (provider === 'siliconflow') {
        html += '<a href="https://siliconflow.cn" target="_blank" style="color:var(--green);">前往 SiliconFlow 获取 Key →</a>';
      } else {
        html += '<a href="https://aistudio.google.com/apikey" target="_blank" style="color:var(--green);">前往 Gemini 获取 Key →</a>';
      }
      html += '</div>';
      html += '<button class="btn btn-block" style="margin-top:8px;" onclick="App.saveAIConfig()">保存</button>';
    }
    html += '</div>';

    document.getElementById('modal-body').innerHTML = html;
    openModal('设置');
  }

  function syncToCloud() {
    var resultEl = document.getElementById('sync-cloud-result');
    resultEl.style.display = 'block';
    resultEl.style.background = 'var(--gray-100)';
    resultEl.style.color = 'var(--gray-600)';
    resultEl.textContent = '正在同步...';

    Sync.doSync(function(msg) {
      resultEl.textContent = msg;
    }).then(function(result) {
      resultEl.style.background = 'var(--green-light)';
      resultEl.style.color = 'var(--green)';
      resultEl.textContent = result.message;
      refreshView();
    }).catch(function(err) {
      resultEl.style.background = '#ffebee';
      resultEl.style.color = '#c62828';
      resultEl.textContent = err.message || '同步失败';
    });
  }

  function saveSyncToken() {
    var input = document.getElementById('sync-token-input');
    var token = (input && input.value || '').trim();
    if (!token) return;

    var resultEl = document.getElementById('sync-cloud-result');
    resultEl.style.display = 'block';
    resultEl.style.background = 'var(--gray-100)';
    resultEl.style.color = 'var(--gray-600)';
    resultEl.textContent = '正在验证...';

    Sync.validateToken(token).then(function(res) {
      if (res.valid) {
        Sync.setToken(token);
        resultEl.style.background = 'var(--green-light)';
        resultEl.style.color = 'var(--green)';
        resultEl.textContent = '验证成功！用户：' + res.username;
        setTimeout(function() { openSyncModal(); }, 1000);
      } else {
        resultEl.style.background = '#ffebee';
        resultEl.style.color = '#c62828';
        resultEl.textContent = 'Token 无效，请检查是否有 gist 权限';
      }
    });
  }

  function clearSyncToken() {
    Sync.clearToken();
    openSyncModal();
  }

  function setAIProvider(provider) {
    if (provider !== 'gemini' && provider !== 'siliconflow') return;
    localStorage.setItem('plants_ai_provider', provider);
    openSyncModal();
  }

  function saveAIConfig() {
    var provider = getAIProvider();
    var keyInput = document.getElementById('ai-key-input');
    var modelInput = document.getElementById('ai-model-select');
    var key = (keyInput && keyInput.value || '').trim();
    var model = (modelInput && modelInput.value || '').trim();

    if (provider === 'siliconflow') {
      if (key) localStorage.setItem('plants_siliconflow_key', key);
      if (model) localStorage.setItem('plants_siliconflow_model', model);
    } else {
      if (key) localStorage.setItem('plants_gemini_key', key);
      if (model) localStorage.setItem('plants_gemini_model', model);
    }
    openSyncModal();
  }

  function clearAIKey() {
    var provider = getAIProvider();
    if (provider === 'siliconflow') localStorage.removeItem('plants_siliconflow_key');
    else localStorage.removeItem('plants_gemini_key');
    openSyncModal();
  }

  // 兼容旧按钮调用
  function saveGeminiKey() { saveAIConfig(); }
  function clearGeminiKey() { clearAIKey(); }

  function doExport() {
    Storage.exportData().then(function() {
      var result = document.getElementById('sync-result');
      result.style.display = 'block';
      result.textContent = '导出成功！请通过 AirDrop 发送给其他设备。';
    });
  }

  function doImport(files) {
    if (!files || !files[0]) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      Storage.importData(e.target.result).then(function(result) {
        var el = document.getElementById('sync-result');
        el.style.display = 'block';
        el.textContent = result.message;
        if (result.success) {
          el.style.background = 'var(--green-light)';
          el.style.color = 'var(--green)';
          refreshView();
        } else {
          el.style.background = '#ffebee';
          el.style.color = '#c62828';
        }
      });
    };
    reader.readAsText(files[0]);
  }

  // 模态框操作
  function openModal(title) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-overlay').classList.add('show');
    document.body.style.overflow = 'hidden';
    document.body.classList.add('modal-open');
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.remove('show');
    document.body.style.overflow = '';
    document.body.classList.remove('modal-open');
    if (window.Chat && typeof Chat.onModalClosed === 'function') {
      Chat.onModalClosed();
    }
  }

  function refreshView() {
    renderView(currentView);
  }

  // formatDate、escapeHtml、escapeAttr 已提取到 utils.js
  var formatDate = formatDateSimple;

  function renderEncyclopediaSection(record) {
    var groups = [
      { title: '分布与生境', fields: [
        { key: 'nativeRange', label: '原产地' },
        { key: 'distribution', label: '分布' },
        { key: 'habitat', label: '生境' }
      ]},
      { title: '物候信息', fields: [
        { key: 'floweringSeason', label: '花期' },
        { key: 'fruitingSeason', label: '果期' },
        { key: 'evergreen', label: '常绿/落叶' }
      ]},
      { title: '实用价值', fields: [
        { key: 'gardenUse', label: '园林用途' },
        { key: 'medicinalEdible', label: '药用/食用' },
        { key: 'ecologicalValue', label: '生态价值' }
      ]},
      { title: '识别要点', fields: [
        { key: 'quickID', label: '快速辨认' },
        { key: 'confusionSpecies', label: '易混淆种' }
      ]},
      { title: '文化趣味', fields: [
        { key: 'nameOrigin', label: '名称由来' },
        { key: 'culturalNote', label: '文化背景' },
        { key: 'funFact', label: '趣味冷知识' }
      ]}
    ];

    var hasAny = false;
    groups.forEach(function(g) {
      g.fields.forEach(function(f) {
        if (record[f.key]) hasAny = true;
      });
    });
    if (!hasAny) return '';

    var html = '<div class="ency-section">';
    html += '<div class="ency-title">植物百科</div>';

    groups.forEach(function(g) {
      var items = '';
      g.fields.forEach(function(f) {
        if (record[f.key]) {
          items += '<div class="ency-item"><span class="ency-label">' + escapeHtml(f.label) + '</span><span class="ency-value">' + escapeHtml(record[f.key]) + '</span></div>';
        }
      });
      if (items) {
        html += '<div class="ency-group">';
        html += '<div class="ency-group-title">' + escapeHtml(g.title) + '</div>';
        html += items;
        html += '</div>';
      }
    });

    html += '</div>';
    return html;
  }

  function summarizeRecord(record) {
    var text = record.detailedObservation || record.notes || record.content || record.observation || record.attraction || '';
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return text.length > 24 ? text.slice(0, 24) + '…' : text;
  }

  // 初始化
  document.addEventListener('DOMContentLoaded', init);

  return {
    switchView: switchView,
    openModal: openModal,
    closeModal: closeModal,
    refreshView: refreshView,
    showDetail: showDetail,
    confirmReady: confirmReady,
    deleteFromDetail: deleteFromDetail,
    filterByTag: filterByTag,
    doExport: doExport,
    doImport: doImport,
    openSyncModal: openSyncModal,
    syncToCloud: syncToCloud,
    saveSyncToken: saveSyncToken,
    clearSyncToken: clearSyncToken,
    setAIProvider: setAIProvider,
    saveAIConfig: saveAIConfig,
    clearAIKey: clearAIKey,
    saveGeminiKey: saveGeminiKey,
    clearGeminiKey: clearGeminiKey,
    directSync: directSync,
    openReview: openReview,
    switchReviewMode: switchReviewMode,
    answerQuiz: answerQuiz,
    nextQuiz: nextQuiz,
    resetQuiz: resetQuiz
  };
})();
