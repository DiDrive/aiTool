const { chromium } = require('C:/tmp/douyin-pw/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'zh-CN',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1365, height: 900 },
  });
  const page = await context.newPage();
  const responses = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (/aweme|video|douyin|item|detail|caption|subtitle/i.test(url)) {
      responses.push({ status: response.status(), url });
    }
  });

  await page.goto('https://www.douyin.com/video/7658279489474747898', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(12000);

  const closeSelectors = [
    'text=×',
    '[aria-label="关闭"]',
    '.dy-account-close',
    '.douyin-login__close',
    'svg:near(:text("登录后"))',
  ];
  for (const selector of closeSelectors) {
    try {
      const target = page.locator(selector).first();
      if (await target.isVisible({ timeout: 1000 })) {
        await target.click({ timeout: 3000 });
        break;
      }
    } catch {}
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(2000);

  for (let i = 0; i < 6; i++) {
    await page.screenshot({ path: `.firecrawl/douyin-frame-${i}.png`, fullPage: true });
    await page.mouse.click(520, 560).catch(() => {});
    await page.waitForTimeout(5000);
  }

  const data = await page.evaluate(() => {
    const meta = Array.from(document.querySelectorAll('meta')).map((m) => ({
      name: m.getAttribute('name'),
      property: m.getAttribute('property'),
      content: m.getAttribute('content'),
    }));
    return {
      url: location.href,
      title: document.title,
      meta,
      videos: Array.from(document.querySelectorAll('video')).map((video) => ({
        currentSrc: video.currentSrc,
        src: video.getAttribute('src'),
        duration: video.duration,
        currentTime: video.currentTime,
      })),
      text: document.body ? document.body.innerText.slice(0, 12000) : '',
      htmlSample: document.documentElement.outerHTML.slice(0, 4000),
    };
  });

  await page.screenshot({ path: '.firecrawl/douyin-video.png', fullPage: true });
  const result = { data, responses: responses.slice(-120) };
  require('fs').writeFileSync('.firecrawl/douyin-result.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
