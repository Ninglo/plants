/* ========== 智能推荐引擎 ========== */
var Recommend = (function() {

  // 评分权重
  var WEIGHTS = {
    SHARED_TAG: 3,
    SAME_FAMILY: 2,
    SAME_GENUS: 3,
    NAME_IN_RELATED: 4,
    SAME_CATEGORY: 2
  };
  var MAX_RESULTS = 5;

  /**
   * 根据当前表单数据，推荐可能相关的已有记录
   * @param {Object} current - 当前表单数据 {type, tags, name, family, genus, title, category, relatedObjects}
   * @param {string} excludeId - 排除的记录ID（编辑时排除自身）
   * @returns {Array} [{record, score, reasons}] 按分数降序
   */
  function getRecommendations(current, excludeId) {
    var allRecords = Storage.getCompleted().filter(function(r) {
      return r.id !== excludeId;
    });

    var scored = [];

    allRecords.forEach(function(candidate) {
      var score = 0;
      var reasons = [];

      score += scoreSharedTags(current, candidate, reasons);
      score += scoreTaxonomy(current, candidate, reasons);
      score += scoreNameInRelated(current, candidate, reasons);
      score += scoreCategory(current, candidate, reasons);

      if (score > 0) {
        scored.push({ record: candidate, score: score, reasons: reasons });
      }
    });

    scored.sort(function(a, b) { return b.score - a.score; });
    return scored.slice(0, MAX_RESULTS);
  }

  // 共同标签评分
  function scoreSharedTags(current, candidate, reasons) {
    var currentTags = current.tags || [];
    var candidateTags = candidate.tags || [];
    if (currentTags.length === 0 || candidateTags.length === 0) return 0;

    var shared = [];
    currentTags.forEach(function(t) {
      if (candidateTags.indexOf(t) !== -1) shared.push(t);
    });

    if (shared.length > 0) {
      reasons.push('共同标签: ' + shared.join('、'));
      return shared.length * WEIGHTS.SHARED_TAG;
    }
    return 0;
  }

  // 科属分类评分
  function scoreTaxonomy(current, candidate, reasons) {
    var curFamily = current.family || '';
    var curGenus = current.genus || '';
    var candFamily = candidate.family || '';
    var candGenus = candidate.genus || '';

    // 同属优先于同科
    if (curGenus && candGenus && curGenus === candGenus) {
      reasons.push('同属: ' + curGenus);
      return WEIGHTS.SAME_GENUS;
    }
    if (curFamily && candFamily && curFamily === candFamily) {
      reasons.push('同科: ' + curFamily);
      return WEIGHTS.SAME_FAMILY;
    }
    return 0;
  }

  // 名字出现在关联对象中
  function scoreNameInRelated(current, candidate, reasons) {
    var score = 0;

    // 当前是植物，候选是生态关联 → 检查关联对象是否提及植物名
    if (current.type === 'plant' && current.name &&
        candidate.type === 'ecology' && candidate.relatedObjects) {
      if (candidate.relatedObjects.indexOf(current.name) !== -1) {
        reasons.push('被发现提及');
        score += WEIGHTS.NAME_IN_RELATED;
      }
    }

    // 当前是生态关联，候选是植物 → 检查关联对象是否包含植物名
    if (current.type === 'ecology' && current.relatedObjects &&
        candidate.type === 'plant' && candidate.name) {
      if (current.relatedObjects.indexOf(candidate.name) !== -1) {
        reasons.push('涉及对象: ' + candidate.name);
        score += WEIGHTS.NAME_IN_RELATED;
      }
    }

    return score;
  }

  // 同知识分类评分
  function scoreCategory(current, candidate, reasons) {
    if (current.type === 'knowledge' && candidate.type === 'knowledge' &&
        current.category && candidate.category &&
        current.category === candidate.category) {
      reasons.push('同分类: ' + current.category);
      return WEIGHTS.SAME_CATEGORY;
    }
    return 0;
  }

  return {
    getRecommendations: getRecommendations
  };
})();
