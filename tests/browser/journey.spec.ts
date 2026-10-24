import { test, expect, type Page } from '@playwright/test';

async function mockWiki(page: Page) {
  await page.route('https://en.wikipedia.org/w/api.php**', async route => {
    const url=new URL(route.request().url());
    if(url.searchParams.get('action')==='parse') {
      const title=url.searchParams.get('page')||'World War II';
      await route.fulfill({json:{parse:{title,pageid:1,text:`<p>${title} connects to <a href="/wiki/Roman_Empire">Roman Empire</a> and <a href="/wiki/Cold_War">Cold War</a>.</p><h2>References</h2><p><a href="/wiki/Fake_citation">Citation</a></p>`}}});
    } else if(url.searchParams.get('list')==='search') {
      await route.fulfill({json:{query:{search:[{title:'Game theory',pageid:2,snippet:'The mathematics of choices.'}]}}});
    } else {
      const titles=(url.searchParams.get('titles')||'').split('|');
      await route.fulfill({json:{query:{pages:titles.map((title,index)=>({title,pageid:index+1,extract:`A short note about ${title}.`}))}}});
    }
  });
}

test.beforeEach(async ({page})=>mockWiki(page));

test('the page is one bento with stable, different tile sizes', async ({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'One thing leads to another.'})).toBeVisible();
  await expect(page.locator('main.bento > .brand-tile')).toBeVisible();
  await assertFilled(page);
  await expect(page.locator('.topbar,.intro,.viewport,.site-footer')).toHaveCount(0);
  const featured=await page.locator('[data-title="World War II"]').boundingBox();
  const standard=await page.locator('[data-title="MKUltra"]').boundingBox();
  expect(featured!.width*featured!.height).toBeGreaterThan(standard!.width*standard!.height*1.5);
  await page.screenshot({path:'test-results/bento-desktop.png',fullPage:true});
});

test('descends, reads inline, restores focus and returns through history', async ({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Explore World War II',exact:true}).click();
  await expect(page.locator('h1')).toHaveText('World War II');
  await expect(page.getByRole('button',{name:'Explore Roman Empire',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Explore Fake citation'})).toHaveCount(0);
  await page.getByRole('button',{name:'Read Roman Empire',exact:true}).click();
  await expect(page.locator('main.bento > .reading-tile #reader-title')).toHaveText('Roman Empire');
  await expect(page.locator('.reading-tile .article-body')).toContainText('connects to');
  await page.getByRole('button',{name:'Close article'}).click();
  await expect(page.getByRole('button',{name:'Read Roman Empire',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Explore Roman Empire',exact:true}).click();
  await expect(page.locator('h1')).toHaveText('Roman Empire');
  await page.getByRole('button',{name:'Up one level'}).click();
  await expect(page.locator('h1')).toHaveText('World War II');
  await expect(page.getByRole('button',{name:'Explore Roman Empire',exact:true})).toBeFocused();
  await page.goBack();
  await expect(page.locator('h1')).toHaveText('Roman Empire');
  await page.goForward();
  await expect(page.locator('h1')).toHaveText('World War II');
});

test('restores a direct trail, searches inside a tile, and supports keyboard navigation',async({page})=>{
  await page.goto('/?trail='+encodeURIComponent(JSON.stringify([null,'World War II','Roman Empire'])));
  await expect(page.locator('h1')).toHaveText('Roman Empire');
  await expect(page.getByRole('button',{name:'Explore Cold War',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Explore Cold War',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('h1')).toHaveText('Cold War');
  await page.keyboard.press('Escape');
  await expect(page.locator('h1')).toHaveText('Roman Empire');
  await page.getByLabel('Follow your curiosity').fill('game');
  await page.locator('.search-results button').click();
  await expect(page.locator('h1')).toHaveText('Game theory');
});

test('mobile keeps the grid and article within the viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.getByRole('button',{name:'Explore World War II',exact:true}).click();
  await page.getByRole('button',{name:'Read Roman Empire',exact:true}).click();
  await expect(page.locator('.reading-tile')).toBeVisible();
  await page.screenshot({path:'test-results/bento-mobile-reading.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('.reading-tile .article-body a').filter({hasText:'Cold War'}).click();
  await expect(page.locator('#reader-title')).toHaveText('Cold War');
  await page.getByRole('button',{name:'Explore this topic'}).click();
  await expect(page.locator('h1')).toHaveText('Cold War');
});

test('loading, error and empty connections are tiles',async({page})=>{
  let fail=true;
  await page.route(url=>url.searchParams.get('action')==='parse',async route=>{
    if(fail) await route.fulfill({status:503,body:'unavailable'});
    else await route.fulfill({json:{parse:{title:'World War II',text:'<p>No connections here.</p>'}}});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Explore World War II',exact:true}).click();
  await expect(page.locator('main > .message-tile')).toContainText('The thread slipped.');
  fail=false;
  await page.getByRole('button',{name:'Try again'}).click();
  await expect(page.locator('main > .message-tile')).toContainText('A quiet corner.');
});

test('motion cleans up after navigation and resize',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/');
  await page.getByRole('button',{name:'Explore World War II',exact:true}).click();
  await expect(page.locator('.transition-surface')).toHaveCount(1);
  await page.setViewportSize({width:1000,height:800});
  // Resizing cancels an expansion before it commits navigation.
  await page.getByRole('button',{name:'Explore World War II',exact:true}).click();
  await expect(page.locator('h1')).toHaveText('World War II');
  await expect(page.locator('.transition-surface')).toHaveCount(0);
  await page.getByRole('button',{name:'Up one level'}).click();
  await expect(page.locator('h1')).toHaveText('One thing leads to another.');
  await expect(page.locator('.transition-surface')).toHaveCount(0);
});

test('keeps tile geometry when delayed previews arrive and ignores stale navigation',async({page})=>{
  let release:()=>void=()=>{};
  const gate=new Promise<void>(resolve=>release=resolve);
  await page.route(url=>url.searchParams.get('prop')==='extracts|pageimages',async route=>{
    await gate;
    const titles=(new URL(route.request().url()).searchParams.get('titles')||'').split('|');
    await route.fulfill({json:{query:{pages:titles.map(title=>({title,extract:'A much longer preview description. '.repeat(40)}))}}});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Explore World War II',exact:true}).click();
  const tile=page.locator('[data-title="Roman Empire"]');
  await expect(tile).toBeVisible();
  const before=await tile.boundingBox();
  release();
  await expect(tile.locator('p')).toContainText('A much longer preview');
  const after=await tile.boundingBox();
  expect(after!.width).toBe(before!.width);
  expect(after!.height).toBe(before!.height);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.getByRole('button',{name:'Explore Roman Empire',exact:true}).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('h1')).toHaveText('World War II');
  await expect(page.locator('.transition-surface')).toHaveCount(0);
});

test('restores the parent page and keeps long titles usable on a small phone',async({page})=>{
  await page.setViewportSize({width:320,height:640});
  await page.goto('/');
  for(let i=0;i<5;i++) await page.getByRole('button',{name:'Next topics',exact:true}).click();
  const button=page.getByRole('button',{name:'Explore Gödel’s incompleteness theorems',exact:true});
  await expect(button).toBeVisible();
  await assertFilled(page);
  await button.click();
  await expect(page.locator('h1')).toHaveText('Gödel’s incompleteness theorems');
  await page.getByRole('button',{name:'Up one level'}).click();
  await expect(button).toBeFocused();
  await expect(page.locator('.pagination span')).toHaveText('6 / 6');
  await assertFilled(page);
});

async function assertFilled(page:Page) {
  const geometry=await page.evaluate(()=>{
    const grid=document.querySelector('main')!.getBoundingClientRect();
    const tiles=[...document.querySelectorAll('main > .bento-tile')].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
    const overlap=tiles.some((a,i)=>tiles.slice(i+1).some(b=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>.1 && Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>.1));
    return {height:grid.height,width:grid.width,vh:innerHeight,vw:innerWidth,area:tiles.reduce((sum,r)=>sum+r.w*r.h,0),overlap,overflow:document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth};
  });
  expect(geometry.height).toBe(geometry.vh);
  expect(geometry.width).toBe(geometry.vw);
  // Grid track boundaries are quantized to 1/64 CSS px by Chromium.
  expect(Math.abs(geometry.area-geometry.width*geometry.height)).toBeLessThan((geometry.width+geometry.height)/32);
  expect(geometry.overlap).toBe(false);
  expect(geometry.overflow).toBe(false);
}

for(const size of [{width:390,height:844},{width:844,height:390},{width:1440,height:900}]) {
  test(`fills every pixel at ${size.width}×${size.height} across paging and reading`,async({page})=>{
    await page.setViewportSize(size);
    await page.goto('/');
    await assertFilled(page);
    await page.screenshot({path:`test-results/bento-${size.width}.png`});
    await page.getByRole('button',{name:'Next topics',exact:true}).click();
    await assertFilled(page);
    await page.getByRole('button',{name:'Previous topics',exact:true}).click();
    await page.getByRole('button',{name:'Read World War II',exact:true}).click();
    await assertFilled(page);
    await expect(page.locator('.reading-tile .article-body')).toBeVisible();
    await page.screenshot({path:`test-results/reader-${size.width}.png`});
    await page.getByRole('button',{name:'Close article'}).click();
    await assertFilled(page);
  });
}

test('holds the selected topic through a deliberate expansion before revealing the next grid',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/');
  await page.getByRole('button',{name:'Explore World War II',exact:true}).click();
  await expect(page.locator('.transition-title')).toHaveText('World War II');
  const duration=await page.locator('.transition-surface').evaluate(el=>el.getAnimations()[0].effect?.getTiming().duration);
  expect(duration).toBe(620);
  await expect(page.locator('h1')).toHaveText('One thing leads to another.');
  await expect(page.locator('h1')).toHaveText('World War II');
  await expect(page.locator('.transition-surface')).toHaveCount(0);
  await assertFilled(page);
});
