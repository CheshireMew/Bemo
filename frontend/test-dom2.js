import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // Wait for Vite server
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 5000 });
    
    // Check elements
    const cols = await page.$$('.heatmap-column');
    console.log(`[DOM] Found ${cols.length} heatmap columns`);
    
    if (cols.length > 0) {
      for (let i = 0; i < 2; i++) {
        const cells = await cols[i].$$('.heatmap-cell');
        console.log(`[DOM] Column ${i} has ${cells.length} cells`);
      }
      
      const lastCol = cols[cols.length - 1];
      const lastCells = await lastCol.$$('.heatmap-cell');
      console.log(`[DOM] Last Column has ${lastCells.length} cells`);
    } else {
        console.log("NO COLUMNS FOUND.");
        // let's grab the HTML of the heatmap section
        const section = await page.innerHTML('.heatmap');
        console.log(section);
    }
  } catch (e) {
    console.log('Error hitting local server:', e.message);
  }
  
  await browser.close();
})();
