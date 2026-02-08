// ==========================================
// Gemini APIを使ったLINEトーク解析のAI処理
// 現場Pro 設備くん v0.51 - Phase5-1
// v0.51修正: LINEトーク実フォーマット対応・建設用語ヒント追加
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
// プロンプト構築（v0.51修正: LINEフォーマット対応）
// ==========================================

function buildTalkPrompt(text, genbaName) {
  var today = new Date().toISOString().split('T')[0];
  return 'あなたは建設現場の工程管理AIアシスタントです。\n' +
    '以下のLINEグループの会話テキストを解析して、工程管理に必要な情報を抽出してください。\n\n' +
    '【対象現場】' + (genbaName || '未指定') + '\n\n' +
    '【会話テキスト】\n' + text + '\n\n' +
    '【LINEトーク履歴のフォーマットについて】\n' +
    'LINEの「トーク履歴を送信」機能で出力されたテキストは以下の形式です：\n' +
    '- ヘッダー：[LINE] グループ名のトーク履歴 / 保存日時：YYYY/M/D H:mm\n' +
    '- 日付区切り：YYYY/M/D(曜日)\n' +
    '- メッセージ：HH:MM\t名前\t本文（タブ区切り）\n' +
    '- 複数行にわたるメッセージは次の「HH:MM\t名前」パターンが来るまで同一人物の発言\n' +
    '- システムメッセージ：「〇〇がアルバムを作成しました」等はスキップ\n\n' +
    'ただし、ユーザーが手入力でコピペした場合は上記フォーマットでない可能性もあります。\n' +
    'その場合も最善の判断で解析してください。\n\n' +
    '【抽出ルール】\n' +
    '以下の4カテゴリに分類して、JSON形式で出力してください。\n\n' +
    '1. progress（進捗報告）: 完了した作業、進んでいる作業\n' +
    '2. problem（問題・トラブル）: 遅延、材料不足、不具合、天候問題、懸念事項など\n' +
    '3. schedule（予定・約束）: 「◯日に◯◯する」「いつまでに」「◯日予定」など日時の約束\n' +
    '4. movement（人の動き）: 誰がどこに行く、誰が来る、応援が来る、立会いなど\n\n' +
    '【建設現場の用語ヒント】\n' +
    '- 切り回し = 既存配管の迂回・付け替え工事\n' +
    '- 先行配管 = 仕上げ前に先に配管を通す工事\n' +
    '- 現調 = 現場調査\n' +
    '- UB/ユニットバス = 浴室\n' +
    '- 防水パン = 洗濯機置き場の防水受け\n' +
    '- 追い焚き = 風呂の追い焚き配管\n' +
    '- ドレン = エアコンの排水管\n\n' +
    '【出力JSON形式】（これ以外のテキストは出力しないでください）\n' +
    '{\n' +
    '  "progress": [\n' +
    '    {\n' +
    '      "summary": "作業内容の要約",\n' +
    '      "detail": "詳細説明（誰が何を言ったか含む）",\n' +
    '      "who": "関係者名",\n' +
    '      "date": "YYYY-MM-DD（わかる場合）",\n' +
    '      "confidence": "high/medium/low"\n' +
    '    }\n' +
    '  ],\n' +
    '  "problem": [\n' +
    '    {\n' +
    '      "summary": "問題の要約",\n' +
    '      "detail": "詳細説明",\n' +
    '      "who": "報告者名",\n' +
    '      "severity": "high/medium/low",\n' +
    '      "confidence": "high/medium/low"\n' +
    '    }\n' +
    '  ],\n' +
    '  "schedule": [\n' +
    '    {\n' +
    '      "summary": "予定の要約",\n' +
    '      "detail": "詳細説明",\n' +
    '      "who": "関係者名",\n' +
    '      "date": "YYYY-MM-DD",\n' +
    '      "confidence": "high/medium/low"\n' +
    '    }\n' +
    '  ],\n' +
    '  "movement": [\n' +
    '    {\n' +
    '      "summary": "人の動きの要約",\n' +
    '      "detail": "詳細説明",\n' +
    '      "who": "人名",\n' +
    '      "date": "YYYY-MM-DD（わかる場合）",\n' +
    '      "confidence": "high/medium/low"\n' +
    '    }\n' +
    '  ]\n' +
    '}\n\n' +
    '【重要な注意事項】\n' +
    '- 日付が「15日」「19日」のように月が省略されている場合、会話の日付区切り（YYYY/M/D）を基準に推定してください\n' +
    '- 今日の日付は ' + today + ' です\n' +
    '- 確信度（confidence）は high/medium/low の3段階で\n' +
    '- 該当する情報がないカテゴリは空配列 [] にしてください\n' +
    '- 「〇〇がアルバムを作成しました」「〇〇がノートを作成しました」等のLINEシステムメッセージは無視\n' +
    '- 挨拶のみ、スタンプのみ、絵文字のみのメッセージは無視\n' +
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
        maxOutputTokens: 8192
      }
    })
  });

  if (!response.ok) {
    var errText = '';
    try { errText = await response.text(); } catch(e) {}
    // v0.51デバッグ用: ステータスコードとレスポンスボディをそのまま返す
    throw new Error('API Error [' + response.status + ']\n' + errText);
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
    let jsonStr = responseText;
    // 最初の { から最後の } までを抽出（```jsonなど余計な文字を全部無視）
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error('JSONが見つかりません');
    }
    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);

    const parsed = JSON.parse(jsonStr);
    const categories = ['progress', 'problem', 'schedule', 'movement'];
    for (const cat of categories) {
      if (!Array.isArray(parsed[cat])) {
        parsed[cat] = [];
      }
    }
    return parsed;
  } catch (e) {
    console.error('AIレスポンスのパースに失敗:', e);
    return {
      progress: [], problem: [], schedule: [], movement: [],
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

console.log('[talk-ai.js] ✓ トーク解析AIモジュール読み込み完了（v0.51 LINEフォーマット対応）');
