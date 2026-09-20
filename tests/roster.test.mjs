import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadAppApi() {
  const html = await readFile(path.join(repoRoot, 'index.html'), 'utf8');
  const scriptMatch = html.match(/<script>\s*([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, 'アプリ本体のscriptを読み込める');

  const exportHook = `
  globalThis.__testApi = {
    LOCAL_EXTRA_CHARACTERS,
    mergeLocalExtraCharacters,
    getDisplayName,
    getAutoTags,
    getRoleTag,
    getAfflatus,
    isReverie,
    avatarUrl,
  };
})();`;
  const instrumented = scriptMatch[1].replace(/\s*init\(\);\s*\}\)\(\);\s*$/, exportHook);
  assert.notEqual(instrumented, scriptMatch[1], 'テスト用の公開フックを挿入できる');

  const context = {
    console,
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    document: {},
    window: { devicePixelRatio: 1 },
    navigator: {},
    URL,
    Intl,
    Date,
    setTimeout,
    clearTimeout
  };
  vm.createContext(context);
  vm.runInContext(instrumented, context, { filename: 'index.html' });
  return context.__testApi;
}

const upstreamFixture = [
  {
    id: '315701',
    name: '纳西索斯',
    baseId: 3157,
    releaseOrder: 1,
    enabled: true,
    names: { 'zh-CN': '纳西索斯', 'en-US': 'Narcissus' },
    skins: [{ variantId: '315701', type: 'default' }],
    defaultVariant: '315701',
    isReleased: false
  },
  {
    id: '303701',
    name: '37',
    releaseOrder: 100,
    enabled: true,
    names: { 'en-US': '37', 'ja-JP': '37' },
    skins: [{ variantId: '303701', type: 'default' }],
    defaultVariant: '303701',
    rarity: 6,
    isReleased: true
  },
  {
    id: 'future-beryl-fixture',
    name: '贝丽尔',
    releaseOrder: 101,
    enabled: true,
    names: { 'en-US': 'Beryl', 'ja-JP': 'ベリル' },
    skins: [{ variantId: 'future-beryl-fixture', type: 'default' }],
    defaultVariant: 'future-beryl-fixture',
    rarity: 6,
    isReleased: false
  }
];

test('Ver3.9・Ver4.0の追加キャラを指定名と分類で返す', async () => {
  const api = await loadAppApi();
  const characters = api.mergeLocalExtraCharacters(upstreamFixture);
  const byName = name => characters.filter(character => api.getDisplayName(character) === name);

  const expectations = [
    ['ナルキッソス', 6, ['Beast'], 'アルティメット', 'ヒーラー'],
    ['SPリーリャ', 6, ['Star'], '追加行動', 'アタッカー'],
    ['ドレイク', 6, ['Beast'], '残光', 'サポーター'],
    ['グリンドル', 4, ['Beast'], null, 'サポーター']
  ];

  for (const [name, rarity, afflatus, concept, role] of expectations) {
    const matches = byName(name);
    assert.equal(matches.length, 1, `${name}は1人だけ返す`);
    const [character] = matches;
    assert.equal(character.rarity, rarity, `${name}のレアリティ`);
    assert.deepEqual(Array.from(api.getAfflatus(character)), afflatus, `${name}の本源`);
    assert.equal(api.getAutoTags(character)[0] || null, concept, `${name}の編成タグ`);
    assert.equal(api.getRoleTag(character), role, `${name}の役割タグ`);
    assert.equal(character.isReleased, false, `${name}を先行キャラとして扱う`);
  }
});

test('Ver4.0で実装決定した37とベリルを狂想対象として返す', async () => {
  const api = await loadAppApi();
  const characters = api.mergeLocalExtraCharacters(upstreamFixture);
  for (const englishName of ['37', 'Beryl']) {
    const character = characters.find(item => item.names?.['en-US'] === englishName);
    assert.ok(character, `${englishName}をテストデータから取得する`);
    assert.equal(api.isReverie(character), true, `${englishName}を狂想対象にする`);
  }
});

test('Ver4.0追加キャラのローカル画像が存在する', async () => {
  const api = await loadAppApi();
  const characters = api.mergeLocalExtraCharacters(upstreamFixture);
  for (const englishName of ['Huntsworn Lilya', 'Drake', 'Grindylow']) {
    const character = characters.find(item => item.names?.['en-US'] === englishName);
    assert.ok(character, `${englishName}を追加する`);
    const imagePath = api.avatarUrl(character);
    assert.match(imagePath, /^assets\/characters\/.+\.png$/, `${englishName}はローカル画像を使う`);
    await access(path.join(repoRoot, imagePath));
  }
});
