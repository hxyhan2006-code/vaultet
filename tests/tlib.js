// helpers for driving the in-app dialogs (dialog.js) from Playwright
exports.watchNative = pg => { const st={n:0,msgs:[]}; pg.on('dialog', d => { st.n++; st.msgs.push(d.type()+': '+d.message().slice(0,60)); d.dismiss(); }); return st; };
exports.dlgOK = async (pg, fill={}) => {
  await pg.waitForSelector('.v-dlg',{timeout:4000});
  for (const [k,v] of Object.entries(fill)) {
    const sel = `.v-dlg [name="${k}"]`;
    const tag = await pg.$eval(sel, e => e.tagName);
    if (tag === 'SELECT') await pg.selectOption(sel, String(v)); else await pg.fill(sel, String(v));
  }
  const h = await pg.$('.v-dlg');
  await pg.click('.v-dlg-ok');
  await pg.waitForFunction(e => !e.isConnected, h, {timeout:4000});   // this dialog closed (a queued next one may already be open)
};
exports.dlgCancel = async pg => { await pg.waitForSelector('.v-dlg',{timeout:4000}); const h = await pg.$('.v-dlg'); await pg.click('.v-dlg-cancel'); await pg.waitForFunction(e => !e.isConnected, h, {timeout:4000}); };
exports.errShown = pg => pg.evaluate(() => [...document.querySelectorAll('.v-dlg-err')].some(e => !e.hidden));
exports.dlgChoose = async (pg, label) => { await pg.waitForSelector('.v-dlg',{timeout:4000}); const h = await pg.$('.v-dlg'); await pg.click(`.v-dlg-choice:has-text("${label}")`); await pg.waitForFunction(e => !e.isConnected, h, {timeout:4000}); };
exports.dlgText = async pg => { await pg.waitForSelector('.v-dlg',{timeout:4000}); return pg.textContent('.v-dlg'); };
