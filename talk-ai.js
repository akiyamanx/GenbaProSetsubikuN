// ==========================================
// Gemini APIを使ったLINEトーク解析のAI処理
// 現場Pro 設備くん v0.50 - Phase5-1
// ==========================================

// Gemini Flash API（コスト最小）
var TALK_AI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// ==========================================
// メイン解析関数
// ==========================================

/**
 * LINEトークテキストをGemini APIで解析
 * @param {string} text - 会話テキスト
 * @param {string} genbaName - 現場名
 * @returns {Promise<object>} 解析結果（4カテゴリ）
 */
async function analyzeTalk(text, genbaName) {
  var prompt = buildTalkPrompt(text, genbaName);
  var responseText = await callTalkGeminiAPI(prompt);
  return parseTalkAIResponse(responseText);
}

// ==========================================
// プロンプト構築
// ==========================================

function buildTalkPrompt(text, genbaName) {
  var today = new Date().toISOString().split('T')[0];
  return 'あなたは建設現場の工程管理AIアシスタントです。\n' +
    '以下のLINEグループの会話テキストを解析して、工程管理に必要な情報を抽出してください。\n\n' +
    '【対象現場】' + (genbaName || '未指定') + '\n\n' +
    '【会話テキスト】\n' + text + '\n\n' +
    '【抽出ルール】\n' +
    '以下の4カテゴリに分類して、JSON形式で出力してください。\n\n' +
    '1. progress（進捗報告）: 完了した作業、進んでいる作業\n' +
    '2. problem（問題・トラブル）: 遅延、材料不足、不具合、天候問題など\n' +
    '3. schedule（予定・約束）: 「◯日に◯◯する」「いつまでに」「来週◯曜に」など日時の約束\n' +
    '4. movement（人の動き）: 誰がどこに行く、誰が来る、応援が来るなど\n\n' +
    '【出力JSON形式】（これ以外のテキストは出力しないでください）\n' +
    '{\n' +
    '  "progress": [\n' +
    '    {\n' +
    '      "summary": "2階の配管工事が完了",\n' +
    '      "detail": "田中さんが報告。給水管の接続まで終わった",\n' +
    '      "who": "田中",\n' +
    '      "date": "' + today + '",\n' +
    '      "confidence": "high"\n' +
    '    }\n' +
    '  ],\n' +
    '  "problem": [\n' +
    '    {\n' +
    '      "summary": "3階の排水管の部材が届いていない",\n' +
    '      "detail": "佐藤さんが指摘。発注済みだが納期未確認",\n' +
    '      "who": "佐藤",\n' +
    '      "severity": "medium",\n' +
    '      "confidence": "high"\n' +
    '    }\n' +
    '  ],\n' +
    '  "schedule": [\n' +
    '    {\n' +
    '      "summary": "来週月曜に3階の排水管工事開始",\n' +
    '      "detail": "部材到着次第、田中さんと佐藤さんで作業",\n' +
    '      "who": "田中, 佐藤",\n' +
    '      "date": "2026-02-10",\n' +
    '      "confidence": "medium"\n' +
    '    }\n' +
    '  ],\n' +
    '  "movement": [\n' +
    '    {\n' +
    '      "summary": "水曜に電気屋さんが来る",\n' +
    '      "detail": "3階の電気配線の立会い",\n' +
    '      "who": "電気屋（名前不明）",\n' +
    '      "date": "2026-02-12",\n' +
    '      "confidence": "medium"\n' +
    '    }\n' +
    '  ]\n' +
    '}\n\n' +
    '【重要な注意事項】\n' +
    '- 日付が曖昧な場合（「来週」「明日」等）は、今日の日付（' + today + '）を基準に推定してください\n' +
    '- 確信度（confidence）は high/medium/low の3段階で\n' +
    '- 該当する情報がないカテゴリは空配列 [] にしてください\n' +
    '- 会話の雑談部分（挨拶、絵文字のみ、業務と無関係な会話）は無視してください\n' +
    '- JSON以外のテキストは一切出力しないでください';
}

// ==========================================
// Gemini API呼び出し
// ==========================================

async function callTalkGeminiAPI(prompt) {
  var apiKey = getTalkApiKey();
  if (!apiKey) {
    throw new Error('Gemini APIキーが設定されていません。設定画面でAPIキーを入力してください。');
  }

  // API使用量チェック
  var check = canUseApi();
  if (!check.allowed) {
    throw new Error(check.reason);
  }

  var response = await fetch(TALK_AI_URL + '?key=' + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048
      }
    })
  });

  if (!response.ok) {
    var errText = '';
    try { errText = await response.text(); } catch(e) {}
    if (response.status === 400) {
      throw new Error('APIリクエストエラー。APIキーを確認してください。');
    } else if (response.status === 429) {
      throw new Error('API使用制限に達しました。しばらく待ってから再度お試しください。');
    }
    throw new Error('API Error: ' + response.status + ' ' + errText.substring(0, 100));
  }

  // API使用量を記録
  recordApiUsage();

  var data = await response.json();
  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    throw new Error('AIからの応答が空でした。テキストの内容を確認してください。');
  }
  return data.candidates[0].content.parts[0].text;
}

// ==========================================
// APIキー取得（LocalStorageのsettingsから）
// ==========================================

function getTalkApiKey() {
  try {
    var settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
    return settings.geminiApiKey || '';
  } catch (e) {
    console.error('[talk-ai] APIキー取得失敗:', e);
    return '';
  }
}

// ==========================================
// AIレスポンスのパース
// ==========================================

function parseTalkAIResponse(responseText) {
  try {
    var jsonStr = responseText;
    // ```json ... ``` で囲まれている場合に対応
    var jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    // ``` ... ``` で囲まれている場合にも対応
    if (!jsonMatch) {
      var codeMatch = responseText.match(/```\s*([\s\S]*?)\s*```/);
      if (codeMatch) {
        jsonStr = codeMatch[1];
      }
    }
    jsonStr = jsonStr.trim();

    var parsed = JSON.parse(jsonStr);

    // バリデーション：4カテゴリが存在するか確認
    var categories = ['progress', 'problem', 'schedule', 'movement'];
    for (var i = 0; i < categories.length; i++) {
      if (!Array.isArray(parsed[categories[i]])) {
        parsed[categories[i]] = [];
      }
    }

    return parsed;
  } catch (e) {
    console.error('[talk-ai] AIレスポンスのパースに失敗:', e);
    console.log('[talk-ai] 生テキスト:', responseText);
    return {
      progress: [],
      problem: [],
      schedule: [],
      movement: [],
      parseError: true,
      rawText: responseText
    };
  }
}

// ==========================================
// グローバル公開
// ==========================================
window.analyzeTalk = analyzeTalk;
window.buildTalkPrompt = buildTalkPrompt;
window.callTalkGeminiAPI = callTalkGeminiAPI;
window.getTalkApiKey = getTalkApiKey;
window.parseTalkAIResponse = parseTalkAIResponse;

console.log('[talk-ai.js] ✓ トーク解析AIモジュール読み込み完了');
