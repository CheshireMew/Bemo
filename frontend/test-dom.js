import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // Wait for Vite server
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 5000 });
    
    // Check elements
    const cols = await page.$$('.heatmap-column');
    const cells = await page.$$('.heatmap-cell');
    
    console.log(`[DOM] Found ${cols.length} heatmap columns`);
    console.log(`[DOM] Found ${cells.length} heatmap cells`);
    
    if (cells.length > 0) {
      // Get computed styles of first cell
      const cellBox = await cells[0].boundingBox();
      console.log(`[DOM] Cell 0 bounding box:`, cellBox);
      
      const lastCell = cells[cells.length - 1];
      const lastCellBox = await lastCell.boundingBox();
      console.log(`[DOM] Last cell bounding box:`, lastCellBox);
      
      const container = await page.$('.heatmap');
      const containerBox = await container.boundingBox();
      console.log(`[DOM] Container bounding box:`, containerBox);
    }
  } catch (e) {
    console.log('Error hitting local server:', e.message);
  }
  
  await browser.close();
})();
