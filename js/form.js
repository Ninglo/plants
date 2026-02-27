/* ========== 录入表单 ========== */
var Form = (function() {
  var currentType = 'plant';
  var currentPhotos = []; // [{id: string|null, data: string}]
  var currentTags = [];
  var currentLinks = [];
  var editingId = null;

  // ===== 观察字段定义（按分组） =====
  var currentObsParts = []; // 当前选中的观察部位: ['leaf','flower','fruit']

  // 基础字段（始终显示）
  var OBS_BASE = [
    {
      id: 'growthForm', label: '植物长什么样', desc: '远看整体形态',
      options: [
        { value: '乔木', desc: '高大的树，有粗壮树干' },
        { value: '灌木', desc: '矮矮的丛，从根部分很多枝' },
        { value: '草本', desc: '茎是软的，不是木头' },
        { value: '藤本', desc: '会攀爬或缠绕别的东西' },
        { value: '匍匐', desc: '贴着地面长' }
      ]
    }
  ];

  // 叶片观察字段
  var OBS_LEAF = [
    {
      id: 'leafArrangement', label: '叶子怎么排列', desc: '看叶子在茎上的位置',
      options: [
        { value: '交替生长', desc: '一个一个，左右交替像楼梯' },
        { value: '两两相对', desc: '两片面对面，像张开双臂' },
        { value: '围成一圈', desc: '三片以上围一圈，像车轮' },
        { value: '贴地散开', desc: '全贴在地面，像蒲公英' },
        { value: '不确定', desc: '' }
      ]
    },
    {
      id: 'leafType', label: '叶子结构', desc: '看叶柄上是一整片还是好几片',
      options: [
        { value: '一整片', desc: '叶柄上只有一片完整的叶' },
        { value: '羽毛状', desc: '小叶沿中轴排列，像羽毛' },
        { value: '手掌状', desc: '小叶从一个点散开，像手掌' },
        { value: '三片小叶', desc: '就三片，像三叶草' },
        { value: '不确定', desc: '' }
      ]
    },
    {
      id: 'leafEdge', label: '叶子边缘', desc: '用手指沿边缘感受一下',
      options: [
        { value: '光滑', desc: '像丝带一样顺滑' },
        { value: '锯齿', desc: '一排小齿，像锯子' },
        { value: '圆波浪', desc: '圆圆的起伏，像扇贝边' },
        { value: '深裂', desc: '有深深的裂口，像手指' },
        { value: '不确定', desc: '' }
      ]
    },
    {
      id: 'leafVein', label: '叶脉走向', desc: '对着光看叶脉的纹路',
      options: [
        { value: '平行', desc: '像铁轨一样平行排列' },
        { value: '鱼骨状', desc: '中间一条主脉，两边分叉' },
        { value: '手掌状', desc: '几条主脉从底部散开' },
        { value: '不确定', desc: '' }
      ]
    },
    {
      id: 'leafTexture', label: '叶子手感', desc: '轻轻摸一下叶片',
      options: [
        { value: '薄而软', desc: '像纸一样薄' },
        { value: '厚而硬', desc: '像皮革一样有韧性' },
        { value: '多汁肉质', desc: '厚厚的多汁，像芦荟' },
        { value: '毛茸茸', desc: '有细毛，像桃子皮' },
        { value: '光滑发亮', desc: '滑滑的，像打了蜡' },
        { value: '不确定', desc: '' }
      ]
    }
  ];

  // 花朵观察字段
  var OBS_FLOWER = [
    {
      id: 'petalCount', label: '花瓣几片', desc: '数一数花瓣的数量',
      options: [
        { value: '3或6片', desc: '' },
        { value: '4片', desc: '' },
        { value: '5片', desc: '' },
        { value: '很多片', desc: '多到数不清' },
        { value: '看不清', desc: '太小或太密集' },
        { value: '不确定', desc: '' }
      ]
    },
    {
      id: 'flowerSymmetry', label: '花的形状', desc: '正面看这朵花',
      options: [
        { value: '像星星', desc: '均匀辐射，哪边看都一样' },
        { value: '像嘴巴', desc: '分上下两半，像张开的嘴' },
        { value: '像蝴蝶', desc: '像蝴蝶展翅，有旗瓣和翼瓣' },
        { value: '不确定', desc: '' }
      ]
    },
    {
      id: 'petalConnection', label: '花瓣连在一起吗', desc: '看花瓣底部',
      options: [
        { value: '一片片分开', desc: '能单独摘下一片' },
        { value: '连成筒状', desc: '底部连在一起，像喇叭或杯子' },
        { value: '不确定', desc: '' }
      ]
    },
    {
      id: 'flowerCluster', label: '花怎么聚在一起', desc: '一朵还是一群？怎么排列？',
      options: [
        { value: '单独一朵', desc: '' },
        { value: '一串', desc: '沿着茎排列，像一串葡萄' },
        { value: '像伞', desc: '从一个点撑开，像打伞' },
        { value: '挤成圆盘', desc: '很多小花挤一起，像菊花' },
        { value: '像麦穗', desc: '花直接贴着茎，密密排列' },
        { value: '不确定', desc: '' }
      ]
    }
  ];

  // 果实观察字段
  var OBS_FRUIT = [
    {
      id: 'fruitTexture', label: '果实质感', desc: '看看摸摸果实',
      options: [
        { value: '多汁有果肉', desc: '像番茄或桃子' },
        { value: '干燥的', desc: '硬的或纸质的，像花生壳' },
        { value: '不确定', desc: '' }
      ]
    },
    {
      id: 'fruitDetail', label: '果实长什么样', desc: '仔细看看它的样子',
      options: [
        { value: '有硬核', desc: '果肉里有硬核，像桃子樱桃' },
        { value: '多籽浆果', desc: '种子散在果肉里，像番茄' },
        { value: '豆荚', desc: '两边裂开，像豌豆荚' },
        { value: '干盒裂开', desc: '像盒子裂开撒种子' },
        { value: '带翅膀', desc: '能飞的种子，像枫树直升机' },
        { value: '坚果', desc: '有硬壳，像橡果或栗子' },
        { value: '不确定', desc: '' }
      ]
    }
  ];

  // 获取所有观察字段（用于遍历）
  function getAllObsFields() {
    return OBS_BASE.concat(OBS_LEAF).concat(OBS_FLOWER).concat(OBS_FRUIT);
  }

  // 兼容旧版字段映射（旧数据能正确显示）
  var OLD_OBS_FIELDS = [
    { key: 'lifeForm', label: '生活型' },
    { key: 'leafStructure', label: '叶结构' },
    { key: 'flowerForm', label: '花整体形态' },
    { key: 'fruitType', label: '果实类型' },
    { key: 'intuitionCategory', label: '直觉分类' }
  ];

  function renderChipField(field, selectedValue) {
    var html = '<div class="form-group">';
    html += '<label class="form-label">' + field.label + '</label>';
    if (field.desc) html += '<div class="form-hint">' + field.desc + '</div>';
    html += '<div class="chip-group" data-field="' + field.id + '">';
    field.options.forEach(function(opt) {
      var isActive = selectedValue === opt.value;
      html += '<button type="button" class="obs-chip' + (isActive ? ' active' : '') + '" ';
      html += 'data-value="' + opt.value + '" onclick="Form.selectChip(this)">';
      html += '<span class="obs-chip-label">' + opt.value + '</span>';
      if (opt.desc) html += '<span class="obs-chip-desc">' + opt.desc + '</span>';
      html += '</button>';
    });
    html += '</div></div>';
    return html;
  }

  function selectChip(btn) {
    var group = btn.parentElement;
    group.querySelectorAll('.obs-chip').forEach(function(c) { c.classList.remove('active'); });
    btn.classList.add('active');
  }

  // 切换观察部位（多选）
  function toggleObsPart(part) {
    var idx = currentObsParts.indexOf(part);
    if (idx === -1) {
      currentObsParts.push(part);
    } else {
      currentObsParts.splice(idx, 1);
    }
    // 更新按钮高亮
    var btns = document.querySelectorAll('.obs-part-chip');
    btns.forEach(function(b) {
      b.classList.toggle('active', currentObsParts.indexOf(b.getAttribute('data-part')) !== -1);
    });
    // 显示/隐藏对应字段组
    ['leaf', 'flower', 'fruit'].forEach(function(p) {
      var group = document.getElementById('obs-group-' + p);
      if (group) {
        group.style.display = currentObsParts.indexOf(p) !== -1 ? 'block' : 'none';
      }
    });
  }

  function getChipVal(fieldId) {
    var group = document.querySelector('.chip-group[data-field="' + fieldId + '"]');
    if (!group) return '';
    var active = group.querySelector('.obs-chip.active');
    return active ? active.getAttribute('data-value') : '';
  }

  // 语音识别
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var activeRecognition = null; // 当前正在进行的语音识别实例

  function startVoiceInput(targetInput) {
    if (!SpeechRecognition) {
      alert('你的浏览器不支持语音输入，请使用 Safari 或 Chrome');
      return;
    }

    var btn = targetInput.parentElement.querySelector('.btn-voice');

    // 如果正在录音，点击停止
    if (activeRecognition) {
      activeRecognition.stop();
      activeRecognition = null;
      btn.classList.remove('recording');
      return;
    }

    var recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = true; // 显示中间结果
    activeRecognition = recognition;

    btn.classList.add('recording');

    // 超时保护：10秒自动停止
    var timeout = setTimeout(function() {
      if (activeRecognition === recognition) {
        recognition.stop();
      }
    }, 10000);

    recognition.onresult = function(event) {
      var transcript = '';
      for (var i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (event.results[0].isFinal) {
        if (targetInput.tagName === 'TEXTAREA') {
          targetInput.value += (targetInput.value ? '\n' : '') + transcript;
        } else {
          targetInput.value = transcript;
        }
      } else {
        // 临时结果：显示在 placeholder 里
        targetInput.placeholder = transcript + '...';
      }
    };
    recognition.onerror = function(e) {
      clearTimeout(timeout);
      activeRecognition = null;
      btn.classList.remove('recording');
      if (e.error === 'not-allowed') {
        alert('请允许麦克风权限');
      }
    };
    recognition.onend = function() {
      clearTimeout(timeout);
      activeRecognition = null;
      btn.classList.remove('recording');
      // 恢复 placeholder
      targetInput.placeholder = targetInput.getAttribute('data-placeholder') || '';
    };
    // 保存原始 placeholder
    targetInput.setAttribute('data-placeholder', targetInput.placeholder);
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
    currentObsParts = [];
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
    currentObsParts = (record.observedParts || []).slice();

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
    currentObsParts = (record.observedParts || []).slice();

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
    if (currentType === 'plant') {
      html += '<div class="save-buttons">';
      html += '<div class="save-row">';
      html += '<button class="btn btn-primary btn-block" onclick="Form.save()">保存完整记录</button>';
      if (editingId) {
        html += '<button class="btn btn-danger" onclick="Form.deleteRecord()">删除</button>';
      }
      html += '</div>';
      html += '<button class="btn-secondary" onclick="Form.saveObservation()">仅保存观察（跳过专业信息）</button>';
      html += '</div>';
    } else {
      html += '<div style="margin-top:20px; display:flex; gap:10px;">';
      html += '<button class="btn btn-primary btn-block" onclick="Form.save()">保存</button>';
      if (editingId) {
        html += '<button class="btn btn-danger" onclick="Form.deleteRecord()">删除</button>';
      }
      html += '</div>';
    }

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

    // ===== Step 1: 观察记录 =====
    html += '<div class="form-section">';
    html += '<div class="form-section-header">';
    html += '<span class="form-section-badge step-obs">观察</span>';
    html += '<span class="form-section-title">我的观察</span>';
    html += '<span class="form-section-hint">不需要专业知识，选一选就好</span>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label class="form-label">中文名 *</label>';
    html += '<div class="input-with-voice"><input type="text" class="form-input" id="f-name" placeholder="如：银杏（不确定也可以写暂定名）">' + createVoiceBtn() + '</div>';
    html += '</div>';

    // 照片
    html += renderPhotoUpload();

    // 基础字段（始终显示）
    OBS_BASE.forEach(function(field) {
      html += renderChipField(field, '');
    });

    // 今天看到了什么？（多选前置选择器）
    html += '<div class="form-group">';
    html += '<label class="form-label">今天观察到了什么？</label>';
    html += '<div class="form-hint">可以多选，只展示你看到的部分</div>';
    html += '<div class="obs-part-group">';
    html += '<button type="button" class="obs-part-chip' + (currentObsParts.indexOf('leaf') !== -1 ? ' active' : '') + '" data-part="leaf" onclick="Form.toggleObsPart(\'leaf\')">🍃 叶子</button>';
    html += '<button type="button" class="obs-part-chip' + (currentObsParts.indexOf('flower') !== -1 ? ' active' : '') + '" data-part="flower" onclick="Form.toggleObsPart(\'flower\')">🌸 花</button>';
    html += '<button type="button" class="obs-part-chip' + (currentObsParts.indexOf('fruit') !== -1 ? ' active' : '') + '" data-part="fruit" onclick="Form.toggleObsPart(\'fruit\')">🍎 果实</button>';
    html += '</div></div>';

    // 叶片字段组
    html += '<div id="obs-group-leaf" class="obs-field-group" style="display:' + (currentObsParts.indexOf('leaf') !== -1 ? 'block' : 'none') + ';">';
    html += '<div class="obs-group-header">🍃 叶片观察</div>';
    OBS_LEAF.forEach(function(field) { html += renderChipField(field, ''); });
    html += '</div>';

    // 花朵字段组
    html += '<div id="obs-group-flower" class="obs-field-group" style="display:' + (currentObsParts.indexOf('flower') !== -1 ? 'block' : 'none') + ';">';
    html += '<div class="obs-group-header">🌸 花朵观察</div>';
    OBS_FLOWER.forEach(function(field) { html += renderChipField(field, ''); });
    html += '</div>';

    // 果实字段组
    html += '<div id="obs-group-fruit" class="obs-field-group" style="display:' + (currentObsParts.indexOf('fruit') !== -1 ? 'block' : 'none') + ';">';
    html += '<div class="obs-group-header">🍎 果实观察</div>';
    OBS_FRUIT.forEach(function(field) { html += renderChipField(field, ''); });
    html += '</div>';

    html += '<div class="form-row">';
    html += '<div class="form-group"><label class="form-label">发现日期</label><input type="date" class="form-input" id="f-date" value="' + new Date().toISOString().split('T')[0] + '"></div>';
    html += '<div class="form-group"><label class="form-label">发现地点</label><div class="input-with-voice"><input type="text" class="form-input" id="f-location" placeholder="选填">' + createVoiceBtn() + '</div></div>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label class="form-label">是什么吸引了我</label>';
    html += '<div class="input-with-voice"><textarea class="form-textarea" id="f-attraction" placeholder="记录你最初注意到它的原因...">' + '</textarea>' + createVoiceBtn() + '</div>';
    html += '</div>';

    html += '</div>'; // end step 1

    // ===== Step 2: 专业信息 =====
    html += '<div class="form-section">';
    html += '<div class="form-section-header">';
    html += '<span class="form-section-badge step-pro">收录</span>';
    html += '<span class="form-section-title">专业信息</span>';
    html += '<span class="form-section-hint">查阅资料后再补充，不着急</span>';
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

    html += '<div class="form-group">';
    html += '<label class="form-label">学习笔记</label>';
    html += '<div class="input-with-voice"><textarea class="form-textarea" id="f-notes" placeholder="深入了解后记录在这里...">' + '</textarea>' + createVoiceBtn() + '</div>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label class="form-label">我的思考</label>';
    html += '<div class="input-with-voice"><textarea class="form-textarea" id="f-thoughts" placeholder="你的感悟和联想...">' + '</textarea>' + createVoiceBtn() + '</div>';
    html += '</div>';

    html += '</div>'; // end step 2

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
      // 恢复观察部位选择
      if (record.observedParts && record.observedParts.length > 0) {
        record.observedParts.forEach(function(part) {
          if (currentObsParts.indexOf(part) === -1) {
            toggleObsPart(part);
          }
        });
      }
      // 恢复观察 chip 选中状态
      getAllObsFields().forEach(function(field) {
        if (record[field.id]) {
          var group = document.querySelector('.chip-group[data-field="' + field.id + '"]');
          if (group) {
            group.querySelectorAll('.obs-chip').forEach(function(chip) {
              chip.classList.toggle('active', chip.getAttribute('data-value') === record[field.id]);
            });
          }
        }
      });
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
      // 观察部位和字段
      record.observedParts = currentObsParts.slice();
      getAllObsFields().forEach(function(field) {
        record[field.id] = getChipVal(field.id);
      });
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

  // 仅保存观察（不需要专业信息）
  function saveObservation() {
    var name = getVal('f-name');
    if (!name) { alert('请输入植物名称'); return; }

    var status = 'observed';
    // 如果已是 complete，不降级
    if (editingId) {
      var existing = Storage.getById(editingId);
      if (existing && existing.status === 'complete') status = 'complete';
    }

    var record = {
      type: 'plant',
      status: status,
      tags: currentTags,
      links: currentLinks,
      date: getVal('f-date'),
      name: name,
      location: getVal('f-location'),
      attraction: getVal('f-attraction'),
      // 也保存用户可能已填的专业字段
      latinName: getVal('f-latinName'),
      family: getVal('f-family'),
      genus: getVal('f-genus'),
      features: getVal('f-features'),
      notes: getVal('f-notes'),
      thoughts: getVal('f-thoughts')
    };

    // 收集观察部位和 chip 选择
    record.observedParts = currentObsParts.slice();
    getAllObsFields().forEach(function(field) {
      record[field.id] = getChipVal(field.id);
    });

    // 照片处理（与 save 相同）
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
    var isObserved = record.status === 'observed';

    // 生成彩纸碎片
    var confettiHtml = '';
    var confettiColors = isObserved
      ? ['#b8d4a0', '#c8dec4', '#d4e8c0', '#e0f0d4', '#a8c890']
      : ['#7ba862', '#d4a0a0', '#e0b85c', '#8bb4c7', '#d4a373', '#b8d4a0', '#f0c8c8'];
    var confettiCount = isObserved ? 15 : 30;
    for (var i = 0; i < confettiCount; i++) {
      var color = confettiColors[i % confettiColors.length];
      var left = Math.random() * 100;
      var delay = Math.random() * 2;
      var size = 6 + Math.random() * 8;
      confettiHtml += '<div class="confetti-piece" style="left:' + left + '%;animation-delay:' + delay + 's;background:' + color + ';width:' + size + 'px;height:' + size + 'px;"></div>';
    }

    var html = '<div class="celebration-wrap">';
    html += '<div class="confetti-container">' + confettiHtml + '</div>';
    html += '<div class="celebration-content" style="padding-top:8px;">';
    html += '<div style="font-size:36px; margin-bottom:4px;">' + (isObserved ? '👀' : '🎉') + '</div>';
    html += '<div class="celebration-title">' + (isObserved ? '观察已记录' : '收录完成！') + '</div>';
    html += '<div class="celebration-subtitle">' + escapeHtml(name) + '</div>';
    html += '</div>';

    // AI 聊天入口（植物类型且有照片）— fallback，正常流程不经过这里
    if (record.type === 'plant' && record.id && record.photoIds && record.photoIds.length > 0) {
      html += '<button class="btn btn-primary btn-block" style="margin-top:12px; background:linear-gradient(135deg, #e0a060, #d4883a); border:none;" onclick="Chat.openChat(\'' + record.id + '\')">🤖 和AI聊聊这株植物</button>';
      html += '<div style="font-size:12px; color:var(--gray-400); margin-top:4px; text-align:center;">AI帮你识别植物、补全科属信息</div>';
    }

    // 卡片预览（Canvas 绘制）
    html += '<canvas id="share-card-canvas" width="540" height="720" style="display:none;"></canvas>';
    html += '<div class="share-card-preview" id="share-card-preview" style="margin-top:12px;"></div>';

    // 按钮
    html += '<div style="display:flex; gap:10px; margin-top:14px;">';
    html += '<button class="btn btn-primary btn-block" onclick="Form.downloadCard()">📷 保存卡片</button>';
    html += '<button class="btn btn-block" onclick="App.closeModal()">完成</button>';
    html += '</div>';
    html += '</div>';

    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-title').textContent = '';

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
    var statusText = record.status === 'observed' ? '已观察' : '已收录';
    var badgeText = typeIcon + ' ' + typeText + ' · ' + statusText;
    var badgeW = Math.max(140, badgeText.length * 12 + 24);
    ctx.fillStyle = typeColor;
    ctx.globalAlpha = 0.15;
    roundRect(ctx, W / 2 - badgeW / 2, yPos, badgeW, 32, 16);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = typeColor;
    ctx.font = '14px "Smiley Sans", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(badgeText, W / 2, yPos + 22);
    yPos += 68;

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
    if (record.type === 'plant' && record.status === 'observed') {
      // 已观察：显示观察数据
      var obsItems = [];
      // 新版字段
      if (record.growthForm) obsItems.push(record.growthForm);
      if (record.leafArrangement) obsItems.push('叶:' + record.leafArrangement);
      if (record.leafType) obsItems.push(record.leafType);
      if (record.petalCount) obsItems.push('花:' + record.petalCount);
      if (record.flowerSymmetry) obsItems.push(record.flowerSymmetry);
      if (record.fruitTexture) obsItems.push('果:' + record.fruitTexture);
      // 旧版字段兼容
      if (record.lifeForm && !record.growthForm) obsItems.push(record.lifeForm);
      if (record.leafStructure && !record.leafType) obsItems.push(record.leafStructure);
      if (record.flowerForm && !record.flowerCluster) obsItems.push(record.flowerForm);
      if (record.fruitType && !record.fruitTexture) obsItems.push('果:' + record.fruitType);
      if (obsItems.length > 0) {
        fields.push({ label: '观察', value: obsItems.join(' · ') });
      }
      if (record.location) fields.push({ label: '地点', value: record.location });
      if (record.attraction) fields.push({ label: '吸引我', value: record.attraction });
    } else if (record.type === 'plant') {
      // 已收录：显示专业信息
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
    ctx.fillText('🌱 野径手记', W / 2, H - 32);

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
    saveObservation: saveObservation,
    selectChip: selectChip,
    toggleObsPart: toggleObsPart,
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
    downloadCard: downloadCard,
    OBS_BASE: OBS_BASE,
    OBS_LEAF: OBS_LEAF,
    OBS_FLOWER: OBS_FLOWER,
    OBS_FRUIT: OBS_FRUIT,
    getAllObsFields: getAllObsFields,
    getChipVal: getChipVal,
    showCelebration: showCelebration
  };
})();
