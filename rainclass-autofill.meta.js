// ==UserScript==
// @name         雨课堂题干匹配填充（逐题提交）
// @namespace    local.rainclass.autofill
// @version      0.1.17
// @author       hrx0908
// @license      MIT; third-party content retains its original rights
// @homepageURL  https://github.com/hrx0908/rainclass-autofill
// @supportURL   https://github.com/hrx0908/rainclass-autofill/issues
// @updateURL    https://raw.githubusercontent.com/hrx0908/rainclass-autofill/main/rainclass-autofill.meta.js
// @downloadURL  https://raw.githubusercontent.com/hrx0908/rainclass-autofill/main/rainclass-autofill.user.js
// @description  支持人工智能安全与伦理、科研伦理与学术规范题库，按题干和选项匹配，跳过待核对题逐题提交。
// @match        https://www.yuketang.cn/ai-workspace/lms-graph/*/exercise/*
// @match        https://yuketang.cn/ai-workspace/lms-graph/*/exercise/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      www.cnblogs.com
// @connect      fe-static-yuketang.yuketang.cn
// @run-at       document-idle
// ==/UserScript==
