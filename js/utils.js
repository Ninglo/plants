// 公共工具函数 —— 各 IIFE 模块共享
(function() {
  'use strict';

  window.escapeHtml = function(text) {
    var div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  };

  window.escapeAttr = function(text) {
    return text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  };

  // 简单日期格式：YYYY/M/D（timeline 有自己的中文格式版本，不共用）
  window.formatDateSimple = function(isoString) {
    var d = new Date(isoString);
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  };
})();
