import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL('../plugins/english/Foxaholic[madara].ts', import.meta.url),
  'utf8',
);

const code = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;

function loadPlugin(mockHtml) {
  const exports = {};
  const dayjs = require('dayjs');
  const dayjsFn = dayjs.default || dayjs;
  if (!dayjsFn.default) dayjsFn.default = dayjsFn;
  const stubs = {
    '@libs/fetch': {
      fetchApi: async url => {
        return {
          ok: true,
          status: 200,
          url,
          text: async () => mockHtml,
        };
      },
    },
    '@libs/storage': { storage: { get: () => false } },
    '@libs/filterInputs': { FilterTypes: {} },
    '@libs/novelStatus': {
      NovelStatus: {
        Ongoing: 'Ongoing',
        Completed: 'Completed',
        Unknown: 'Unknown',
      },
    },
    '@libs/defaultCover': { defaultCover: 'default-cover.png' },
    dayjs: dayjsFn,
    cheerio: require('cheerio'),
  };

  runInNewContext(code, {
    exports,
    require: name => stubs[name] || require(name),
    URLSearchParams,
    setTimeout,
    FormData: class FormData {
      append() {
        return undefined;
      }
    },
  });

  return exports.default;
}

test('Madara multi-volume chapter ordering', async () => {
  const multiVolHtml = `
    <ul class="main version-chap volumns">
      <li class="parent has-child">
        <a href="javascript:void(0)" class="has-child">Volume 1</a>
        <ul class="sub-chap list-chap">
          <li>
            <ul class="sub-chap-list">
              <li class="wp-manga-chapter"><a href="https://example.com/novel/test/v1-ch3/">Chapter 3</a></li>
              <li class="wp-manga-chapter"><a href="https://example.com/novel/test/v1-ch2/">Chapter 2</a></li>
              <li class="wp-manga-chapter"><a href="https://example.com/novel/test/v1-ch1/">Chapter 1</a></li>
            </ul>
          </li>
        </ul>
      </li>
      <li class="parent has-child">
        <a href="javascript:void(0)" class="has-child">Volume 2</a>
        <ul class="sub-chap list-chap">
          <li>
            <ul class="sub-chap-list">
              <li class="wp-manga-chapter"><a href="https://example.com/novel/test/v2-ch6/">Chapter 6</a></li>
              <li class="wp-manga-chapter"><a href="https://example.com/novel/test/v2-ch5/">Chapter 5</a></li>
              <li class="wp-manga-chapter"><a href="https://example.com/novel/test/v2-ch4/">Chapter 4</a></li>
            </ul>
          </li>
        </ul>
      </li>
    </ul>
  `;

  const plugin = loadPlugin(multiVolHtml);
  const novel = await plugin.parseNovel('novel/test/');

  assert.equal(novel.chapters.length, 6);
  assert.equal(novel.chapters[0].name, 'Chapter 1');
  assert.equal(novel.chapters[0].chapterNumber, 1);
  assert.equal(novel.chapters[1].name, 'Chapter 2');
  assert.equal(novel.chapters[1].chapterNumber, 2);
  assert.equal(novel.chapters[2].name, 'Chapter 3');
  assert.equal(novel.chapters[2].chapterNumber, 3);
  assert.equal(novel.chapters[3].name, 'Chapter 4');
  assert.equal(novel.chapters[3].chapterNumber, 4);
  assert.equal(novel.chapters[4].name, 'Chapter 5');
  assert.equal(novel.chapters[4].chapterNumber, 5);
  assert.equal(novel.chapters[5].name, 'Chapter 6');
  assert.equal(novel.chapters[5].chapterNumber, 6);
});

test('Madara chapter order for flat non-volume novel', async () => {
  const flatHtml = `
    <ul class="main version-chap">
      <li class="wp-manga-chapter"><a href="https://example.com/novel/test/chapter-3/">Chapter 3</a></li>
      <li class="wp-manga-chapter"><a href="https://example.com/novel/test/chapter-2/">Chapter 2</a></li>
      <li class="wp-manga-chapter"><a href="https://example.com/novel/test/chapter-1/">Chapter 1</a></li>
    </ul>
  `;
  const plugin = loadPlugin(flatHtml);
  const novel = await plugin.parseNovel('novel/test/');

  assert.equal(novel.chapters.length, 3);
  assert.equal(novel.chapters[0].name, 'Chapter 1');
  assert.equal(novel.chapters[0].chapterNumber, 1);
  assert.equal(novel.chapters[1].name, 'Chapter 2');
  assert.equal(novel.chapters[1].chapterNumber, 2);
  assert.equal(novel.chapters[2].name, 'Chapter 3');
  assert.equal(novel.chapters[2].chapterNumber, 3);
});

test('Madara multi-volume chapter order with real Strange Grief fixture if present', async () => {
  const fixturePath = new URL(
    '../strange_grief_chapters.html',
    import.meta.url,
  );
  if (!existsSync(fixturePath)) return;

  const html = readFileSync(fixturePath, 'utf-8');
  const plugin = loadPlugin(html);
  const novel = await plugin.parseNovel(
    'novel/strange-grief-wants-to-retire-the-weakest-hunters-hero-dream/',
  );

  assert.equal(novel.chapters.length, 927);
  assert.equal(novel.chapters[0].name, 'SS1 - Tino Shade’s Creed');
  assert.equal(novel.chapters[0].chapterNumber, 1);
  assert.equal(novel.chapters[4].name, '1-23 - PDF Chapter 1-23 by Redhare404');
  assert.equal(novel.chapters[4].chapterNumber, 5);
  assert.equal(
    novel.chapters[5].name,
    '24-49 - PDF Chapter 24-49 by Redhare404',
  );
  assert.equal(novel.chapters[5].chapterNumber, 6);
  assert.equal(
    novel.chapters[novel.chapters.length - 1].name,
    "503.1 - Fox God's Shrine Maiden",
  );
  assert.equal(novel.chapters[novel.chapters.length - 1].chapterNumber, 927);
});
